create or replace function public.create_curriculum_quiz(
  p_modules bigint[],
  p_num integer,
  p_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_allowed_types text[];
  v_modules bigint[];
  v_available_new integer;
  v_base integer;
  v_extra integer;
  v_final_questions jsonb := '[]'::jsonb;
  v_new_total integer := 0;
  v_quiz_id bigint;
  v_module_id bigint;
  v_limit integer;
  v_collected jsonb;
  v_module_new_ids bigint[];
  v_question_ids_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Not logged in';
  end if;
  if p_num is null or p_num <= 0 then
    raise exception 'Invalid quiz length';
  end if;

  v_allowed_types := case lower(p_type)
    when 'mcq' then array['mcq']::text[]
    when 'tf' then array['tf']::text[]
    when 'mcq_tf' then array['mcq', 'tf']::text[]
    else null
  end;
  if v_allowed_types is null then
    raise exception 'Invalid quiz type';
  end if;

  select array_agg(module_id order by module_id)
  into v_modules
  from (
    select distinct selected.module_id
    from unnest(p_modules) as selected(module_id)
    where selected.module_id is not null
  ) as selected_modules;

  if coalesce(cardinality(v_modules), 0) < 2 then
    raise exception 'Select at least two modules';
  end if;

  if (
    select count(*)
    from public.syllabus as syllabus
    where syllabus.id = any(v_modules)
  ) <> cardinality(v_modules) then
    raise exception 'One or more selected modules are unavailable';
  end if;

  if exists (
    select 1
    from public.syllabus as selected
    join public.syllabus as first_module
      on first_module.id = v_modules[1]
    where selected.id = any(v_modules)
      and (
        selected.course_name,
        selected.topic_name,
        selected.subtopic_name
      ) is distinct from (
        first_module.course_name,
        first_module.topic_name,
        first_module.subtopic_name
      )
  ) then
    raise exception 'Selected modules must be from the same course, topic, and subtopic';
  end if;

  insert into public.user_daily_new_questions (user_id, for_date, new_count)
  values (v_user_id, current_date, 0)
  on conflict (user_id, for_date) do nothing;

  select greatest(0, 25 - coalesce(daily.new_count, 0))
  into v_available_new
  from public.user_daily_new_questions as daily
  where daily.user_id = v_user_id
    and daily.for_date = current_date
  for update;

  v_base := p_num / cardinality(v_modules);
  v_extra := p_num % cardinality(v_modules);

  foreach v_module_id in array v_modules loop
    v_limit := v_base + case when v_extra > 0 then 1 else 0 end;
    v_extra := v_extra - 1;
    continue when v_limit <= 0;

    with eligible as materialized (
      select
        question.id,
        question.question_type,
        question.question_data,
        question.random_key
      from public.questions as question
      where question.module_id = v_module_id
        and question.question_type = any(v_allowed_types)
        and (
          (
            question.question_type = 'mcq'
            and nullif(btrim(question.question_data ->> 'question'), '') is not null
            and case
              when jsonb_typeof(question.question_data -> 'options') = 'array'
                then jsonb_array_length(question.question_data -> 'options') = 4
                  and not exists (
                    select 1
                    from jsonb_array_elements(
                      question.question_data -> 'options'
                    ) as option_value(value)
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
    ),
    due_questions as (
      select
        eligible.id,
        eligible.question_type,
        eligible.question_data,
        eligible.random_key,
        1 as priority
      from eligible
      join public.user_question_progress as progress
        on progress.question_id = eligible.id
       and progress.user_id = v_user_id
      where progress.next_review_date <= current_date
      order by eligible.random_key
      limit v_limit
    ),
    new_questions as (
      select
        eligible.id,
        eligible.question_type,
        eligible.question_data,
        eligible.random_key,
        2 as priority
      from eligible
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
      order by eligible.random_key
      limit least(v_limit, v_available_new)
    ),
    seen_questions as (
      select
        eligible.id,
        eligible.question_type,
        eligible.question_data,
        eligible.random_key,
        3 as priority
      from eligible
      join public.user_question_progress as progress
        on progress.question_id = eligible.id
       and progress.user_id = v_user_id
      where progress.first_seen is not null
      order by eligible.random_key
      limit v_limit
    ),
    candidates as (
      select * from due_questions
      union all
      select * from new_questions
      union all
      select * from seen_questions
    ),
    picked as (
      select distinct on (candidate.id)
        candidate.id,
        candidate.question_type,
        candidate.question_data,
        candidate.random_key,
        candidate.priority
      from candidates as candidate
      order by candidate.id, candidate.priority
    ),
    limited as (
      select
        picked.id,
        picked.question_type,
        picked.question_data,
        picked.random_key,
        picked.priority
      from picked
      order by picked.priority, picked.random_key
      limit v_limit
    ),
    payload as (
      select
        limited.id,
        limited.priority,
        limited.random_key,
        jsonb_strip_nulls(jsonb_build_object(
          'id', limited.id,
          'type', limited.question_type,
          'question', case
            when limited.question_type = 'mcq'
              then limited.question_data ->> 'question'
            else null
          end,
          'options', case
            when limited.question_type = 'mcq'
              then limited.question_data -> 'options'
            else '["T", "F"]'::jsonb
          end,
          'statement', case
            when limited.question_type = 'tf'
              then limited.question_data ->> 'statement'
            else null
          end
        )) as question_json
      from limited
    )
    select
      coalesce(
        jsonb_agg(payload.question_json order by payload.priority, payload.random_key),
        '[]'::jsonb
      ),
      array_agg(payload.id) filter (where payload.priority = 2)
    into v_collected, v_module_new_ids
    from payload;

    if coalesce(cardinality(v_module_new_ids), 0) > 0 then
      insert into public.user_question_progress as existing_progress (
        user_id,
        question_id,
        module_id,
        first_seen,
        next_review_date,
        interval_days
      )
      select
        v_user_id,
        new_question_id,
        v_module_id,
        current_date,
        current_date + 1,
        1
      from unnest(v_module_new_ids) as new_questions(new_question_id)
      on conflict (user_id, question_id)
      do update set first_seen = coalesce(
        existing_progress.first_seen,
        current_date
      );

      v_new_total := v_new_total + cardinality(v_module_new_ids);
      v_available_new := v_available_new - cardinality(v_module_new_ids);
    end if;

    v_final_questions := v_final_questions || coalesce(v_collected, '[]'::jsonb);
  end loop;

  if jsonb_array_length(v_final_questions) = 0 then
    raise exception 'No questions available in the selected modules';
  end if;

  if v_new_total > 0 then
    update public.user_daily_new_questions as daily
    set new_count = coalesce(daily.new_count, 0) + v_new_total
    where daily.user_id = v_user_id
      and daily.for_date = current_date;
  end if;

  select jsonb_agg((item.question_json ->> 'id')::bigint order by item.ordinality)
  into v_question_ids_json
  from jsonb_array_elements(v_final_questions)
    with ordinality as item(question_json, ordinality);

  insert into public.quizzes (
    user_id,
    quiz_type,
    total_questions,
    question_ids
  )
  values (
    v_user_id,
    lower(p_type),
    jsonb_array_length(v_final_questions),
    v_question_ids_json
  )
  returning id into v_quiz_id;

  return jsonb_build_object(
    'ok', true,
    'quiz_id', v_quiz_id,
    'questions', v_final_questions
  );
end;
$$;

revoke all on function public.create_curriculum_quiz(bigint[], integer, text)
  from public, anon;
grant execute on function public.create_curriculum_quiz(bigint[], integer, text)
  to authenticated;

notify pgrst, 'reload schema';
