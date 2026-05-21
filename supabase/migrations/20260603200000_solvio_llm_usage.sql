/*
 * LLM usage log — every OpenAI call Solvio makes lands a row here so we can
 * see total tokens + estimated cost in /admin/costs. Pricing rates are
 * applied at insert time, so historical rows are stable even if rates change.
 *
 * `business_id` is nullable: some calls (e.g. marketing-side helpers) aren't
 * scoped to a single merchant.
 */

create table if not exists public.solvio_llm_usage (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  feature text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_cents_estimated integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_solvio_llm_usage_created
  on public.solvio_llm_usage (created_at desc);

create index if not exists idx_solvio_llm_usage_business
  on public.solvio_llm_usage (business_id, created_at desc)
  where business_id is not null;

alter table public.solvio_llm_usage enable row level security;

drop policy if exists "solvio_llm_usage_owner_read" on public.solvio_llm_usage;
create policy "solvio_llm_usage_owner_read"
  on public.solvio_llm_usage for select
  using (
    business_id is not null
    and business_id in (select id from public.businesses where owner_id = auth.uid())
  );
-- Inserts only via service role (server actions running with elevated client).
