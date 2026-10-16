do $$
declare
  v_definition text;
  v_syllabus_id_check text := 'syllabus.id = any(v_modules)';
  v_first_module_join text := 'first_module.id = v_modules[1]';
  v_selected_id_check text := 'selected.id = any(v_modules)';
begin
  v_definition := pg_get_functiondef(
    'public.create_curriculum_quiz(bigint[],integer,text)'::regprocedure
  );

  if position(v_syllabus_id_check in v_definition) = 0
    or position(v_first_module_join in v_definition) = 0
    or position(v_selected_id_check in v_definition) = 0 then
    raise exception
      'Could not locate the expected syllabus ID checks in create_curriculum_quiz.';
  end if;

  v_definition := replace(
    v_definition,
    v_syllabus_id_check,
    'syllabus.module_id = any(v_modules)'
  );
  v_definition := replace(
    v_definition,
    v_first_module_join,
    'first_module.module_id = v_modules[1]'
  );
  v_definition := replace(
    v_definition,
    v_selected_id_check,
    'selected.module_id = any(v_modules)'
  );

  execute v_definition;
end;
$$;

notify pgrst, 'reload schema';
