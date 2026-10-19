-- Personalized quizzes generated from study notes (Plus/Pro only).
-- This uses a dedicated daily allowance: one credit per generated question,
-- separate from the Ask-AI allowance.

alter table public.plan_catalog
  add column if not exists generated_question_daily_limit integer
    not null default 0
    check (generated_question_daily_limit >= 0);

update public.plan_catalog
set generated_question_daily_limit = case tier_key
  when 'free' then 0
  when 'plus' then 20
  when 'pro' then 50
  else generated_question_daily_limit
end
where tier_key in ('free', 'plus', 'pro');

alter table public.user_daily_usage
  add column if not exists generated_question_count integer
    not null default 0
    check (generated_question_count >= 0);

create table if not exists public.generated_quizzes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subtopic_id bigint,
  note_slug text,
  note_title text not null,
  course_name text not null default '',
  topic_name text not null default '',
  subtopic_name text not null default '',
  question_type text not null default 'mcq'
    check (question_type in ('mcq', 'tf', 'mcq_tf')),
  total_questions integer not null check (total_questions between 1 and 25),
  questions jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  correct_answers integer not null default 0,
  questions_answered integer not null default 0,
  score numeric,
  result_data jsonb,
  history_expires_at timestamptz
);

create index if not exists generated_quizzes_user_created_idx
  on public.generated_quizzes (user_id, created_at desc);

alter table public.generated_quizzes enable row level security;

-- No direct table access: `questions` contains the answer key, so every read
-- goes through the security-definer RPCs below, which hide answers until the
-- quiz has been submitted.
revoke all on public.generated_quizzes from anon, authenticated;

-- Reserve up to `p_count` generated-question credits. Returns the number
-- actually granted so a request can be clamped to the remaining allowance.
create or replace function public.reserve_generated_question_usage(
  p_user_id uuid,
  p_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text := 'free';
  v_limit integer := 0;
  v_usage public.user_daily_usage%rowtype;
  v_granted integer := 0;
begin
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;
  if p_count is null or p_count < 1 or p_count > 25 then
    raise exception 'Invalid question count';
  end if;

  select subscription.tier_key
  into v_tier
  from public.user_subscriptions as subscription
  where subscription.user_id = p_user_id
    and subscription.status = 'active'
    and (
      subscription.current_period_end is null
      or subscription.current_period_end > now()
    )
  limit 1;

  v_tier := coalesce(v_tier, 'free');

  select plan.generated_question_daily_limit
  into v_limit
  from public.plan_catalog as plan
  where plan.tier_key = v_tier;

  insert into public.user_daily_usage (user_id, for_date)
  values (p_user_id, current_date)
  on conflict (user_id, for_date) do nothing;

  select * into v_usage
  from public.user_daily_usage
  where user_id = p_user_id and for_date = current_date
  for update;

  if coalesce(v_limit, 0) <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'plan_required',
      'tier', v_tier,
      'used', v_usage.generated_question_count,
      'limit', 0,
      'granted', 0
    );
  end if;

  if v_usage.generated_question_count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'tier', v_tier,
      'used', v_usage.generated_question_count,
      'limit', v_limit,
      'granted', 0
    );
  end if;

  v_granted := least(p_count, v_limit - v_usage.generated_question_count);

  update public.user_daily_usage
  set generated_question_count = generated_question_count + v_granted
  where user_id = p_user_id and for_date = current_date
  returning * into v_usage;

  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'tier', v_tier,
    'used', v_usage.generated_question_count,
    'limit', v_limit,
    'granted', v_granted
  );
end;
$$;

