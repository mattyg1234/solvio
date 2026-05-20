-- Voice Campaigns: outbound AI calling for marketing / prospecting / lead nurture.
-- Independent of inbound receptionist — separate billing, separate UI.

-- 1) Campaign definitions (the AI agent + its goal)
create table if not exists public.voice_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  agent_name text,
  vapi_voice_id text,
  greeting_style text,
  first_message text,
  system_prompt text,
  success_criteria text,
  status text not null default 'draft' check (status in ('draft', 'running', 'paused', 'completed', 'archived')),
  vapi_assistant_id text,
  total_calls_attempted integer not null default 0,
  total_calls_answered integer not null default 0,
  total_calls_succeeded integer not null default 0,
  total_cost_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists voice_campaigns_business_idx on public.voice_campaigns (business_id, status);

alter table public.voice_campaigns enable row level security;

drop policy if exists "voice_campaigns_owner_all" on public.voice_campaigns;
create policy "voice_campaigns_owner_all"
  on public.voice_campaigns for all
  using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

-- 2) Lead lists (who gets called)
create table if not exists public.voice_outbound_leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid references public.voice_campaigns(id) on delete set null,
  phone text not null,
  name text,
  business_name text,
  notes text,
  status text not null default 'queued' check (status in ('queued', 'dialing', 'completed', 'failed', 'skipped', 'do_not_call')),
  attempts integer not null default 0,
  last_attempted_at timestamptz,
  source text,
  created_at timestamptz not null default now(),
  unique (business_id, phone, campaign_id)
);

create index if not exists voice_outbound_leads_campaign_status_idx
  on public.voice_outbound_leads (campaign_id, status);
create index if not exists voice_outbound_leads_business_idx
  on public.voice_outbound_leads (business_id, created_at desc);

alter table public.voice_outbound_leads enable row level security;

drop policy if exists "voice_outbound_leads_owner_all" on public.voice_outbound_leads;
create policy "voice_outbound_leads_owner_all"
  on public.voice_outbound_leads for all
  using (business_id in (select id from public.businesses where owner_id = auth.uid()))
  with check (business_id in (select id from public.businesses where owner_id = auth.uid()));

-- 3) Extend voice_call_logs to also store outbound + judge verdicts
alter table public.voice_call_logs
  add column if not exists direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  add column if not exists campaign_id uuid references public.voice_campaigns(id) on delete set null,
  add column if not exists lead_id uuid references public.voice_outbound_leads(id) on delete set null,
  add column if not exists judge_verdict text check (judge_verdict in ('success', 'fail', 'ambiguous', 'voicemail', 'no_answer')),
  add column if not exists judge_reasoning text;

create index if not exists voice_call_logs_campaign_idx
  on public.voice_call_logs (campaign_id, started_at desc)
  where campaign_id is not null;

-- 4) Per-business outbound call credits (separate from inbound minutes pool)
create table if not exists public.voice_outbound_credits (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  bundle_calls_remaining integer not null default 0,
  bundle_calls_purchased_total integer not null default 0,
  trial_calls_remaining integer not null default 5,
  updated_at timestamptz not null default now()
);

alter table public.voice_outbound_credits enable row level security;

drop policy if exists "voice_outbound_credits_owner_read" on public.voice_outbound_credits;
create policy "voice_outbound_credits_owner_read"
  on public.voice_outbound_credits for select
  using (business_id in (select id from public.businesses where owner_id = auth.uid()));
-- Inserts/updates only via service role (Stripe webhook + call deduction trigger).

-- 5) Feature flag — campaigns module is opt-in per business
alter table public.businesses
  add column if not exists campaigns_enabled boolean not null default false;

comment on column public.businesses.campaigns_enabled is
  'When true, the Campaigns tab + outbound voice features appear in the dashboard. Default false — opt-in only.';

-- 6) Helper: atomically deduct one outbound call credit (trial first, then bundle)
create or replace function public.deduct_outbound_call_credit(p_business_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.voice_outbound_credits%rowtype;
begin
  -- Ensure row exists
  insert into public.voice_outbound_credits (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  select * into v_row from public.voice_outbound_credits where business_id = p_business_id for update;

  if v_row.trial_calls_remaining > 0 then
    update public.voice_outbound_credits
      set trial_calls_remaining = trial_calls_remaining - 1, updated_at = now()
      where business_id = p_business_id;
    return 'trial';
  end if;

  if v_row.bundle_calls_remaining > 0 then
    update public.voice_outbound_credits
      set bundle_calls_remaining = bundle_calls_remaining - 1, updated_at = now()
      where business_id = p_business_id;
    return 'bundle';
  end if;

  return 'insufficient';
end;
$$;

grant execute on function public.deduct_outbound_call_credit(uuid) to authenticated, service_role;
