alter table public.plan_catalog
  add column if not exists paystack_test_plan_code text,
  add column if not exists paystack_live_plan_code text;

update public.plan_catalog
set paystack_test_plan_code = 'PLN_ojaap2eb6ijwtmb'
where tier_key = 'plus';

update public.plan_catalog
set paystack_test_plan_code = 'PLN_bxlixxu7gz1bap1'
where tier_key = 'pro';

create table if not exists public.paystack_checkouts (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier_key text not null references public.plan_catalog(tier_key),
  plan_code text not null,
  customer_email text not null,
  expected_amount_kobo bigint not null check (expected_amount_kobo > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'activated')),
  provider_customer_code text,
  provider_subscription_code text,
  provider_email_token text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paystack_checkouts_user_created_idx
  on public.paystack_checkouts (user_id, created_at desc);

alter table public.paystack_checkouts enable row level security;
revoke all on public.paystack_checkouts from anon, authenticated;
grant all on public.paystack_checkouts to service_role;

notify pgrst, 'reload schema';
