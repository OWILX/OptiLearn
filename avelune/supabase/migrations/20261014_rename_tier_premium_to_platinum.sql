-- Rename 'premium' tier to 'platinum' to match the product spec.
-- Safe to run once. If it says the constraint does not exist, skip to the
-- ADD CONSTRAINT line below.

alter table public.profiles
  drop constraint if exists profiles_tier_check;

update public.profiles set tier = 'platinum' where tier = 'premium';

alter table public.profiles
  add constraint profiles_tier_check
  check (tier in ('free', 'pro', 'platinum', 'diamond'));
