create table if not exists public.plan_catalog (
  tier_key text primary key check (tier_key in ('free', 'plus', 'pro')),
  display_name text not null,
  monthly_price_ngn integer not null check (monthly_price_ngn >= 0),
  quiz_new_daily_limit integer not null check (quiz_new_daily_limit >= 0),
  study_new_daily_limit integer not null check (study_new_daily_limit >= 0),
  ai_daily_limit integer not null check (ai_daily_limit >= 0),
  history_retention_days integer not null check (history_retention_days > 0),
  premium_explanations boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plan_catalog (
  tier_key,
  display_name,
  monthly_price_ngn,
  quiz_new_daily_limit,
  study_new_daily_limit,
  ai_daily_limit,
  history_retention_days,
  premium_explanations
)
values
  ('free', 'Free', 0, 50, 50, 5, 7, false),
  ('plus', 'Plus', 1500, 200, 200, 20, 30, true),
  ('pro', 'Pro', 2500, 500, 500, 50, 90, true)
on conflict (tier_key) do nothing;

alter table public.profiles
  add column if not exists plan_intro_seen_at timestamptz;

create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier_key text not null references public.plan_catalog(tier_key),
  status text not null check (
    status in ('pending', 'active', 'past_due', 'cancelled', 'expired')
  ),
  provider text not null default 'paystack',
  provider_customer_code text,
  provider_subscription_code text,
  provider_email_token text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  paystack_reference text unique,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_subscriptions_provider_subscription_idx
  on public.user_subscriptions (provider_subscription_code)
  where provider_subscription_code is not null;

create table if not exists public.user_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  for_date date not null default current_date,
  quiz_new_count integer not null default 0 check (quiz_new_count >= 0),
  study_new_count integer not null default 0 check (study_new_count >= 0),
  ai_count integer not null default 0 check (ai_count >= 0),
  primary key (user_id, for_date)
);

alter table public.plan_catalog enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.user_daily_usage enable row level security;

drop policy if exists "Authenticated users can read plan catalog"
  on public.plan_catalog;
create policy "Authenticated users can read plan catalog"
  on public.plan_catalog for select to authenticated using (true);

drop policy if exists "Users can read their own subscription"
  on public.user_subscriptions;
create policy "Users can read their own subscription"
  on public.user_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.plan_catalog from anon;
grant select on public.plan_catalog to authenticated;
revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;
revoke all on public.user_daily_usage from anon, authenticated;

update public.profiles
set premium = false,
    premium_since = null,
    premium_expires_at = null
where premium is true;

create or replace function public.get_my_plan_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tier text := 'free';
  v_usage public.user_daily_usage%rowtype;
  v_plan public.plan_catalog%rowtype;
  v_intro_seen timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not logged in';
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

  v_tier := coalesce(v_tier, 'free');

  select * into v_plan
  from public.plan_catalog
  where tier_key = v_tier;

  insert into public.user_daily_usage (user_id, for_date)
  values (v_user_id, current_date)
  on conflict (user_id, for_date) do nothing;

  select * into v_usage
  from public.user_daily_usage
  where user_id = v_user_id and for_date = current_date;

  select profile.plan_intro_seen_at
  into v_intro_seen
  from public.profiles as profile
  where profile.id = v_user_id;

  return jsonb_build_object(
    'tier', v_plan.tier_key,
    'display_name', v_plan.display_name,
    'monthly_price_ngn', v_plan.monthly_price_ngn,
    'quiz_new_daily_limit', v_plan.quiz_new_daily_limit,
    'study_new_daily_limit', v_plan.study_new_daily_limit,
    'ai_daily_limit', v_plan.ai_daily_limit,
    'history_retention_days', v_plan.history_retention_days,
    'premium_explanations', v_plan.premium_explanations,
    'quiz_new_used', v_usage.quiz_new_count,
    'study_new_used', v_usage.study_new_count,
    'ai_used', v_usage.ai_count,
    'plan_intro_seen_at', v_intro_seen
  );
end;
$$;

revoke all on function public.get_my_plan_summary() from public, anon;
grant execute on function public.get_my_plan_summary() to authenticated;

create or replace function public.mark_plan_intro_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not logged in';
  end if;

  update public.profiles
  set plan_intro_seen_at = coalesce(plan_intro_seen_at, now())
  where id = (select auth.uid());
end;
$$;

revoke all on function public.mark_plan_intro_seen() from public, anon;
grant execute on function public.mark_plan_intro_seen() to authenticated;

create or replace function public.reserve_ai_usage(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text := 'free';
  v_limit integer;
  v_usage public.user_daily_usage%rowtype;
begin
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;

  select subscription.tier_key
  into v_tier
  from public.user_subscriptions as subscription
  where subscription.user_id = p_user_id
    and subscription.status = 'active'
    and (
      subscription.current_period_end is null
      or subscription.current_period_end > now()
    )
  limit 1;

  select plan.ai_daily_limit
  into v_limit
  from public.plan_catalog as plan
  where plan.tier_key = coalesce(v_tier, 'free');

  insert into public.user_daily_usage (user_id, for_date)
  values (p_user_id, current_date)
  on conflict (user_id, for_date) do nothing;

  select * into v_usage
  from public.user_daily_usage
  where user_id = p_user_id and for_date = current_date
  for update;

  if v_usage.ai_count >= v_limit then
    return jsonb_build_object(
      'allowed', false,
      'tier', coalesce(v_tier, 'free'),
      'used', v_usage.ai_count,
      'limit', v_limit
    );
  end if;

  update public.user_daily_usage
  set ai_count = ai_count + 1
  where user_id = p_user_id and for_date = current_date
  returning * into v_usage;

  return jsonb_build_object(
    'allowed', true,
    'tier', coalesce(v_tier, 'free'),
    'used', v_usage.ai_count,
    'limit', v_limit
  );
end;
$$;

create or replace function public.refund_ai_usage(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_daily_usage
  set ai_count = greatest(0, ai_count - 1)
  where user_id = p_user_id and for_date = current_date;
$$;

revoke all on function public.reserve_ai_usage(uuid) from public, anon, authenticated;
revoke all on function public.refund_ai_usage(uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(uuid) to service_role;
grant execute on function public.refund_ai_usage(uuid) to service_role;

notify pgrst, 'reload schema';
