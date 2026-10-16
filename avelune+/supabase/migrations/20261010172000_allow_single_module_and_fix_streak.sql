do $$
declare
  v_quiz_definition text;
  v_module_guard text := 'coalesce(cardinality(v_modules), 0) < 2';
  v_module_error text := 'Select at least two modules';
begin
  v_quiz_definition := pg_get_functiondef(
    'public.create_curriculum_quiz(bigint[],integer,text)'::regprocedure
  );

  if position(v_module_guard in v_quiz_definition) = 0
    or position(v_module_error in v_quiz_definition) = 0 then
    raise exception
      'Could not locate the expected multiple-module validation in create_curriculum_quiz.';
  end if;

  v_quiz_definition := replace(
    v_quiz_definition,
    v_module_guard,
    'coalesce(cardinality(v_modules), 0) < 1'
  );
  v_quiz_definition := replace(
    v_quiz_definition,
    v_module_error,
    'Select at least one module'
  );
  execute v_quiz_definition;
end;
$$;

create or replace function public.bump_streak()
returns table (
  current_streak integer,
  longest_streak integer,
  last_activity_date date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to update a streak.';
  end if;

  insert into public.user_streaks as existing (
    user_id,
    current_streak,
    longest_streak,
    last_activity_date,
    updated_at
  )
  values ((select auth.uid()), 1, 1, today, now())
  on conflict (user_id) do update
  set
    current_streak = case
      when existing.last_activity_date = today then existing.current_streak
      when existing.last_activity_date = today - 1 then existing.current_streak + 1
      else 1
    end,
    longest_streak = greatest(
      existing.longest_streak,
      case
        when existing.last_activity_date = today then existing.current_streak
        when existing.last_activity_date = today - 1 then existing.current_streak + 1
        else 1
      end
    ),
    last_activity_date = today,
    updated_at = now()
  returning
    existing.current_streak,
    existing.longest_streak,
    existing.last_activity_date
  into current_streak, longest_streak, last_activity_date;

  return next;
end;
$$;

revoke all on function public.bump_streak() from public, anon;
grant execute on function public.bump_streak() to authenticated;

notify pgrst, 'reload schema';
