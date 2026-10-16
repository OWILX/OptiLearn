do $$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef(
    'public.create_curriculum_quiz(bigint[],integer,text)'::regprocedure
  );

  v_definition := regexp_replace(
    v_definition,
    'syllabus\.id\s*=\s*ANY\s*\(v_modules\)',
    'syllabus.module_id = ANY (v_modules)',
    'gi'
  );
  v_definition := regexp_replace(
    v_definition,
    'first_module\.id\s*=\s*v_modules\[1\]',
    'first_module.module_id = v_modules[1]',
    'gi'
  );
  v_definition := regexp_replace(
    v_definition,
    'selected\.id\s*=\s*ANY\s*\(v_modules\)',
    'selected.module_id = ANY (v_modules)',
    'gi'
  );

  if v_definition ~* 'syllabus\.id\s*=\s*ANY\s*\(v_modules\)'
    or v_definition ~* 'first_module\.id\s*=\s*v_modules\[1\]'
    or v_definition ~* 'selected\.id\s*=\s*ANY\s*\(v_modules\)' then
    raise exception
      'Could not update create_curriculum_quiz to use curriculum module IDs.';
  end if;

  execute v_definition;
end;
$$;

alter function public.create_curriculum_quiz(bigint[], integer, text)
  security definer;
alter function public.create_curriculum_quiz(bigint[], integer, text)
  set search_path = '';

revoke all on function public.create_curriculum_quiz(bigint[], integer, text)
  from public, anon;
grant execute on function public.create_curriculum_quiz(bigint[], integer, text)
  to authenticated;

notify pgrst, 'reload schema';
