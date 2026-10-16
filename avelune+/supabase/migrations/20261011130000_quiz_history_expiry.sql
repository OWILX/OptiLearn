update public.quizzes
set history_expires_at = completed_at + interval '7 days'
where completed_at is not null
  and history_expires_at is null;

create or replace function public.get_my_quiz_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.quizzes as quiz
  where quiz.user_id = (select auth.uid())
    and quiz.completed_at is not null
    and quiz.history_expires_at > now();
$$;

create or replace function public.get_my_quiz_history(p_limit integer default 20)
returns table (
  quiz_id bigint,
  quiz_type text,
  total_questions integer,
  correct_answers integer,
  questions_answered integer,
  score numeric,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    quiz.id,
    quiz.quiz_type,
    quiz.total_questions,
    quiz.correct_answers,
    quiz.questions_answered,
    quiz.score,
    quiz.completed_at
  from public.quizzes as quiz
  where quiz.user_id = (select auth.uid())
    and quiz.completed_at is not null
    and quiz.history_expires_at > now()
  order by quiz.completed_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.get_my_quiz_review(p_quiz_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'quiz_id', quiz.id,
    'quiz_type', quiz.quiz_type,
    'total_questions', quiz.total_questions,
    'correct_answers', quiz.correct_answers,
    'questions_answered', quiz.questions_answered,
    'score', quiz.score,
    'completed_at', quiz.completed_at,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', question.id,
          'type', question.question_type,
          'question', case
            when question.question_type = 'mcq'
              then question.question_data ->> 'question'
            else null
          end,
          'statement', case
            when question.question_type = 'tf'
              then question.question_data ->> 'statement'
            else null
          end,
          'options', case
            when question.question_type = 'tf'
              then '["T", "F"]'::jsonb
            else question.question_data -> 'options'
          end,
          'answer', grade.value ->> 'correct_answer',
          'selected', grade.value ->> 'selected',
          'verdict', grade.value ->> 'verdict',
          'standardExplanation',
            coalesce(grade.value ->> 'standard_explanation', ''),
          'premiumExplanation',
            coalesce(grade.value ->> 'premium_explanation', '')
        )
        order by quiz_question.ordinality
      )
      from jsonb_array_elements_text(quiz.question_ids)
        with ordinality as quiz_question(question_id, ordinality)
      join public.questions as question
        on question.id = quiz_question.question_id::bigint
      left join lateral (
        select result_row.value
        from jsonb_array_elements(quiz.result_data -> 'rows')
          as result_row(value)
        where result_row.value ->> 'question_id' = quiz_question.question_id
        limit 1
      ) as grade on true
    ), '[]'::jsonb)
  )
  from public.quizzes as quiz
  where quiz.id = p_quiz_id
    and quiz.user_id = (select auth.uid())
    and quiz.completed_at is not null
    and quiz.result_data is not null
    and quiz.history_expires_at > now();
$$;

revoke all on function public.get_my_quiz_count() from public, anon;
revoke all on function public.get_my_quiz_history(integer) from public, anon;
revoke all on function public.get_my_quiz_review(bigint) from public, anon;
grant execute on function public.get_my_quiz_count() to authenticated;
grant execute on function public.get_my_quiz_history(integer) to authenticated;
grant execute on function public.get_my_quiz_review(bigint) to authenticated;

create extension if not exists pg_cron;

create or replace function public.delete_expired_quiz_history()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted bigint;
begin
  delete from public.quizzes
  where history_expires_at is not null
    and history_expires_at <= now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.delete_expired_quiz_history()
  from public, anon, authenticated;
grant execute on function public.delete_expired_quiz_history() to service_role;

do $$
declare
  v_job_id bigint;
begin
  select job.jobid
  into v_job_id
  from cron.job as job
  where job.jobname = 'delete-expired-quiz-history';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'delete-expired-quiz-history',
    '17 3 * * *',
    'select public.delete_expired_quiz_history();'
  );
end;
$$;

notify pgrst, 'reload schema';
