alter table public.quizzes
  add column if not exists completed_at timestamptz,
  add column if not exists correct_answers integer not null default 0,
  add column if not exists questions_answered integer not null default 0,
  add column if not exists score numeric(5, 2),
  add column if not exists result_data jsonb;

create index if not exists quizzes_user_completed_idx
  on public.quizzes (user_id, completed_at desc)
  where completed_at is not null;

create or replace function public.submit_quiz_attempt_with_result(
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
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Not logged in';
  end if;

  v_result := public.submit_quiz_attempt(p_quiz_id, p_answers);

  update public.quizzes as quiz
  set
    completed_at = now(),
    correct_answers = (v_result ->> 'correct')::integer,
    questions_answered = (v_result ->> 'answered')::integer,
    score = (v_result ->> 'score')::numeric,
    result_data = v_result
  where quiz.id = p_quiz_id
    and quiz.user_id = v_user_id;

  if not found then
    raise exception 'Quiz not found';
  end if;

  return v_result;
end;
$$;

revoke all on function public.submit_quiz_attempt_with_result(bigint, jsonb)
  from public, anon;
grant execute on function public.submit_quiz_attempt_with_result(bigint, jsonb)
  to authenticated;

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
    and quiz.completed_at is not null;
$$;

revoke all on function public.get_my_quiz_count() from public, anon;
grant execute on function public.get_my_quiz_count() to authenticated;

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
  order by quiz.completed_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.get_my_quiz_history(integer) from public, anon;
grant execute on function public.get_my_quiz_history(integer) to authenticated;

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
    and quiz.result_data is not null;
$$;

revoke all on function public.get_my_quiz_review(bigint) from public, anon;
grant execute on function public.get_my_quiz_review(bigint) to authenticated;

notify pgrst, 'reload schema';
