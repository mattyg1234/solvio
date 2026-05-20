/*
 * Per-tenant pricing levers + voice call usage tracking.
 *
 * Before: platform fee hardcoded to 5% in src/lib/solvio-platform-fee.ts.
 * After: each business carries its own fee bps, AI minute cap, and location cap,
 * so we can offer enterprise deals, promos, and tier-based pricing without redeploys.
 *
 * Also adds voice_call_logs so we can actually measure AI minute usage vs cap.
 */

alter table public.businesses
  add column if not exists subscription_tier text not null default 'trial'
    check (subscription_tier in ('trial', 'pro', 'business', 'scale', 'enterprise')),
  add column if not exists platform_fee_bps integer not null default 500
    check (platform_fee_bps >= 0 and platform_fee_bps <= 10000),
  add column if not exists monthly_ai_minutes_included integer not null default 50
    check (monthly_ai_minutes_included >= 0),
  add column if not exists included_locations integer not null default 1
    check (included_locations >= 1);

comment on column public.businesses.subscription_tier is
  'Active Stripe subscription tier. Updated by webhook on checkout.session.completed.';
comment on column public.businesses.platform_fee_bps is
  'Platform fee in basis points (500 = 5%). Override per business for enterprise / promo deals.';
comment on column public.businesses.monthly_ai_minutes_included is
  'AI receptionist minutes included per month before overage charges kick in.';

-- Voice call usage log (foundation for usage-based billing + overage)
create table if not exists public.voice_call_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  vapi_call_id text,
  caller_phone text,
  caller_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  duration_minutes_billable numeric(10,2) not null default 0,
  outcome text check (outcome in ('answered', 'booked', 'voicemail', 'transferred', 'dropped', 'spam')),
  transcript_summary text,
  raw_transcript jsonb,
  cost_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_call_logs_business_started
  on public.voice_call_logs (business_id, started_at desc);

alter table public.voice_call_logs enable row level security;

-- Owners can read their own business's call logs
drop policy if exists "voice_call_logs_owner_read" on public.voice_call_logs;
create policy "voice_call_logs_owner_read"
  on public.voice_call_logs
  for select
  using (
    business_id in (
      select id from public.businesses where owner_id = auth.uid()
    )
  );

-- Only service role inserts call logs (from Vapi webhook handler)
drop policy if exists "voice_call_logs_service_insert" on public.voice_call_logs;
create policy "voice_call_logs_service_insert"
  on public.voice_call_logs
  for insert
  with check (false);  -- service role bypasses RLS; merchants never insert directly

-- Convenience view: current-month usage per business
create or replace view public.voice_call_usage_current_month as
select
  b.id as business_id,
  b.name as business_name,
  b.subscription_tier,
  b.monthly_ai_minutes_included,
  coalesce(sum(v.duration_minutes_billable), 0)::numeric(10,2) as minutes_used,
  greatest(
    coalesce(sum(v.duration_minutes_billable), 0) - b.monthly_ai_minutes_included,
    0
  )::numeric(10,2) as minutes_over,
  count(v.id) as call_count
from public.businesses b
left join public.voice_call_logs v
  on v.business_id = b.id
  and v.started_at >= date_trunc('month', now())
group by b.id, b.name, b.subscription_tier, b.monthly_ai_minutes_included;

grant select on public.voice_call_usage_current_month to authenticated;
