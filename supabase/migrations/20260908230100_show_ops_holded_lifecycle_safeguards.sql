begin;

-- Repair for databases that applied 20260908230000 before its lifecycle
-- safeguards were completed. Fresh installs also replay this idempotently.

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
alter table public.show_invoices add constraint show_invoices_holded_status_check check (
  holded_status in ('not_sent', 'creating', 'draft', 'approved', 'paid', 'corrected', 'error', 'failed', 'unknown')
);
alter table public.show_invoices drop constraint if exists show_invoices_holded_verification_status_check;
alter table public.show_invoices add constraint show_invoices_holded_verification_status_check check (
  holded_verification_status in ('not_checked', 'pending', 'matched', 'mismatch', 'error', 'unavailable')
);
alter table public.show_invoices drop constraint if exists show_invoices_holded_reconciliation_status_check;
alter table public.show_invoices add constraint show_invoices_holded_reconciliation_status_check check (
  holded_reconciliation_status in ('not_required', 'required', 'reconciling', 'resolved', 'failed')
);
alter table public.show_invoices drop constraint if exists show_invoices_holded_credit_status_check;
alter table public.show_invoices add constraint show_invoices_holded_credit_status_check check (
  holded_credit_status in ('not_requested', 'creating', 'draft', 'approved', 'failed', 'unknown')
);

drop policy if exists show_ops_integrations_sel on public.show_ops_integrations;
drop policy if exists show_ops_integrations_w on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_select on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_insert on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_update on public.show_ops_integrations;
drop policy if exists show_ops_integrations_owner_admin_delete on public.show_ops_integrations;
create policy show_ops_integrations_owner_admin_select on public.show_ops_integrations
  for select to authenticated using (private.show_ops_has_action(business_id, 'admin', array['settings']));
create policy show_ops_integrations_owner_admin_insert on public.show_ops_integrations
  for insert to authenticated with check (private.show_ops_has_action(business_id, 'admin', array['settings']));
create policy show_ops_integrations_owner_admin_update on public.show_ops_integrations
  for update to authenticated using (private.show_ops_has_action(business_id, 'admin', array['settings']))
  with check (private.show_ops_has_action(business_id, 'admin', array['settings']));
create policy show_ops_integrations_owner_admin_delete on public.show_ops_integrations
  for delete to authenticated using (private.show_ops_has_action(business_id, 'admin', array['settings']));
grant select, insert, update, delete on public.show_ops_integrations to authenticated;

create index if not exists show_invoices_holded_doc_idx
  on public.show_invoices (business_id, holded_document_id) where holded_document_id is not null;
create index if not exists show_invoices_holded_reconcile_idx
  on public.show_invoices (business_id, holded_reconciliation_status, holded_synced_at)
  where holded_reconciliation_status <> 'not_required';

