begin;

/*
 * Holded connector database lifecycle.
 *
 * Solvio owns the invoice pack and claim state. Holded owns legal identifiers,
 * approval/payment state and credit notes. No credential or full Holded payload
 * belongs in the external event log.
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

-- Replace the original workspace-wide policies. Credential rows, including
-- secret_ciphertext, are invisible to finance/booker/office/seller sessions.
drop policy if exists show_ops_integrations_sel on public.show_ops_integrations;
drop policy if exists show_ops_integrations_w on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_select on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_insert on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_update on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_delete on public.show_ops_integrations;

create policy show_ops_integrations_owner_admin_select on public.show_ops_integrations
  for select to authenticated
  using (private.show_ops_has_action(business_id, 'admin', array['settings']));
create policy show_ops_integrations_owner_admin_insert on public.show_ops_integrations
  for insert to authenticated
  with check (private.show_ops_has_action(business_id, 'admin', array['settings']));
create policy show_ops_integrations_owner_admin_update on public.show_ops_integrations
  for update to authenticated
  using (private.show_ops_has_action(business_id, 'admin', array['settings']))
  with check (private.show_ops_has_action(business_id, 'admin', array['settings']));
create policy show_ops_integrations_owner_admin_delete on public.show_ops_integrations
  for delete to authenticated
  using (private.show_ops_has_action(business_id, 'admin', array['settings']));

grant select, insert, update, delete on public.show_ops_integrations to authenticated;

alter table public.show_suppliers
  add column if not exists holded_contact_id text;

alter table public.show_invoices
  add column if not exists holded_document_id text,
  add column if not exists holded_doc_number text,
  add column if not exists holded_status text not null default 'not_sent',
  add column if not exists holded_pushed_at timestamptz,
  add column if not exists holded_synced_at timestamptz,
  add column if not exists holded_error text,
  add column if not exists holded_claim_token uuid,
  add column if not exists holded_claimed_at timestamptz,
  add column if not exists holded_expected_net numeric(12,2),
  add column if not exists holded_expected_tax numeric(12,2),
  add column if not exists holded_expected_total numeric(12,2),
  add column if not exists holded_actual_net numeric(12,2),
  add column if not exists holded_actual_tax numeric(12,2),
  add column if not exists holded_actual_total numeric(12,2),
  add column if not exists holded_amounts_match boolean,
  add column if not exists holded_verification_status text not null default 'not_checked',
  add column if not exists holded_reconciliation_status text not null default 'not_required',
  add column if not exists holded_credit_note_id text,
  add column if not exists holded_credit_note_number text,
  add column if not exists holded_credit_status text not null default 'not_requested',
  add column if not exists holded_credit_amount numeric(12,2),
  add column if not exists holded_credit_reason text,
  add column if not exists holded_credit_claim_token uuid,
  add column if not exists holded_credit_claimed_at timestamptz;

alter table public.show_invoices drop constraint if exists show_invoices_holded_status_check;
alter table public.show_invoices
  add constraint show_invoices_holded_status_check check (
    holded_status in ('not_sent', 'creating', 'draft', 'approved', 'paid', 'corrected', 'error', 'failed', 'unknown')
  );
alter table public.show_invoices drop constraint if exists show_invoices_holded_verification_status_check;
alter table public.show_invoices
  add constraint show_invoices_holded_verification_status_check check (
    holded_verification_status in ('not_checked', 'pending', 'matched', 'mismatch', 'error', 'unavailable')
  );
alter table public.show_invoices drop constraint if exists show_invoices_holded_reconciliation_status_check;
alter table public.show_invoices
  add constraint show_invoices_holded_reconciliation_status_check check (
    holded_reconciliation_status in ('not_required', 'required', 'reconciling', 'resolved', 'failed')
  );
alter table public.show_invoices drop constraint if exists show_invoices_holded_credit_status_check;
alter table public.show_invoices
  add constraint show_invoices_holded_credit_status_check check (
    holded_credit_status in ('not_requested', 'creating', 'draft', 'approved', 'failed', 'unknown')
  );
alter table public.show_invoices drop constraint if exists show_invoices_holded_amounts_check;
alter table public.show_invoices
  add constraint show_invoices_holded_amounts_check check (
    (holded_expected_net is null or holded_expected_net >= 0)
    and (holded_expected_tax is null or holded_expected_tax >= 0)
    and (holded_expected_total is null or holded_expected_total >= 0)
    and (holded_actual_net is null or holded_actual_net >= 0)
    and (holded_actual_tax is null or holded_actual_tax >= 0)
    and (holded_actual_total is null or holded_actual_total >= 0)
    and (holded_credit_amount is null or holded_credit_amount > 0)
  );

create index if not exists show_invoices_holded_doc_idx
  on public.show_invoices (business_id, holded_document_id)
  where holded_document_id is not null;
create index if not exists show_invoices_holded_reconcile_idx
  on public.show_invoices (business_id, holded_reconciliation_status, holded_synced_at)
  where holded_reconciliation_status <> 'not_required';

create table if not exists public.show_invoice_external_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete restrict,
  invoice_id uuid references public.show_invoices (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (length(action) between 1 and 80),
  outcome text not null check (length(outcome) between 1 and 80),
  external_id text check (external_id is null or length(external_id) <= 255),
  safe_message text check (safe_message is null or length(safe_message) <= 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint show_invoice_external_events_safe_details check (
    jsonb_typeof(details) = 'object'
    and octet_length(details::text) <= 4096
    and details::text !~* '"(secret|token|authorization|credential|ciphertext|payload|request|response)[^"]*"[[:space:]]*:'
  )
);

create index if not exists show_invoice_external_events_invoice_idx
  on public.show_invoice_external_events (business_id, invoice_id, created_at desc);

alter table public.show_invoice_external_events enable row level security;
drop policy if exists show_invoice_external_events_select on public.show_invoice_external_events;
create policy show_invoice_external_events_select on public.show_invoice_external_events
  for select to authenticated
  using (private.show_ops_has_action(business_id, 'finance', array['invoices']));

revoke all on public.show_invoice_external_events from anon, authenticated;
grant select on public.show_invoice_external_events to authenticated;

create or replace function private.show_ops_claim_holded_invoice(
  p_business_id uuid,
  p_invoice_id uuid,
  p_claim_token uuid
)
returns table(claim_status text, external_id text, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
  recovered boolean := false;
begin
  if p_claim_token is null then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_CLAIM_TOKEN_REQUIRED';
  end if;
  if not private.show_ops_has_action(p_business_id, 'finance', array['invoices']) then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_NOT_ALLOWED';
  end if;

  select * into invoice_row
  from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;

  if invoice_row.holded_document_id is not null then
    insert into public.show_invoice_external_events
      (business_id, invoice_id, actor_id, action, outcome, external_id)
    values (p_business_id, p_invoice_id, (select auth.uid()), 'invoice_claim', 'existing', invoice_row.holded_document_id);
    return query select 'existing'::text, invoice_row.holded_document_id, invoice_row.holded_claim_token;
    return;
  end if;

  if invoice_row.holded_claim_token is not null
     and invoice_row.holded_claimed_at >= now() - interval '15 minutes' then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CLAIM_ACTIVE';
  end if;
  recovered := invoice_row.holded_claim_token is not null;

  if invoice_row.status <> 'issued'
     or invoice_row.holded_status not in ('not_sent', 'creating', 'error', 'failed', 'unknown') then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_INVOICE_STATE_INVALID';
  end if;

  update public.show_invoices i
  set holded_claim_token = p_claim_token,
      holded_claimed_at = now(),
      holded_status = 'creating',
      holded_expected_net = i.net_total,
      holded_expected_tax = i.vat_total,
      holded_expected_total = i.total_amount,
      holded_verification_status = 'pending',
      holded_reconciliation_status = case when recovered then 'required' else 'not_required' end,
      holded_error = null,
      updated_at = now()
  where i.id = p_invoice_id;

  insert into public.show_invoice_external_events
    (business_id, invoice_id, actor_id, action, outcome, details)
  values (
    p_business_id, p_invoice_id, (select auth.uid()), 'invoice_claim',
    case when recovered then 'recovered' else 'claimed' end,
    jsonb_build_object('claim_recovered', recovered)
  );

  return query select case when recovered then 'recovered' else 'claimed' end,
    null::text, p_claim_token;
end;
$$;

create or replace function private.show_ops_claim_holded_credit_note(
  p_business_id uuid,
  p_invoice_id uuid,
  p_claim_token uuid,
  p_amount numeric,
  p_reason text
)
returns table(claim_status text, external_id text, claim_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
  recovered boolean := false;
begin
  if p_claim_token is null then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_CREDIT_CLAIM_TOKEN_REQUIRED';
  end if;
  if p_amount is null or p_amount <= 0 or p_reason is null or btrim(p_reason) = '' or length(p_reason) > 1000 then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_CREDIT_INPUT_INVALID';
  end if;
  if not private.show_ops_has_action(p_business_id, 'finance', array['invoices']) then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_NOT_ALLOWED';
  end if;

  select * into invoice_row
  from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;

  if invoice_row.holded_credit_note_id is not null then
    insert into public.show_invoice_external_events
      (business_id, invoice_id, actor_id, action, outcome, external_id)
    values (p_business_id, p_invoice_id, (select auth.uid()), 'credit_note_claim', 'existing', invoice_row.holded_credit_note_id);
    return query select 'existing'::text, invoice_row.holded_credit_note_id, invoice_row.holded_credit_claim_token;
    return;
  end if;

  if invoice_row.holded_credit_claim_token is not null
     and invoice_row.holded_credit_claimed_at >= now() - interval '15 minutes' then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CREDIT_CLAIM_ACTIVE';
  end if;
  recovered := invoice_row.holded_credit_claim_token is not null;

  if invoice_row.status <> 'issued'
     or invoice_row.holded_document_id is null
     or invoice_row.holded_status not in ('approved', 'paid', 'corrected')
     or p_amount > invoice_row.total_amount then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CREDIT_STATE_INVALID';
  end if;

  update public.show_invoices i
  set holded_credit_claim_token = p_claim_token,
      holded_credit_claimed_at = now(),
      holded_credit_status = 'creating',
      holded_credit_amount = p_amount,
      holded_credit_reason = btrim(p_reason),
      holded_reconciliation_status = case when recovered then 'required' else i.holded_reconciliation_status end,
      updated_at = now()
  where i.id = p_invoice_id;

  insert into public.show_invoice_external_events
    (business_id, invoice_id, actor_id, action, outcome, details)
  values (
    p_business_id, p_invoice_id, (select auth.uid()), 'credit_note_claim',
    case when recovered then 'recovered' else 'claimed' end,
    jsonb_build_object('claim_recovered', recovered, 'amount', p_amount)
  );

  return query select case when recovered then 'recovered' else 'claimed' end,
    null::text, p_claim_token;
end;
$$;

revoke all on function private.show_ops_claim_holded_invoice(uuid, uuid, uuid) from public;
revoke all on function private.show_ops_claim_holded_credit_note(uuid, uuid, uuid, numeric, text) from public;
grant execute on function private.show_ops_claim_holded_invoice(uuid, uuid, uuid) to authenticated;
grant execute on function private.show_ops_claim_holded_credit_note(uuid, uuid, uuid, numeric, text) to authenticated;

comment on table public.show_ops_integrations is
  'Per-workspace third-party credentials. secret_ciphertext must never be copied to audit events or browser logs.';
comment on table public.show_invoice_external_events is
  'Append-only safe summaries of Holded lifecycle actions. Credentials and full external request/response payloads are forbidden.';
comment on column public.show_invoices.holded_status is
  'Validated Holded summary: not_sent, creating, draft, approved, paid, corrected, error, failed or unknown.';
comment on column public.show_invoices.holded_reconciliation_status is
  'Tracks whether an uncertain create/sync result must be reconciled before another external write.';

commit;
