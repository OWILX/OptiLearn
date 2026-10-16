# Avelune+ authentication setup

Avelune+ uses its own Supabase project so university users and data remain
separate from Avelune. Do not use the matriculation app's project credentials.

## Local configuration

1. Create `avelune+/.env.local` from `.env.example`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Avelune+
   Supabase project's URL and publishable/anon key.
3. Restart the Vite dev server after changing environment variables.

Never put a Supabase service-role key in a `VITE_` variable or in this client
application.

## Netlify production configuration

`netlify.toml` configures the production build (`npm run build`), publishes
`dist/`, and routes client-side paths back to the app. Set these variables in
the Netlify site's production environment before deploying:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or the project's publishable key)

These are public client credentials protected by RLS. Never add a Supabase
service-role key or a Paystack secret to a `VITE_` variable.

## Dashboard database

Apply the Avelune+ migrations in timestamp order to the Avelune+ Supabase
project (for example, through that project's SQL Editor):

1. `supabase/migrations/20261009120000_dashboard_backend.sql` provisions
   `concept_posts`, `exam_attempts`, `user_streaks`, the streak RPCs, and their
   row-level security policies.
2. `supabase/migrations/20261009131500_profiles_and_study_progress.sql`
   provisions `profiles` and `study_progress`, plus their row-level security
   policies.
3. `supabase/migrations/20261014100000_charge_study_questions_on_view.sql`
   randomizes study-question selection, reports whether more new questions
   remain, and records new-question usage only when a question is opened in the
   study reader. The client hides each question until this per-question
   recording succeeds.

Apply all earlier Avelune+ migrations as well; the later migrations rely on
tables provisioned earlier, including `public.syllabus`, `public.questions`,
`public.user_question_progress`, `public.plan_catalog`, and
`public.user_daily_usage`. Apply these only to Avelune+; they do not copy or
alter the matriculation app's database. The lesson-notes section remains empty
until published `concept_posts` are added.

Apply all files in `supabase/migrations/` in timestamp order. The migration
`20261012160000_learning_data_rls.sql` also enables row-level security for
questions, quizzes, and per-user question progress/usage data.

## Supabase URL configuration

In the Avelune+ Supabase project's Authentication URL configuration:

- Set the Site URL to the deployed Avelune+ origin.
- Add the local development callback `http://localhost:5173/home` to the
  Redirect URLs list.
- Add the deployed callback `https://<avelune-plus-origin>/home` to the
  Redirect URLs list, replacing the placeholder with the Netlify site's
  production URL.

The app sends users back to `/home` after either sign-in method. Add any other
development origins or deployment preview URLs that you intend to use.

## Google sign-in

1. Enable Google as a provider in the Avelune+ Supabase project's Auth provider
   settings.
2. Create or select the Google OAuth web client for Avelune+.
3. Add the Supabase project's callback URL, shown in its Google provider
   settings, to the Google OAuth client's authorized redirect URIs.
4. Add the Avelune+ local and deployed origins to the Google OAuth client's
   authorized JavaScript origins.

Use OAuth credentials dedicated to the Avelune+ Supabase project.

## Email sign-in

Email magic-link sign-in is enabled in the app and can create a new user on
first use. Enable the Email provider in Supabase and configure email delivery
(SMTP) for reliable production sending. Make sure the email template's link
continues through Supabase Auth so its PKCE code can be exchanged by the app.
