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
  v_available_new integer;
  v_new_ids bigint[];
  v_questions jsonb;
  v_statements jsonb;
  v_is_premium boolean := false;
  v_has_unseen boolean;
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

  select
    plan.study_new_daily_limit,
    plan.premium_explanations
  into v_daily_limit, v_is_premium
  from public.plan_catalog as plan
  where plan.tier_key = coalesce(v_tier, 'free');

  insert into public.user_daily_usage (user_id, for_date)
  values (v_user_id, current_date)
  on conflict (user_id, for_date) do nothing;

  select greatest(0, v_daily_limit - usage.study_new_count)
  into v_available_new
  from public.user_daily_usage as usage
  where usage.user_id = v_user_id
    and usage.for_date = current_date
  for update;

  with eligible as materialized (
    select question.id, question.random_key
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
  select array_agg(selected.id order by selected.random_key)
  into v_new_ids
  from (
    select eligible.id, eligible.random_key
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
    limit v_available_new
  ) as selected;

  if coalesce(cardinality(v_new_ids), 0) > 0 then
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
    select
      v_user_id,
      question_id,
      v_module_id::integer,
      current_date,
      current_date + 1,
      1,
      2.5,
      0,
      0,
      current_date,
      0
    from unnest(v_new_ids) as selected(question_id)
    on conflict (user_id, question_id)
    do update set first_seen = coalesce(existing_progress.first_seen, current_date);

    update public.user_daily_usage
    set study_new_count = study_new_count + cardinality(v_new_ids)
    where user_id = v_user_id and for_date = current_date;
  end if;

  with eligible as materialized (
    select
      question.id,
      question.question_type,
      question.question_data,
      question.random_key,
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
        or question.id = any(coalesce(v_new_ids, array[]::bigint[]))
        or progress.first_seen is not null
      )
  ),
  payload as (
    select
      eligible.id,
      eligible.question_type,
      eligible.question_data,
      eligible.random_key,
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
    from eligible
    join public.questions as question on question.id = eligible.id
  )
  select
    coalesce(
      jsonb_agg(payload.question_json order by payload.priority, payload.random_key)
        filter (where payload.question_type = 'mcq'),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(payload.statement_json order by payload.priority, payload.random_key)
        filter (where payload.question_type = 'tf'),
      '[]'::jsonb
    )
  into v_questions, v_statements
  from payload;

  if jsonb_array_length(v_questions) = 0
    and jsonb_array_length(v_statements) = 0 then
    with eligible as (
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
    )
    select exists (
      select 1
      from eligible
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
        'error_code', 'DAILY_STUDY_QUESTION_LIMIT_REACHED'
      );
    end if;
  end if;

  return jsonb_build_object(
    'questions', coalesce(v_questions, '[]'::jsonb),
    'statements', coalesce(v_statements, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_questions(bigint) from public, anon;
grant execute on function public.get_questions(bigint) to authenticated;

notify pgrst, 'reload schema';
