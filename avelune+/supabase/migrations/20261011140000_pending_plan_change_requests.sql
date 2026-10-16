alter table public.user_subscriptions
  add column if not exists pending_tier_key text
    references public.plan_catalog(tier_key),
  add column if not exists pending_tier_requested_at timestamptz;

create or replace function public.request_plan_change(p_tier_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_subscription public.user_subscriptions%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not logged in';
  end if;
  if p_tier_key is null or p_tier_key not in ('plus', 'pro') then
    raise exception 'Invalid requested plan';
  end if;

  select *
  into v_subscription
  from public.user_subscriptions
  where user_id = v_user_id
  for update;

  if not found
    or v_subscription.status <> 'active'
    or v_subscription.tier_key = 'free'
    or v_subscription.current_period_end is null
    or v_subscription.current_period_end <= now()
  then
    raise exception 'No active paid billing period is available';
  end if;

  if v_subscription.tier_key = p_tier_key then
    raise exception 'Requested plan is already active';
  end if;

  update public.user_subscriptions
  set
    pending_tier_key = p_tier_key,
    pending_tier_requested_at = now(),
    updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object(
    'requested_tier', p_tier_key,
    'current_tier', v_subscription.tier_key,
    'current_period_end', v_subscription.current_period_end,
    'billing_changed', false
  );
end;
$$;

create or replace function public.cancel_plan_change_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not logged in';
  end if;

  update public.user_subscriptions
  set
    pending_tier_key = null,
    pending_tier_requested_at = null,
    updated_at = now()
  where user_id = (select auth.uid())
    and status = 'active';
end;
$$;

revoke all on function public.request_plan_change(text)
  from public, anon;
revoke all on function public.cancel_plan_change_request()
  from public, anon;
grant execute on function public.request_plan_change(text)
  to authenticated;
grant execute on function public.cancel_plan_change_request()
  to authenticated;

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
  v_pending_tier text;
  v_pending_requested_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not logged in';
  end if;

  select
    subscription.tier_key,
    subscription.pending_tier_key,
    subscription.pending_tier_requested_at
  into v_tier, v_pending_tier, v_pending_requested_at
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
    'plan_intro_seen_at', v_intro_seen,
    'pending_tier', v_pending_tier,
    'pending_tier_requested_at', v_pending_requested_at
  );
end;
$$;

revoke all on function public.get_my_plan_summary() from public, anon;
grant execute on function public.get_my_plan_summary() to authenticated;

notify pgrst, 'reload schema';
