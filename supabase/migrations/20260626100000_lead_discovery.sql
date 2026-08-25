/*
 * Lead discovery (the "Maps lead finder" front-of-funnel).
 *
 * Internal Solvio sourcing tool: search a niche + location, pull local
 * businesses, score them for Solvio-fit (no website / no online booking /
 * weak web presence), then promote the good ones into voice_outbound_leads
 * so the existing outbound AI calling engine takes it from there.
 *
 * Both tables are platform-internal (NOT merchant-scoped). RLS is enabled
 * with no public policies, so they are reachable only via the service-role
 * client in admin-gated server code (see src/app/admin/leads/actions.ts).
 */

-- 1) One row per search run.
create table if not exists public.lead_discovery_searches (
  id uuid primary key default gen_random_uuid(),
  query text not null,                       -- niche, e.g. "tapas bar", "boutique hotel"
  location text not null,                     -- "Valencia, Spain"
  filters jsonb not null default '{}'::jsonb, -- { onlyNoWebsite, minRating, ... }
  provider text not null default 'mock',      -- mock | outscraper | google_places
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  result_count integer not null default 0,
  error text,
  created_by text,                            -- admin email that ran it
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists lead_discovery_searches_created_idx
  on public.lead_discovery_searches (created_at desc);

-- 2) One row per discovered business, scored for Solvio-fit.
create table if not exists public.discovered_leads (
  id uuid primary key default gen_random_uuid(),
  search_id uuid references public.lead_discovery_searches(id) on delete set null,
  place_id text,                             -- provider place id, for dedup
  business_name text not null,
  category text,
  phone text,
  website text,
  email text,
  address text,
  city text,
  postcode text,
  country text,
  lat double precision,
  lng double precision,
  rating numeric(2,1),
  review_count integer,
  has_website boolean not null default false,
  fit_score integer not null default 0,      -- 0-100, higher = better Solvio prospect
  fit_signals jsonb not null default '[]'::jsonb, -- [{ key, label, weight }]
  raw jsonb not null default '{}'::jsonb,     -- full provider payload
  status text not null default 'new'
    check (status in ('new', 'promoted', 'dismissed')),
  promoted_lead_id uuid references public.voice_outbound_leads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists discovered_leads_search_idx
  on public.discovered_leads (search_id, fit_score desc);
create index if not exists discovered_leads_status_idx
  on public.discovered_leads (status, fit_score desc);
-- Dedup: same place shouldn't land twice from the same search.
create unique index if not exists discovered_leads_search_place_uniq
  on public.discovered_leads (search_id, place_id)
  where place_id is not null;

alter table public.lead_discovery_searches enable row level security;
alter table public.discovered_leads enable row level security;
-- No policies on purpose: service-role-only access from admin-gated code.

notify pgrst, 'reload schema';
