alter table public.questions enable row level security;

drop policy if exists "Authenticated users can read questions"
  on public.questions;
create policy "Authenticated users can read questions"
  on public.questions
  for select
  to authenticated
  using (true);

alter table public.quizzes enable row level security;

drop policy if exists "Users can access their own quizzes"
  on public.quizzes;
create policy "Users can access their own quizzes"
  on public.quizzes
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.user_daily_new_questions enable row level security;

drop policy if exists "Users can access their own daily question usage"
  on public.user_daily_new_questions;
create policy "Users can access their own daily question usage"
  on public.user_daily_new_questions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.user_question_progress enable row level security;

drop policy if exists "Users can access their own question progress"
  on public.user_question_progress;
create policy "Users can access their own question progress"
  on public.user_question_progress
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
