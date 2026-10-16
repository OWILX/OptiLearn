create or replace function public.get_questions(p_syllabus_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_module_id bigint;
  v_tier text := 'free';
  v_daily_limit integer;
  v_used integer := 0;
  v_available_new integer;
  v_new_ids bigint[];
  v_questions jsonb;
  v_statements jsonb;
  v_is_premium boolean := false;
  v_has_unseen boolean;
  v_has_more boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not signed in';
  end if;
  if p_syllabus_id is null then
    raise exception 'Module ID is required';
  end if;

  select syllabus.module_id
  into v_module_id
  from public.syllabus as syllabus
  where syllabus.id = p_syllabus_id;

  if not found or v_module_id is null then
    raise exception 'Module not found';
  end if;

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

  select plan.study_new_daily_limit, plan.premium_explanations
  into v_daily_limit, v_is_premium
  from public.plan_catalog as plan
  where plan.tier_key = coalesce(v_tier, 'free');

  if v_daily_limit is null then
    raise exception 'Study-question plan configuration is unavailable';
  end if;

  select coalesce(usage.study_new_count, 0)
  into v_used
  from public.user_daily_usage as usage
  where usage.user_id = v_user_id
    and usage.for_date = current_date;

  v_available_new := greatest(0, v_daily_limit - coalesce(v_used, 0));

  with valid_questions as materialized (
    select question.id
    from public.questions as question
    where question.module_id = v_module_id
      and (
        (
          question.question_type = 'mcq'
          and nullif(btrim(question.question_data ->> 'question'), '') is not null
          and case
            when jsonb_typeof(question.question_data -> 'options') = 'array'
              then jsonb_array_length(question.question_data -> 'options') = 4
                and not exists (
                  select 1
                  from jsonb_array_elements(question.question_data -> 'options')
                    as option_value(value)
                  where jsonb_typeof(option_value.value) <> 'string'
                    or nullif(btrim(option_value.value #>> '{}'), '') is null
                )
            else false
          end
        )
        or (
          question.question_type = 'tf'
          and nullif(btrim(question.question_data ->> 'statement'), '') is not null
        )
      )
  )
  select array_agg(selected.id)
  into v_new_ids
  from (
    select eligible.id
    from valid_questions as eligible
    left join public.user_question_progress as progress
      on progress.question_id = eligible.id
     and progress.user_id = v_user_id
    where (progress.question_id is null or progress.first_seen is null)
      and not exists (
        select 1
        from public.user_question_progress as due_progress
        where due_progress.question_id = eligible.id
          and due_progress.user_id = v_user_id
          and due_progress.next_review_date <= current_date
      )
    order by random()
    limit v_available_new
  ) as selected;

  with valid_questions as materialized (
    select
      question.id,
      question.question_type,
      question.question_data,
      case
        when progress.next_review_date <= current_date then 1
        when question.id = any(coalesce(v_new_ids, array[]::bigint[])) then 2
        else 3
      end as priority
    from public.questions as question
    left join public.user_question_progress as progress
      on progress.question_id = question.id
     and progress.user_id = v_user_id
    where question.module_id = v_module_id
      and (
        (
          question.question_type = 'mcq'
          and nullif(btrim(question.question_data ->> 'question'), '') is not null
          and case
            when jsonb_typeof(question.question_data -> 'options') = 'array'
              then jsonb_array_length(question.question_data -> 'options') = 4
                and not exists (
                  select 1
                  from jsonb_array_elements(question.question_data -> 'options')
                    as option_value(value)
                  where jsonb_typeof(option_value.value) <> 'string'
                    or nullif(btrim(option_value.value #>> '{}'), '') is null
                )
            else false
          end
        )
        or (
          question.question_type = 'tf'
          and nullif(btrim(question.question_data ->> 'statement'), '') is not null
        )
      )
      and (
        progress.next_review_date <= current_date
        or progress.first_seen is not null
        or question.id = any(coalesce(v_new_ids, array[]::bigint[]))
      )
  ),
  payload as (
    select
      eligible.id,
      eligible.question_type,
      eligible.question_data,
      eligible.priority,
      jsonb_strip_nulls(jsonb_build_object(
        'id', eligible.id,
        'question', case
          when eligible.question_type = 'mcq'
            then eligible.question_data ->> 'question'
          else null
        end,
        'options', case
          when eligible.question_type = 'mcq'
            then eligible.question_data -> 'options'
          else '[]'::jsonb
        end,
        'answer', eligible.question_data ->> 'answer',
        'explanation', coalesce(
          case
            when v_is_premium then question.premium_explanation
            else eligible.question_data ->> 'explanation'
          end,
          ''
        )
      )) as question_json,
      jsonb_strip_nulls(jsonb_build_object(
        'id', eligible.id,
        'statement', case
          when eligible.question_type = 'tf'
            then eligible.question_data ->> 'statement'
          else null
        end,
        'answer', eligible.question_data ->> 'answer',
        'explanation', coalesce(
          case
            when v_is_premium then question.premium_explanation
            else eligible.question_data ->> 'explanation'
          end,
          ''
        )
      )) as statement_json
    from valid_questions as eligible
    join public.questions as question on question.id = eligible.id
  )
  select
    coalesce(
      jsonb_agg(payload.question_json order by payload.priority, random())
        filter (where payload.question_type = 'mcq'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(payload.statement_json order by payload.priority, random())
        filter (where payload.question_type = 'tf'),
      '[]'::jsonb
    )
  into v_questions, v_statements
  from payload;

  select exists (
    select 1
    from public.questions as question
    left join public.user_question_progress as progress
      on progress.question_id = question.id
     and progress.user_id = v_user_id
    where question.module_id = v_module_id
      and (
        (
          question.question_type = 'mcq'
          and nullif(btrim(question.question_data ->> 'question'), '') is not null
          and case
            when jsonb_typeof(question.question_data -> 'options') = 'array'
              then jsonb_array_length(question.question_data -> 'options') = 4
                and not exists (
                  select 1
                  from jsonb_array_elements(question.question_data -> 'options')
                    as option_value(value)
                  where jsonb_typeof(option_value.value) <> 'string'
                    or nullif(btrim(option_value.value #>> '{}'), '') is null
                )
            else false
          end
        )
        or (
          question.question_type = 'tf'
          and nullif(btrim(question.question_data ->> 'statement'), '') is not null
        )
      )
      and progress.first_seen is null
      and not coalesce(progress.next_review_date <= current_date, false)
      and not (
        question.id = any(coalesce(v_new_ids, array[]::bigint[]))
      )
  )
  into v_has_more;

  if jsonb_array_length(v_questions) = 0
    and jsonb_array_length(v_statements) = 0 then
    with valid_questions as (
      select question.id
      from public.questions as question
      where question.module_id = v_module_id
        and (
          (
            question.question_type = 'mcq'
            and nullif(btrim(question.question_data ->> 'question'), '') is not null
            and case
              when jsonb_typeof(question.question_data -> 'options') = 'array'
                then jsonb_array_length(question.question_data -> 'options') = 4
                  and not exists (
                    select 1
                    from jsonb_array_elements(question.question_data -> 'options')
                      as option_value(value)
                    where jsonb_typeof(option_value.value) <> 'string'
                      or nullif(btrim(option_value.value #>> '{}'), '') is null
                  )
              else false
            end
          )
          or (
            question.question_type = 'tf'
            and nullif(btrim(question.question_data ->> 'statement'), '') is not null
          )
        )
    )
    select exists (
      select 1
      from valid_questions as eligible
      where not exists (
        select 1
        from public.user_question_progress as progress
        where progress.question_id = eligible.id
          and progress.user_id = v_user_id
          and progress.first_seen is not null
      )
    )
    into v_has_unseen;

    if v_has_unseen and v_available_new <= 0 then
      return jsonb_build_object(
        'error_code', 'DAILY_STUDY_QUESTION_LIMIT_REACHED',
        'has_more', true
      );
    end if;
  end if;

  return jsonb_build_object(
    'questions', coalesce(v_questions, '[]'::jsonb),
    'statements', coalesce(v_statements, '[]'::jsonb),
    'has_more', v_has_more
  );
end;
$$;

create or replace function public.mark_study_question_viewed(
  p_syllabus_id bigint,
  p_question_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_module_id bigint;
  v_question_module_id bigint;
  v_tier text := 'free';
  v_daily_limit integer;
  v_used integer;
  v_first_seen date;
begin
  if v_user_id is null then
    raise exception 'Not signed in';
  end if;
  if p_syllabus_id is null or p_question_id is null then
    raise exception 'Syllabus and question IDs are required';
  end if;

  select syllabus.module_id
  into v_module_id
  from public.syllabus as syllabus
  where syllabus.id = p_syllabus_id;

  if not found or v_module_id is null then
    raise exception 'Module not found';
  end if;

  select question.module_id
  into v_question_module_id
  from public.questions as question
  where question.id = p_question_id;

  if not found or v_question_module_id <> v_module_id then
    raise exception 'Question does not belong to this module';
  end if;

  insert into public.user_daily_usage (user_id, for_date)
  values (v_user_id, current_date)
  on conflict (user_id, for_date) do nothing;

  select usage.study_new_count
  into v_used
  from public.user_daily_usage as usage
  where usage.user_id = v_user_id
    and usage.for_date = current_date
  for update;

  select progress.first_seen
  into v_first_seen
  from public.user_question_progress as progress
  where progress.user_id = v_user_id
    and progress.question_id = p_question_id
  for update;

  if v_first_seen is not null then
    return jsonb_build_object('ok', true, 'charged', false);
  end if;

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

  select plan.study_new_daily_limit
  into v_daily_limit
  from public.plan_catalog as plan
  where plan.tier_key = coalesce(v_tier, 'free');

  if v_daily_limit is null then
    raise exception 'Study-question plan configuration is unavailable';
  end if;

  if v_used >= v_daily_limit then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'DAILY_STUDY_QUESTION_LIMIT_REACHED'
    );
  end if;

  insert into public.user_question_progress as existing_progress (
    user_id,
    question_id,
    module_id,
    first_seen,
    next_review_date,
    interval_days,
    ease_factor,
    total_attempts,
    correct_streak,
    last_reviewed_date,
    mastery_score
  )
  values (
    v_user_id,
    p_question_id,
    v_module_id::integer,
    current_date,
    current_date + 1,
    1,
    2.5,
    0,
    0,
    current_date,
    0
  )
  on conflict (user_id, question_id)
  do update set
    module_id = excluded.module_id,
    first_seen = coalesce(existing_progress.first_seen, current_date);

  update public.user_daily_usage
  set study_new_count = study_new_count + 1
  where user_id = v_user_id
    and for_date = current_date;

  return jsonb_build_object('ok', true, 'charged', true);
end;
$$;

revoke all on function public.get_questions(bigint) from public, anon;
grant execute on function public.get_questions(bigint) to authenticated;
revoke all on function public.mark_study_question_viewed(bigint, bigint)
  from public, anon;
grant execute on function public.mark_study_question_viewed(bigint, bigint)
  to authenticated;

notify pgrst, 'reload schema';
