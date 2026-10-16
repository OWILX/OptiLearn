create or replace function public.submit_quiz_attempt(
  p_quiz_id bigint,
  p_answers jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_question_ids jsonb;
  v_is_premium boolean := false;
  v_total integer;
  v_answer_count integer;
  v_rows jsonb;
  v_correct integer;
  v_answered integer;
begin
  if v_user_id is null then
    raise exception 'Not logged in';
  end if;
  if p_quiz_id is null then
    raise exception 'Quiz ID is required';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Quiz answers must be a JSON array';
  end if;

  select quiz.question_ids
  into v_question_ids
  from public.quizzes as quiz
  where quiz.id = p_quiz_id
    and quiz.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Quiz not found';
  end if;
  if jsonb_typeof(v_question_ids) is distinct from 'array' then
    raise exception 'Quiz question list is invalid';
  end if;

  select jsonb_array_length(v_question_ids)
  into v_total;

  select count(*)
  into v_answer_count
  from jsonb_to_recordset(p_answers) as submitted(question_id bigint, selected text);

  if v_answer_count <> v_total then
    raise exception 'Answer list does not match the quiz question list';
  end if;
  if exists (
    select 1
    from (
      select submitted.question_id, count(*) as occurrences
      from jsonb_to_recordset(p_answers)
        as submitted(question_id bigint, selected text)
      group by submitted.question_id
    ) as duplicates
    where duplicates.question_id is null
       or duplicates.occurrences <> 1
  ) then
    raise exception 'Quiz answers contain invalid or duplicate question IDs';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_answers)
      as submitted(question_id bigint, selected text)
    where not exists (
      select 1
      from jsonb_array_elements_text(v_question_ids) as quiz_question(id)
      where quiz_question.id = submitted.question_id::text
    )
  ) then
    raise exception 'Answer contains a question outside this quiz';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(v_question_ids) as quiz_question(id)
    where not exists (
      select 1
      from jsonb_to_recordset(p_answers)
        as submitted(question_id bigint, selected text)
      where submitted.question_id = quiz_question.id::bigint
    )
  ) then
    raise exception 'Answer list is missing quiz questions';
  end if;

  v_is_premium := coalesce(
    (
      select profile.premium
      from public.profiles as profile
      where profile.id = v_user_id
    ),
    false
  );

  with submitted as (
    select
      (answer.value ->> 'question_id')::bigint as question_id,
      upper(nullif(btrim(answer.value ->> 'selected'), '')) as selected,
      answer.ordinality
    from jsonb_array_elements(p_answers)
      with ordinality as answer(value, ordinality)
  ),
  graded as (
    select
      submitted.question_id,
      submitted.selected,
      submitted.ordinality,
      question.question_type,
      case
        when question.question_type = 'tf' then
          case upper(btrim(question.question_data ->> 'answer'))
            when 'TRUE' then 'T'
            when 'T' then 'T'
            when 'FALSE' then 'F'
            when 'F' then 'F'
            else null
          end
        else upper(btrim(question.question_data ->> 'answer'))
      end as correct_answer,
      question.question_data ->> 'explanation' as standard_explanation,
      case
        when v_is_premium then coalesce(question.premium_explanation, '')
        else ''
      end as premium_explanation
    from submitted
    join public.questions as question
      on question.id = submitted.question_id
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'question_id', graded.question_id,
          'correct_answer', graded.correct_answer,
          'selected', graded.selected,
          'verdict', case
            when graded.selected is null then 'skipped'
            when graded.selected = graded.correct_answer then 'correct'
            else 'wrong'
          end,
          'standard_explanation', coalesce(graded.standard_explanation, ''),
          'premium_explanation', graded.premium_explanation
        )
        order by graded.ordinality
      ),
      '[]'::jsonb
    ),
    count(*) filter (where graded.selected is not null)::integer,
    count(*) filter (
      where graded.selected is not null
        and graded.selected = graded.correct_answer
    )::integer
  into v_rows, v_answered, v_correct
  from graded;

  if jsonb_array_length(v_rows) <> v_total then
    raise exception 'One or more quiz questions are unavailable';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_rows) as row_data(value)
    where row_data.value ->> 'correct_answer' is null
  ) then
    raise exception 'One or more quiz questions have invalid answer keys';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_rows) as row_data(value)
    where row_data.value ->> 'selected' is not null
      and (
        (
          row_data.value ->> 'correct_answer' in ('A', 'B', 'C', 'D')
          and row_data.value ->> 'selected' not in ('A', 'B', 'C', 'D')
        )
        or (
          row_data.value ->> 'correct_answer' in ('T', 'F')
          and row_data.value ->> 'selected' not in ('T', 'F')
        )
      )
  ) then
    raise exception 'One or more selected answers are invalid';
  end if;

  insert into public.question_attempts (
    user_id,
    question_id,
    selected_answer,
    is_correct,
    time_spent_seconds,
    attempt_type
  )
  select
    v_user_id,
    answer.question_id,
    upper(btrim(answer.selected)),
    upper(btrim(answer.selected)) = grade.correct_answer,
    null,
    'quiz'
  from jsonb_to_recordset(p_answers)
    as answer(question_id bigint, selected text)
  join jsonb_to_recordset(v_rows)
    as grade(question_id bigint, correct_answer text)
    on grade.question_id = answer.question_id
  where nullif(btrim(answer.selected), '') is not null;

  return jsonb_build_object(
    'correct', v_correct,
    'answered', v_answered,
    'total', v_total,
    'score', case
      when v_answered = 0 then 0
      else round(v_correct::numeric * 100 / v_total, 2)
    end,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.submit_quiz_attempt(bigint, jsonb)
  from public, anon;
grant execute on function public.submit_quiz_attempt(bigint, jsonb)
  to authenticated;

notify pgrst, 'reload schema';