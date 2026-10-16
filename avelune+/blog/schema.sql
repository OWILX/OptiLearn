-- Run in the SYLLABUS project's SQL editor.
-- NOTE: bigint below assumes subtopics.id is bigint. If it is uuid, change both
--       subtopic_id columns to uuid.

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- pages: one finished markdown page per subtopic (what your static site reads)
-- ---------------------------------------------------------------------------
create table public.pages (
  id             uuid primary key default gen_random_uuid(),
  subtopic_id    bigint not null unique
                   references public.subtopics(id) on delete cascade,
  slug           text not null unique,           -- URL slug for the static page
  title          text not null,                  -- subtopic name (the H1)
  markdown       text not null,                  -- the full page, strictly markdown
  status         text not null default 'draft'
                   check (status in ('draft', 'published')),
  model          text,                           -- generation model used
  prompt_version text,                           -- bump in the script when the prompt changes
  sources        jsonb not null default '{}'::jsonb,  -- chunk ids used, per module + subtopic
  generated_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index pages_status_idx on public.pages (status);

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- page_generation_jobs: progress tracking so the script can resume
-- ---------------------------------------------------------------------------
create table public.page_generation_jobs (
  subtopic_id  bigint primary key
                 references public.subtopics(id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'running', 'done', 'failed', 'skipped')),
  attempts     int not null default 0,
  last_error   text,
  started_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create index page_generation_jobs_status_idx on public.page_generation_jobs (status);

create trigger page_generation_jobs_set_updated_at
  before update on public.page_generation_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: the script uses the service-role key (bypasses RLS).
-- Optional: let a public site read only published pages with the anon key.
-- ---------------------------------------------------------------------------
alter table public.pages enable row level security;
alter table public.page_generation_jobs enable row level security;

create policy "public can read published pages"
  on public.pages for select
  using (status = 'published');
