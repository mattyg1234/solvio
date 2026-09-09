/*
 * Holded lifecycle: callable surface + status sync.
 *
 * The lifecycle functions live in the `private` schema, which PostgREST does not
 * expose, so the application could not call them. These SECURITY DEFINER wrappers
 * in `public` are the only way in. The inner functions keep their own checks:
 * finance+invoices page grant for claims, `role = service_role` for completion.
 *
 * Also adds the one lifecycle step the design lacked: syncing an existing
 * document's number / approval / payment state back from Holded (backend only).
 */

-- ---------- status sync (new) ----------
create or replace function private.show_ops_sync_holded_invoice(
  p_business_id uuid,
  p_invoice_id uuid,
  p_external_id text,
  p_doc_number text,
  p_external_status text,
  p_actual_net numeric,
  p_actual_tax numeric,
  p_actual_total numeric,
  p_approved_at timestamptz,
  p_paid boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.show_invoices%rowtype;
  amounts_match boolean;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'SHOW_OPS_HOLDED_BACKEND_REQUIRED';
  end if;
  if p_external_id is null or length(p_external_id) not between 1 and 255
     or p_external_status not in ('draft', 'approved', 'paid', 'corrected')
     or (p_doc_number is not null and length(p_doc_number) not between 1 and 80)
     or p_actual_net is null or p_actual_tax is null or p_actual_total is null
     or p_actual_net::text in ('NaN', 'Infinity', '-Infinity')
     or p_actual_tax::text in ('NaN', 'Infinity', '-Infinity')
     or p_actual_total::text in ('NaN', 'Infinity', '-Infinity')
     or p_actual_net < 0 or p_actual_tax < 0 or p_actual_total < 0 then
    raise exception using errcode = '22023', message = 'SHOW_OPS_HOLDED_SYNC_INPUT_INVALID';
  end if;

  select * into invoice_row from public.show_invoices i
  where i.id = p_invoice_id and i.business_id = p_business_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_OPS_HOLDED_INVOICE_NOT_FOUND';
  end if;
  if invoice_row.holded_document_id is null or invoice_row.holded_document_id is distinct from p_external_id then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_DOCUMENT_MISMATCH';
  end if;
  if invoice_row.holded_claim_token is not null or invoice_row.holded_status = 'creating' then
    raise exception using errcode = '55000', message = 'SHOW_OPS_HOLDED_CLAIM_ACTIVE';
  end if;

  amounts_match := case
    when invoice_row.holded_expected_net is null or invoice_row.holded_expected_tax is null or invoice_row.holded_expected_total is null then null
    else p_actual_net = invoice_row.holded_expected_net
      and p_actual_tax = invoice_row.holded_expected_tax
      and p_actual_total = invoice_row.holded_expected_total
  end;

  insert into private.show_ops_holded_write_context values (pg_backend_pid(), txid_current())
    on conflict do nothing;
  update public.show_invoices i set
    holded_doc_number = coalesce(p_doc_number, i.holded_doc_number),
    holded_status = p_external_status,
    holded_actual_net = p_actual_net,
    holded_actual_tax = p_actual_tax,
    holded_actual_total = p_actual_total,
    holded_amounts_match = coalesce(amounts_match, i.holded_amounts_match),
    holded_verification_status = case
      when amounts_match is null then i.holded_verification_status
      when amounts_match then 'matched' else 'mismatch' end,
    holded_reconciliation_status = case
      when amounts_match is false then 'required'
      when amounts_match is true and i.holded_reconciliation_status = 'required' then 'resolved'
      else i.holded_reconciliation_status end,
    holded_synced_at = now(),
    holded_error = null,
    paid = case when p_paid then true else i.paid end,
    paid_at = case when p_paid and i.paid_at is null then current_date else i.paid_at end,
    verifactu_number = coalesce(p_doc_number, i.verifactu_number),
    verifactu_status = case when p_doc_number is not null then 'recorded' else i.verifactu_status end,
    verifactu_recorded_at = case when p_doc_number is not null then coalesce(i.verifactu_recorded_at, p_approved_at, now()) else i.verifactu_recorded_at end,
    updated_at = now()
  where i.id = p_invoice_id;
  delete from private.show_ops_holded_write_context
    where backend_pid = pg_backend_pid() and transaction_id = txid_current();

  insert into public.show_invoice_external_events
    (business_id, invoice_id, action, outcome, external_id, details)
  values (p_business_id, p_invoice_id, 'invoice_sync', p_external_status, p_external_id,
    jsonb_build_object('doc_number', p_doc_number, 'paid', p_paid, 'amounts_match', amounts_match));
end;
$$;
revoke all on function private.show_ops_sync_holded_invoice(uuid, uuid, text, text, text, numeric, numeric, numeric, timestamptz, boolean) from public, anon, authenticated;
grant execute on function private.show_ops_sync_holded_invoice(uuid, uuid, text, text, text, numeric, numeric, numeric, timestamptz, boolean) to service_role;

-- ---------- public wrappers ----------
create or replace function public.show_ops_holded_claim_invoice(p_business_id uuid, p_invoice_id uuid, p_claim_token uuid)
returns table(claim_status text, external_id text, claim_token uuid)
language sql security definer set search_path = '' as $$
  select * from private.show_ops_claim_holded_invoice(p_business_id, p_invoice_id, p_claim_token);
$$;

create or replace function public.show_ops_holded_request_reconciliation(p_business_id uuid, p_invoice_id uuid, p_reason text)
returns void
language sql security definer set search_path = '' as $$
  select private.show_ops_request_holded_reconciliation(p_business_id, p_invoice_id, p_reason);
$$;

create or replace function public.show_ops_holded_complete_invoice(
  p_business_id uuid, p_invoice_id uuid, p_claim_token uuid, p_outcome text, p_external_id text,
  p_external_status text, p_actual_net numeric, p_actual_tax numeric, p_actual_total numeric, p_safe_message text)
returns void
language sql security definer set search_path = '' as $$
  select private.show_ops_complete_holded_invoice_claim(p_business_id, p_invoice_id, p_claim_token, p_outcome,
    p_external_id, p_external_status, p_actual_net, p_actual_tax, p_actual_total, p_safe_message);
$$;

create or replace function public.show_ops_holded_resolve_invoice(p_business_id uuid, p_invoice_id uuid, p_external_id text, p_resolution text)
returns void
language sql security definer set search_path = '' as $$
  select private.show_ops_resolve_holded_invoice_claim(p_business_id, p_invoice_id, p_external_id, p_resolution);
$$;

create or replace function public.show_ops_holded_sync_invoice(
  p_business_id uuid, p_invoice_id uuid, p_external_id text, p_doc_number text, p_external_status text,
  p_actual_net numeric, p_actual_tax numeric, p_actual_total numeric, p_approved_at timestamptz, p_paid boolean)
returns void
language sql security definer set search_path = '' as $$
  select private.show_ops_sync_holded_invoice(p_business_id, p_invoice_id, p_external_id, p_doc_number, p_external_status,
    p_actual_net, p_actual_tax, p_actual_total, p_approved_at, p_paid);
$$;

create or replace function public.show_ops_holded_claim_credit_note(p_business_id uuid, p_invoice_id uuid, p_claim_token uuid, p_amount numeric, p_reason text)
returns table(claim_status text, external_id text, claim_token uuid)
language sql security definer set search_path = '' as $$
  select * from private.show_ops_claim_holded_credit_note(p_business_id, p_invoice_id, p_claim_token, p_amount, p_reason);
$$;

create or replace function public.show_ops_holded_complete_credit_note(
  p_business_id uuid, p_invoice_id uuid, p_claim_token uuid, p_outcome text, p_external_id text,
  p_external_status text, p_actual_amount numeric, p_safe_message text)
returns void
language sql security definer set search_path = '' as $$
  select private.show_ops_complete_holded_credit_note_claim(p_business_id, p_invoice_id, p_claim_token, p_outcome,
    p_external_id, p_external_status, p_actual_amount, p_safe_message);
$$;

create or replace function public.show_ops_holded_resolve_credit_note(p_business_id uuid, p_invoice_id uuid, p_external_id text, p_resolution text)
returns void
language sql security definer set search_path = '' as $$
  select private.show_ops_resolve_holded_credit_note_claim(p_business_id, p_invoice_id, p_external_id, p_resolution);
$$;

-- Callers: finance staff may claim / request reconciliation; only the backend may complete, resolve or sync.
revoke all on function public.show_ops_holded_claim_invoice(uuid, uuid, uuid) from public, anon;
revoke all on function public.show_ops_holded_request_reconciliation(uuid, uuid, text) from public, anon;
revoke all on function public.show_ops_holded_claim_credit_note(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.show_ops_holded_claim_invoice(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.show_ops_holded_request_reconciliation(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.show_ops_holded_claim_credit_note(uuid, uuid, uuid, numeric, text) to authenticated, service_role;

revoke all on function public.show_ops_holded_complete_invoice(uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.show_ops_holded_resolve_invoice(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.show_ops_holded_sync_invoice(uuid, uuid, text, text, text, numeric, numeric, numeric, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.show_ops_holded_complete_credit_note(uuid, uuid, uuid, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.show_ops_holded_resolve_credit_note(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.show_ops_holded_complete_invoice(uuid, uuid, uuid, text, text, text, numeric, numeric, numeric, text) to service_role;
grant execute on function public.show_ops_holded_resolve_invoice(uuid, uuid, text, text) to service_role;
grant execute on function public.show_ops_holded_sync_invoice(uuid, uuid, text, text, text, numeric, numeric, numeric, timestamptz, boolean) to service_role;
grant execute on function public.show_ops_holded_complete_credit_note(uuid, uuid, uuid, text, text, text, numeric, text) to service_role;
grant execute on function public.show_ops_holded_resolve_credit_note(uuid, uuid, text, text) to service_role;

insert into supabase_migrations.schema_migrations (version, name)
values ('20260909010000', 'show_ops_holded_rpc_wrappers') on conflict do nothing;
