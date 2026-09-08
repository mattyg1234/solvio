/*
 * Holded connector (accounts + Verifactu issuer).
 *
 * Each workspace stores its own Holded API token, encrypted with the server-side
 * SHOW_OPS_SECRETS_KEY. Partners remember their Holded contact id; invoice packs
 * remember the Holded document they were pushed to and the legal number Holded
 * assigns on approval.
 */

create table if not exists public.show_ops_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  provider text not null check (provider in ('holded')),
  secret_ciphertext text not null,
  status text not null default 'connected' check (status in ('connected', 'error', 'disabled')),
  meta jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, provider)
);

alter table public.show_ops_integrations enable row level security;
drop policy if exists show_ops_integrations_sel on public.show_ops_integrations;
create policy show_ops_integrations_sel on public.show_ops_integrations
  for select to authenticated using (public.show_ops_can_access(business_id));
drop policy if exists show_ops_integrations_w on public.show_ops_integrations;
create policy show_ops_integrations_w on public.show_ops_integrations
  for all to authenticated
  using (public.show_ops_can_access(business_id))
  with check (public.show_ops_can_access(business_id));

alter table public.show_suppliers
  add column if not exists holded_contact_id text;

alter table public.show_invoices
  add column if not exists holded_document_id text,
  add column if not exists holded_doc_number text,
  add column if not exists holded_status text not null default 'not_sent',
  add column if not exists holded_pushed_at timestamptz,
  add column if not exists holded_synced_at timestamptz,
  add column if not exists holded_error text;

alter table public.show_invoices drop constraint if exists show_invoices_holded_status_check;
alter table public.show_invoices
  add constraint show_invoices_holded_status_check
    check (holded_status in ('not_sent', 'draft', 'approved', 'paid', 'error'));

create index if not exists show_invoices_holded_doc_idx
  on public.show_invoices (business_id, holded_document_id)
  where holded_document_id is not null;

comment on table public.show_ops_integrations is
  'Per-workspace third-party credentials (Holded). secret_ciphertext is AES-256-GCM, key = SHOW_OPS_SECRETS_KEY env.';
comment on column public.show_invoices.holded_status is
  'not_sent | draft (in Holded, unnumbered) | approved (Holded issued legal number + Verifactu) | paid | error';
