/*
 * Dashboard onboarding: AI voice receptionist + booking flow preferences per business.
 * Apply after prior migrations (Supabase SQL Editor or supabase db push).
 */

alter table public.businesses
  add column if not exists voice_receptionist_completed_at timestamptz;

alter table public.businesses
  add column if not exists voice_receptionist_details jsonb not null default '{}'::jsonb;

alter table public.businesses
  add column if not exists booking_flow_kind text;

alter table public.businesses
  add column if not exists booking_flow_completed_at timestamptz;

alter table public.businesses
  add column if not exists booking_flow_details jsonb not null default '{}'::jsonb;

-- ── Public booking page: expose optional guest-facing message ───────────────
-- Replace RPC return shape (requires drop — cannot change OUT columns via OR REPLACE).

drop function if exists public.get_booking_page_by_slug(text);

create function public.get_booking_page_by_slug(p_slug text)
returns table (
  business_name text,
  guest_message text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.name::text,
    coalesce(nullif(trim(b.booking_flow_details ->> 'guest_message'), ''), '')
  from public.businesses b
  where lower(trim(b.booking_slug)) = lower(trim(p_slug))
    and b.booking_slug is not null
    and length(trim(b.booking_slug)) > 0
  limit 1;
$$;

grant execute on function public.get_booking_page_by_slug(text) to anon, authenticated;
