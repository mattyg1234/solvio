begin;

-- Repair for databases that applied 20260908230000 before its lifecycle
-- safeguards were completed. Fresh installs also replay this idempotently.

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
  if not private.show_ops_has_action(p_business_id, 'finance', array['invoices']) then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_NOT_ALLOWED';
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
  if not private.show_ops_has_action(p_business_id, 'finance', array['invoices']) then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_NOT_ALLOWED';
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

revoke all on function private.show_ops_claim_holded_invoice(uuid, uuid, uuid) from public;
revoke all on function private.show_ops_resolve_holded_invoice_claim(uuid, uuid, text, text) from public;
revoke all on function private.show_ops_claim_holded_credit_note(uuid, uuid, uuid, numeric, text) from public;
revoke all on function private.show_ops_resolve_holded_credit_note_claim(uuid, uuid, text, text) from public;
grant execute on function private.show_ops_claim_holded_invoice(uuid, uuid, uuid) to authenticated;
grant execute on function private.show_ops_resolve_holded_invoice_claim(uuid, uuid, text, text) to authenticated;
grant execute on function private.show_ops_claim_holded_credit_note(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function private.show_ops_resolve_holded_credit_note_claim(uuid, uuid, text, text) to authenticated;

commit;