create table if not exists public.show_invoice_external_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  invoice_id uuid references public.show_invoices(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (length(action) between 1 and 80),
  outcome text not null check (length(outcome) between 1 and 80),
  external_id text check (external_id is null or length(external_id) <= 255),
  safe_message text check (safe_message is null or length(safe_message) <= 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint show_invoice_external_events_safe_details check (
    jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096
    and details::text !~* '"(secret|token|authorization|credential|ciphertext|payload|request|response)[^"]*"[[:space:]]*:'
  )
);
create index if not exists show_invoice_external_events_invoice_idx
  on public.show_invoice_external_events (business_id, invoice_id, created_at desc);
alter table public.show_invoice_external_events enable row level security;
drop policy if exists show_invoice_external_events_select on public.show_invoice_external_events;
create policy show_invoice_external_events_select on public.show_invoice_external_events
  for select to authenticated using (private.show_ops_has_action(business_id, 'finance', array['invoices']));

alter table public.show_invoices drop constraint if exists show_invoices_holded_amounts_check;
alter table public.show_invoices
  add constraint show_invoices_holded_amounts_check check (
    (holded_expected_net is null or (holded_expected_net >= 0 and holded_expected_net::text not in ('NaN', 'Infinity', '-Infinity')))
    and (holded_expected_tax is null or (holded_expected_tax >= 0 and holded_expected_tax::text not in ('NaN', 'Infinity', '-Infinity')))
    and (holded_expected_total is null or (holded_expected_total >= 0 and holded_expected_total::text not in ('NaN', 'Infinity', '-Infinity')))
    and (holded_actual_net is null or (holded_actual_net >= 0 and holded_actual_net::text not in ('NaN', 'Infinity', '-Infinity')))
    and (holded_actual_tax is null or (holded_actual_tax >= 0 and holded_actual_tax::text not in ('NaN', 'Infinity', '-Infinity')))
    and (holded_actual_total is null or (holded_actual_total >= 0 and holded_actual_total::text not in ('NaN', 'Infinity', '-Infinity')))
    and (holded_credit_amount is null or (holded_credit_amount > 0 and holded_credit_amount::text not in ('NaN', 'Infinity', '-Infinity')))
  );

revoke all on public.show_invoice_external_events from public, anon, authenticated, service_role;
grant select on public.show_invoice_external_events to authenticated;
grant usage on schema private to service_role;

create or replace function private.show_ops_guard_external_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'SHOW_OPS_EXTERNAL_EVENTS_APPEND_ONLY';
end;
$$;
revoke all on function private.show_ops_guard_external_event_append_only() from public, anon, authenticated, service_role;
drop trigger if exists show_invoice_external_events_append_only on public.show_invoice_external_events;
create trigger show_invoice_external_events_append_only
  before update or delete on public.show_invoice_external_events
  for each row execute function private.show_ops_guard_external_event_append_only();

create table if not exists private.show_ops_holded_write_context (
  backend_pid integer not null,
  transaction_id bigint not null,
  primary key (backend_pid, transaction_id)
);
revoke all on private.show_ops_holded_write_context from public, anon, authenticated, service_role;

create or replace function private.show_ops_guard_holded_lifecycle_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_columns constant text[] := array[
    'holded_document_id', 'holded_doc_number', 'holded_status', 'holded_pushed_at',
    'holded_synced_at', 'holded_error', 'holded_claim_token', 'holded_claimed_at',
    'holded_expected_net', 'holded_expected_tax', 'holded_expected_total',
    'holded_actual_net', 'holded_actual_tax', 'holded_actual_total', 'holded_amounts_match',
    'holded_verification_status', 'holded_reconciliation_status', 'holded_credit_note_id',
    'holded_credit_note_number', 'holded_credit_status', 'holded_credit_amount',
    'holded_credit_reason', 'holded_credit_claim_token', 'holded_credit_claimed_at'
  ];
begin
  if exists (
    select 1 from unnest(protected_columns) as protected(column_name)
    where to_jsonb(new) -> protected.column_name is distinct from to_jsonb(old) -> protected.column_name
  ) and current_setting('role', true) not in ('none', '')
    and not exists (
      select 1 from private.show_ops_holded_write_context context
      where context.backend_pid = pg_backend_pid()
        and context.transaction_id = txid_current()
    ) then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_LIFECYCLE_TRUSTED_ONLY';
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_holded_lifecycle_columns() from public, anon, authenticated, service_role;
drop trigger if exists show_invoices_holded_lifecycle_guard on public.show_invoices;
create trigger show_invoices_holded_lifecycle_guard
  before update on public.show_invoices
  for each row execute function private.show_ops_guard_holded_lifecycle_columns();

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
  if invoice_row.holded_reconciliation_status in ('required', 'reconciling') then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_RECONCILIATION_REQUIRED';
  end if;
  if invoice_row.holded_claim_token is not null
     and invoice_row.holded_claimed_at >= now() - interval '15 minutes' then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CLAIM_ACTIVE';
  end if;
  if invoice_row.holded_claim_token is not null then
    insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
      on conflict do nothing;
    update public.show_invoices i
    set holded_status = 'unknown',
        holded_reconciliation_status = 'required',
        holded_verification_status = 'pending',
        updated_at = now()
    where i.id = p_invoice_id;
    delete from private.show_ops_holded_write_context
      where backend_pid = pg_backend_pid() and transaction_id = txid_current();
    insert into public.show_invoice_external_events
      (business_id, invoice_id, actor_id, action, outcome, details)
    values (p_business_id, p_invoice_id, (select auth.uid()), 'invoice_claim',
      'reconciliation_required', jsonb_build_object('stale_after_minutes', 15));
    return query select 'reconciliation_required'::text, null::text, null::uuid;
    return;
  end if;

  if invoice_row.status <> 'issued'
     or invoice_row.holded_status not in ('not_sent', 'error', 'failed', 'unknown') then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_INVOICE_STATE_INVALID';
  end if;
  if invoice_row.net_total::text in ('NaN', 'Infinity', '-Infinity')
     or invoice_row.vat_total::text in ('NaN', 'Infinity', '-Infinity')
     or invoice_row.total_amount::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception using errcode = '22003', message = 'SHOW_OPS_HOLDED_AMOUNT_INVALID';
  end if;

  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  update public.show_invoices i
  set holded_claim_token = p_claim_token,
      holded_claimed_at = now(),
      holded_status = 'creating',
      holded_expected_net = i.net_total,
      holded_expected_tax = i.vat_total,
      holded_expected_total = i.total_amount,
      holded_verification_status = 'pending',
      holded_reconciliation_status = 'not_required',
      holded_error = null,
      updated_at = now()
  where i.id = p_invoice_id;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();

  insert into public.show_invoice_external_events
    (business_id, invoice_id, actor_id, action, outcome, details)
  values (p_business_id, p_invoice_id, (select auth.uid()), 'invoice_claim',
    'claimed', jsonb_build_object('claim_recovered', false));
  return query select 'claimed'::text, null::text, p_claim_token;
end;
$$;

create or replace function private.show_ops_resolve_holded_invoice_claim(
  p_business_id uuid,
  p_invoice_id uuid,
  p_external_id text,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_BACKEND_REQUIRED';
  end if;
  if p_resolution not in ('found', 'confirmed_not_found')
     or (p_resolution = 'found' and (p_external_id is null or length(p_external_id) not between 1 and 255))
     or (p_resolution = 'confirmed_not_found' and p_external_id is not null) then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_RECONCILIATION_INPUT_INVALID';
  end if;

  select * into invoice_row
  from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;
  if invoice_row.holded_reconciliation_status <> 'required'
     or invoice_row.holded_claim_token is null then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_RECONCILIATION_NOT_REQUIRED';
  end if;

  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  update public.show_invoices i
  set holded_document_id = case when p_resolution = 'found' then p_external_id else null end,
      holded_status = case when p_resolution = 'found' then 'draft' else 'not_sent' end,
      holded_claim_token = null,
      holded_claimed_at = null,
      holded_reconciliation_status = 'resolved',
      holded_verification_status = case when p_resolution = 'found' then 'pending' else 'not_checked' end,
      updated_at = now()
  where i.id = p_invoice_id;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();

  insert into public.show_invoice_external_events
    (business_id, invoice_id, actor_id, action, outcome, external_id)
  values (p_business_id, p_invoice_id, (select auth.uid()), 'invoice_reconciliation',
    p_resolution, p_external_id);
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
begin
  if p_claim_token is null then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_CREDIT_CLAIM_TOKEN_REQUIRED';
  end if;
  if p_amount is null or p_amount::text in ('NaN', 'Infinity', '-Infinity')
     or p_amount <= 0 or p_reason is null or btrim(p_reason) = '' or length(p_reason) > 1000 then
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
  if invoice_row.holded_reconciliation_status in ('required', 'reconciling') then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_RECONCILIATION_REQUIRED';
  end if;
  if invoice_row.holded_credit_claim_token is not null
     and invoice_row.holded_credit_claimed_at >= now() - interval '15 minutes' then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CREDIT_CLAIM_ACTIVE';
  end if;
  if invoice_row.holded_credit_claim_token is not null then
    insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
      on conflict do nothing;
    update public.show_invoices i
    set holded_credit_status = 'unknown',
        holded_reconciliation_status = 'required',
        updated_at = now()
    where i.id = p_invoice_id;
    delete from private.show_ops_holded_write_context
      where backend_pid = pg_backend_pid() and transaction_id = txid_current();
    insert into public.show_invoice_external_events
      (business_id, invoice_id, actor_id, action, outcome, details)
    values (p_business_id, p_invoice_id, (select auth.uid()), 'credit_note_claim',
      'reconciliation_required', jsonb_build_object('stale_after_minutes', 15));
    return query select 'reconciliation_required'::text, null::text, null::uuid;
    return;
  end if;
  if invoice_row.status <> 'issued'
     or invoice_row.holded_document_id is null
     or invoice_row.holded_status not in ('approved', 'paid', 'corrected')
     or p_amount > invoice_row.total_amount then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CREDIT_STATE_INVALID';
  end if;

  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  update public.show_invoices i
  set holded_credit_claim_token = p_claim_token,
      holded_credit_claimed_at = now(),
      holded_credit_status = 'creating',
      holded_credit_amount = p_amount,
      holded_credit_reason = btrim(p_reason),
      holded_reconciliation_status = 'not_required',
      updated_at = now()
  where i.id = p_invoice_id;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();
  insert into public.show_invoice_external_events
    (business_id, invoice_id, actor_id, action, outcome, details)
  values (p_business_id, p_invoice_id, (select auth.uid()), 'credit_note_claim',
    'claimed', jsonb_build_object('claim_recovered', false, 'amount', p_amount));
  return query select 'claimed'::text, null::text, p_claim_token;
end;
$$;

create or replace function private.show_ops_resolve_holded_credit_note_claim(
  p_business_id uuid,
  p_invoice_id uuid,
  p_external_id text,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_BACKEND_REQUIRED';
  end if;
  if p_resolution not in ('found', 'confirmed_not_found')
     or (p_resolution = 'found' and (p_external_id is null or length(p_external_id) not between 1 and 255))
     or (p_resolution = 'confirmed_not_found' and p_external_id is not null) then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_RECONCILIATION_INPUT_INVALID';
  end if;
  select * into invoice_row from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;
  if invoice_row.holded_reconciliation_status <> 'required'
     or invoice_row.holded_credit_claim_token is null then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_RECONCILIATION_NOT_REQUIRED';
  end if;
  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  update public.show_invoices i
  set holded_credit_note_id = case when p_resolution = 'found' then p_external_id else null end,
      holded_credit_status = case when p_resolution = 'found' then 'draft' else 'not_requested' end,
      holded_credit_claim_token = null,
      holded_credit_claimed_at = null,
      holded_reconciliation_status = 'resolved',
      updated_at = now()
  where i.id = p_invoice_id;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();
  insert into public.show_invoice_external_events
    (business_id, invoice_id, actor_id, action, outcome, external_id)
  values (p_business_id, p_invoice_id, (select auth.uid()), 'credit_note_reconciliation',
    p_resolution, p_external_id);
end;
$$;

create or replace function private.show_ops_request_holded_reconciliation(
  p_business_id uuid,
  p_invoice_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
begin
  if not private.show_ops_has_action(p_business_id, 'finance', array['invoices']) then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_NOT_ALLOWED';
  end if;
  if p_reason is null or btrim(p_reason) = '' or length(p_reason) > 200 then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_RECONCILIATION_INPUT_INVALID';
  end if;
  select * into invoice_row from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;
  if invoice_row.holded_claim_token is null and invoice_row.holded_credit_claim_token is null then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_NO_ACTIVE_CLAIM';
  end if;
  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  update public.show_invoices i
  set holded_status = case when i.holded_claim_token is not null and i.holded_document_id is null then 'unknown' else i.holded_status end,
      holded_credit_status = case when i.holded_credit_claim_token is not null and i.holded_credit_note_id is null then 'unknown' else i.holded_credit_status end,
      holded_reconciliation_status = 'required',
      updated_at = now()
  where i.id = p_invoice_id;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();
  insert into public.show_invoice_external_events
    (business_id, invoice_id, actor_id, action, outcome, safe_message)
  values (p_business_id, p_invoice_id, (select auth.uid()), 'reconciliation_request', 'requested', btrim(p_reason));
end;
$$;

create or replace function private.show_ops_complete_holded_invoice_claim(
  p_business_id uuid,
  p_invoice_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_external_id text,
  p_external_status text,
  p_actual_net numeric,
  p_actual_tax numeric,
  p_actual_total numeric,
  p_safe_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
  amounts_match boolean;
  event_outcome text;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_BACKEND_REQUIRED';
  end if;
  if p_outcome not in ('created', 'failed', 'unknown')
     or (p_safe_message is not null and length(p_safe_message) > 1000) then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_COMPLETION_INPUT_INVALID';
  end if;
  select * into invoice_row from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;
  if invoice_row.holded_claim_token is distinct from p_claim_token then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CLAIM_TOKEN_MISMATCH';
  end if;
  if invoice_row.holded_status <> 'creating' then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_COMPLETION_STATE_INVALID';
  end if;

  if p_outcome = 'created' then
    if p_external_id is null or length(p_external_id) not between 1 and 255
       or p_external_status not in ('draft', 'approved', 'paid', 'corrected', 'unknown')
       or p_actual_net is null or p_actual_tax is null or p_actual_total is null
       or p_actual_net::text in ('NaN', 'Infinity', '-Infinity')
       or p_actual_tax::text in ('NaN', 'Infinity', '-Infinity')
       or p_actual_total::text in ('NaN', 'Infinity', '-Infinity')
       or p_actual_net < 0 or p_actual_tax < 0 or p_actual_total < 0 then
      raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_COMPLETION_INPUT_INVALID';
    end if;
    amounts_match := p_actual_net = invoice_row.holded_expected_net
      and p_actual_tax = invoice_row.holded_expected_tax
      and p_actual_total = invoice_row.holded_expected_total;
    event_outcome := case when amounts_match then 'created' else 'amount_mismatch' end;
  elsif p_external_id is not null or p_external_status is not null
      or p_actual_net is not null or p_actual_tax is not null or p_actual_total is not null then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_COMPLETION_INPUT_INVALID';
  else
    event_outcome := p_outcome;
  end if;

  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  if p_outcome = 'created' then
    update public.show_invoices i set
      holded_document_id = p_external_id, holded_status = p_external_status,
      holded_actual_net = p_actual_net, holded_actual_tax = p_actual_tax,
      holded_actual_total = p_actual_total, holded_amounts_match = amounts_match,
      holded_verification_status = case when amounts_match then 'matched' else 'mismatch' end,
      holded_reconciliation_status = case when amounts_match then 'not_required' else 'required' end,
      holded_claim_token = null, holded_claimed_at = null, holded_pushed_at = now(),
      holded_synced_at = now(), holded_error = p_safe_message, updated_at = now()
    where i.id = p_invoice_id;
  elsif p_outcome = 'failed' then
    update public.show_invoices i set holded_status = 'failed', holded_claim_token = null,
      holded_claimed_at = null, holded_verification_status = 'error',
      holded_reconciliation_status = 'not_required', holded_error = p_safe_message, updated_at = now()
    where i.id = p_invoice_id;
  else
    update public.show_invoices i set holded_status = 'unknown',
      holded_reconciliation_status = 'required', holded_error = p_safe_message, updated_at = now()
    where i.id = p_invoice_id;
  end if;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();
  insert into public.show_invoice_external_events
    (business_id, invoice_id, action, outcome, external_id, safe_message, details)
  values (p_business_id, p_invoice_id, 'invoice_complete', event_outcome, p_external_id, p_safe_message,
    case when p_outcome = 'created' then jsonb_build_object('actual_net', p_actual_net,
      'actual_tax', p_actual_tax, 'actual_total', p_actual_total, 'amounts_match', amounts_match)
    else '{}'::jsonb end);
end;
$$;

create or replace function private.show_ops_complete_holded_credit_note_claim(
  p_business_id uuid,
  p_invoice_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_external_id text,
  p_external_status text,
  p_actual_amount numeric,
  p_safe_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_BACKEND_REQUIRED';
  end if;
  if p_outcome not in ('created', 'failed', 'unknown')
     or (p_safe_message is not null and length(p_safe_message) > 1000) then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_CREDIT_COMPLETION_INPUT_INVALID';
  end if;
  select * into invoice_row from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;
  if invoice_row.holded_credit_claim_token is distinct from p_claim_token then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CLAIM_TOKEN_MISMATCH';
  end if;
  if invoice_row.holded_credit_status <> 'creating' then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_COMPLETION_STATE_INVALID';
  end if;
  if p_outcome = 'created' then
    if p_external_id is null or length(p_external_id) not between 1 and 255
       or p_external_status not in ('draft', 'approved') or p_actual_amount is null
       or p_actual_amount::text in ('NaN', 'Infinity', '-Infinity')
       or p_actual_amount <= 0 or p_actual_amount is distinct from invoice_row.holded_credit_amount then
      raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_CREDIT_COMPLETION_INPUT_INVALID';
    end if;
  elsif p_external_id is not null or p_external_status is not null or p_actual_amount is not null then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_CREDIT_COMPLETION_INPUT_INVALID';
  end if;

  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  if p_outcome = 'created' then
    update public.show_invoices i set holded_credit_note_id = p_external_id,
      holded_credit_status = p_external_status, holded_credit_claim_token = null,
      holded_credit_claimed_at = null, holded_reconciliation_status = 'not_required', updated_at = now()
    where i.id = p_invoice_id;
  elsif p_outcome = 'failed' then
    update public.show_invoices i set holded_credit_status = 'failed',
      holded_credit_claim_token = null, holded_credit_claimed_at = null,
      holded_reconciliation_status = 'not_required', updated_at = now()
    where i.id = p_invoice_id;
  else
    update public.show_invoices i set holded_credit_status = 'unknown',
      holded_reconciliation_status = 'required', updated_at = now()
    where i.id = p_invoice_id;
  end if;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();
  insert into public.show_invoice_external_events
    (business_id, invoice_id, action, outcome, external_id, safe_message, details)
  values (p_business_id, p_invoice_id, 'credit_note_complete', p_outcome, p_external_id,
    p_safe_message, case when p_actual_amount is null then '{}'::jsonb
      else jsonb_build_object('actual_amount', p_actual_amount) end);
end;
$$;

revoke all on function private.show_ops_claim_holded_invoice(uuid, uuid, uuid) from public;
revoke all on function private.show_ops_resolve_holded_invoice_claim(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.show_ops_claim_holded_credit_note(uuid, uuid, uuid, numeric, text) from public;
revoke all on function private.show_ops_resolve_holded_credit_note_claim(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function private.show_ops_request_holded_reconciliation(uuid, uuid, text) from public, anon;
revoke all on function private.show_ops_complete_holded_invoice_claim(uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function private.show_ops_complete_holded_credit_note_claim(uuid, uuid, uuid, text, text, text, numeric, text) from public, anon, authenticated;
grant execute on function private.show_ops_claim_holded_invoice(uuid, uuid, uuid) to authenticated;
grant execute on function private.show_ops_claim_holded_credit_note(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function private.show_ops_request_holded_reconciliation(uuid, uuid, text) to authenticated;
grant execute on function private.show_ops_resolve_holded_invoice_claim(uuid, uuid, text, text) to service_role;
grant execute on function private.show_ops_resolve_holded_credit_note_claim(uuid, uuid, text, text) to service_role;
grant execute on function private.show_ops_complete_holded_invoice_claim(uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, text) to service_role;
grant execute on function private.show_ops_complete_holded_credit_note_claim(uuid, uuid, uuid, text, text, text, numeric, text) to service_role;

commit;