create or replace function public.refund_generated_question_usage(
  p_user_id uuid,
  p_count integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_daily_usage
  set generated_question_count = greatest(
    0,
    generated_question_count - greatest(coalesce(p_count, 0), 0)
  )
  where user_id = p_user_id and for_date = current_date;
$$;

revoke all on function public.reserve_generated_question_usage(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.refund_generated_question_usage(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_generated_question_usage(uuid, integer)
  to service_role;
grant execute on function public.refund_generated_question_usage(uuid, integer)
  to service_role;

-- Grade and persist a generated quiz. Answers stay server-side until here.
create or replace function public.submit_generated_quiz(
  p_quiz_id bigint,
  p_answers jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quiz public.generated_quizzes%rowtype;
  v_question jsonb;
  v_answer jsonb;
  v_selected text;
  v_correct text;
  v_verdict text;
  v_rows jsonb := '[]'::jsonb;
  v_correct_count integer := 0;
  v_answered integer := 0;
  v_total integer;
  v_score numeric := 0;
  v_retention integer := 7;
  v_tier text := 'free';
begin
  if v_user_id is null then
    raise exception 'Not logged in';
  end if;

  select * into v_quiz
  from public.generated_quizzes
  where id = p_quiz_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Quiz not found';
  end if;

  v_total := jsonb_array_length(v_quiz.questions);

  select subscription.tier_key
  into v_tier
  from public.user_subscriptions as subscription
  where subscription.user_id = v_user_id
    and subscription.status = 'active'
    and (
      subscription.current_period_end is null
      or subscription.current_period_end > now()
    )
  limit 1;

  v_tier := coalesce(v_tier, 'free');

  select plan.history_retention_days
  into v_retention
  from public.plan_catalog as plan
  where plan.tier_key = v_tier;

  v_retention := coalesce(v_retention, 7);

  for v_question in
    select question.value from jsonb_array_elements(v_quiz.questions)
      as question(value)
  loop
    v_correct := v_question ->> 'answer';
    v_selected := null;

    select answer.value
    into v_answer
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
      as answer(value)
    where (answer.value ->> 'question_id')::bigint
      = (v_question ->> 'id')::bigint
    limit 1;

    if v_answer is not null
      and nullif(btrim(v_answer ->> 'selected'), '') is not null
    then
      v_selected := btrim(v_answer ->> 'selected');
    end if;

    if v_selected is null then
      v_verdict := 'skipped';
    elsif upper(v_selected) = upper(v_correct) then
      v_verdict := 'correct';
      v_correct_count := v_correct_count + 1;
      v_answered := v_answered + 1;
    else
      v_verdict := 'wrong';
      v_answered := v_answered + 1;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'question_id', (v_question ->> 'id')::bigint,
      'correct_answer', v_correct,
      'selected', v_selected,
      'verdict', v_verdict,
      'standard_explanation', coalesce(v_question ->> 'explanation', ''),
      'premium_explanation', ''
    ));
  end loop;

  v_score := case
    when v_total > 0
      then round((v_correct_count::numeric / v_total::numeric) * 100, 2)
    else 0
  end;

  update public.generated_quizzes
  set completed_at = now(),
      correct_answers = v_correct_count,
      questions_answered = v_answered,
      score = v_score,
      result_data = jsonb_build_object('rows', v_rows),
      history_expires_at =
        now() + (v_retention::text || ' days')::interval
  where id = v_quiz.id;

  return jsonb_build_object(
    'quiz_id', v_quiz.id,
    'total', v_total,
    'correct', v_correct_count,
    'answered', v_answered,
    'score', v_score,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.submit_generated_quiz(bigint, jsonb)
  from public, anon;
grant execute on function public.submit_generated_quiz(bigint, jsonb)
  to authenticated;

create or replace function public.get_my_generated_quizzes(
  p_limit integer default 20
)
returns table (
  quiz_id bigint,
  note_slug text,
  note_title text,
  course_name text,
  topic_name text,
  subtopic_name text,
  question_type text,
  total_questions integer,
  correct_answers integer,
  questions_answered integer,
  score numeric,
  created_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    quiz.id,
    quiz.note_slug,
    quiz.note_title,
    quiz.course_name,
    quiz.topic_name,
    quiz.subtopic_name,
    quiz.question_type,
    quiz.total_questions,
    quiz.correct_answers,
    quiz.questions_answered,
    quiz.score,
    quiz.created_at,
    quiz.completed_at
  from public.generated_quizzes as quiz
  where quiz.user_id = (select auth.uid())
    and (
      quiz.history_expires_at is null
      or quiz.history_expires_at > now()
    )
  order by quiz.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.get_my_generated_quiz(p_quiz_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'quiz_id', quiz.id,
    'note_slug', quiz.note_slug,
    'note_title', quiz.note_title,
    'course_name', quiz.course_name,
    'topic_name', quiz.topic_name,
    'subtopic_name', quiz.subtopic_name,
    'question_type', quiz.question_type,
    'total_questions', quiz.total_questions,
    'correct_answers', quiz.correct_answers,
    'questions_answered', quiz.questions_answered,
    'score', quiz.score,
    'created_at', quiz.created_at,
    'completed_at', quiz.completed_at,
    'questions', coalesce((
      select jsonb_agg(
        case
          when quiz.completed_at is null then
            question.value - 'answer' - 'explanation'
          else
            question.value || jsonb_build_object(
              'selected', grade.value ->> 'selected',
              'verdict', grade.value ->> 'verdict'
            )
        end
        order by (question.value ->> 'id')::integer
      )
      from jsonb_array_elements(quiz.questions) as question(value)
      left join lateral (
        select result_row.value
        from jsonb_array_elements(
          coalesce(quiz.result_data -> 'rows', '[]'::jsonb)
        ) as result_row(value)
        where (result_row.value ->> 'question_id')::bigint
          = (question.value ->> 'id')::bigint
        limit 1
      ) as grade on true
    ), '[]'::jsonb)
  )
  from public.generated_quizzes as quiz
  where quiz.id = p_quiz_id
    and quiz.user_id = (select auth.uid())
    and (
      quiz.history_expires_at is null
      or quiz.history_expires_at > now()
    );
$$;

revoke all on function public.get_my_generated_quizzes(integer)
  from public, anon;
revoke all on function public.get_my_generated_quiz(bigint)
  from public, anon;
grant execute on function public.get_my_generated_quizzes(integer)
  to authenticated;
grant execute on function public.get_my_generated_quiz(bigint)
  to authenticated;

create or replace function public.get_my_plan_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tier text := 'free';
  v_usage public.user_daily_usage%rowtype;
  v_plan public.plan_catalog%rowtype;
  v_intro_seen timestamptz;
  v_pending_tier text;
  v_pending_requested_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not logged in';
  end if;

  select
    subscription.tier_key,
    subscription.pending_tier_key,
    subscription.pending_tier_requested_at
  into v_tier, v_pending_tier, v_pending_requested_at
  from public.user_subscriptions as subscription
  where subscription.user_id = v_user_id
    and subscription.status = 'active'
    and (
      subscription.current_period_end is null
      or subscription.current_period_end > now()
    )
  limit 1;

  v_tier := coalesce(v_tier, 'free');

  select * into v_plan
  from public.plan_catalog
  where tier_key = v_tier;

  insert into public.user_daily_usage (user_id, for_date)
  values (v_user_id, current_date)
  on conflict (user_id, for_date) do nothing;

  select * into v_usage
  from public.user_daily_usage
  where user_id = v_user_id and for_date = current_date;

  select profile.plan_intro_seen_at
  into v_intro_seen
  from public.profiles as profile
  where profile.id = v_user_id;

  return jsonb_build_object(
    'tier', v_plan.tier_key,
    'display_name', v_plan.display_name,
    'monthly_price_ngn', v_plan.monthly_price_ngn,
    'quiz_new_daily_limit', v_plan.quiz_new_daily_limit,
    'study_new_daily_limit', v_plan.study_new_daily_limit,
    'ai_daily_limit', v_plan.ai_daily_limit,
    'generated_question_daily_limit', v_plan.generated_question_daily_limit,
    'history_retention_days', v_plan.history_retention_days,
    'premium_explanations', v_plan.premium_explanations,
    'quiz_new_used', v_usage.quiz_new_count,
    'study_new_used', v_usage.study_new_count,
    'ai_used', v_usage.ai_count,
    'generated_question_used', v_usage.generated_question_count,
    'plan_intro_seen_at', v_intro_seen,
    'pending_tier', v_pending_tier,
    'pending_tier_requested_at', v_pending_requested_at
  );
end;
$$;

revoke all on function public.get_my_plan_summary() from public, anon;
grant execute on function public.get_my_plan_summary() to authenticated;

create or replace function public.delete_expired_generated_quizzes()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.generated_quizzes
  where history_expires_at is not null
    and history_expires_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_expired_generated_quizzes()
  from public, anon, authenticated;
grant execute on function public.delete_expired_generated_quizzes()
  to service_role;

create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select job.jobid
  into v_job_id
  from cron.job as job
  where job.jobname = 'delete-expired-generated-quizzes';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'delete-expired-generated-quizzes',
    '27 3 * * *',
    'select public.delete_expired_generated_quizzes();'
  );
end;
$$;

notify pgrst, 'reload schema';
