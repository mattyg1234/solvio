-- Proper invoices: draft → edit prices → issue. Verifactu-ready fields (API later).
-- Canaries default tax is 0 (IGIC) — stored per line, not assumed 21%.

alter table public.show_suppliers
  add column if not exists tax_id text,
  add column if not exists legal_name text,
  add column if not exists invoice_address text;

alter table public.show_invoices
  add column if not exists status text not null default 'draft',
  add column if not exists series text not null default 'INV',
  add column if not exists invoice_number text,
  add column if not exists issuer_name text,
  add column if not exists issuer_tax_id text,
  add column if not exists issuer_address text,
  add column if not exists recipient_name text,
  add column if not exists recipient_tax_id text,
  add column if not exists recipient_address text,
  add column if not exists currency text not null default 'eur',
  add column if not exists notes text,
  add column if not exists net_total numeric(12,2) not null default 0,
  add column if not exists vat_total numeric(12,2) not null default 0,
  add column if not exists verifactu_status text not null default 'not_sent',
  add column if not exists verifactu_payload jsonb,
  add column if not exists verifactu_recorded_at timestamptz,
  add column if not exists verifactu_error text;

alter table public.show_invoices drop constraint if exists show_invoices_status_check;
alter table public.show_invoices
  add constraint show_invoices_status_check
    check (status in ('draft', 'issued', 'voided'));

alter table public.show_invoices drop constraint if exists show_invoices_verifactu_status_check;
alter table public.show_invoices
  add constraint show_invoices_verifactu_status_check
    check (verifactu_status in ('not_sent', 'queued', 'recorded', 'error', 'manual'));

update public.show_invoices
set
  status = case
    when voided then 'voided'
    when coalesce(verifactu_number, '') <> '' then 'issued'
    else 'draft'
  end,
  invoice_number = coalesce(nullif(invoice_number, ''), verifactu_number),
  recipient_name = coalesce(nullif(recipient_name, ''), supplier_name),
  net_total = case when net_total = 0 then total_amount else net_total end,
  verifactu_status = case
    when coalesce(verifactu_number, '') <> '' then 'manual'
    else verifactu_status
  end
where true;

create unique index if not exists show_invoices_business_number_uidx
  on public.show_invoices (business_id, invoice_number)
  where invoice_number is not null;

alter table public.show_invoice_lines
  drop constraint if exists show_invoice_lines_invoice_id_booking_id_key;

alter table public.show_invoice_lines
  alter column booking_id drop not null,
  alter column booking_ref drop not null,
  alter column guest_name drop not null;

alter table public.show_invoice_lines
  alter column booking_ref set default '',
  alter column guest_name set default '';

alter table public.show_invoice_lines
  add column if not exists description text not null default '',
  add column if not exists quantity numeric(12,2) not null default 0,
  add column if not exists unit_price numeric(12,2) not null default 0,
  add column if not exists adult_unit_price numeric(12,2) not null default 0,
  add column if not exists child_unit_price numeric(12,2) not null default 0,
  add column if not exists vat_rate numeric(6,2) not null default 0,
  add column if not exists vat_amount numeric(12,2) not null default 0,
  add column if not exists net_total numeric(12,2) not null default 0,
  add column if not exists line_kind text not null default 'booking';

alter table public.show_invoice_lines drop constraint if exists show_invoice_lines_line_kind_check;
alter table public.show_invoice_lines
  add constraint show_invoice_lines_line_kind_check
    check (line_kind in ('booking', 'manual'));

update public.show_invoice_lines
set
  description = case
    when coalesce(description, '') <> '' then description
    when coalesce(guest_name, '') <> '' then guest_name
    else 'Line'
  end,
  quantity = case
    when quantity > 0 then quantity
    else greatest(coalesce(adults, 0), 0) + greatest(coalesce(children, 0), 0)
  end,
  adult_unit_price = case
    when adult_unit_price <> 0 then adult_unit_price
    when coalesce(adults, 0) > 0 then round(adult_nett_total / adults, 2)
    else 0
  end,
  child_unit_price = case
    when child_unit_price <> 0 then child_unit_price
    when coalesce(children, 0) > 0 then round(child_nett_total / children, 2)
    else 0
  end,
  net_total = case when net_total = 0 then line_total else net_total end,
  unit_price = case
    when unit_price <> 0 then unit_price
    when (greatest(coalesce(adults, 0), 0) + greatest(coalesce(children, 0), 0)) > 0
      then round(line_total / (greatest(adults, 0) + greatest(children, 0)), 2)
    else line_total
  end,
  line_kind = case when booking_id is null then 'manual' else line_kind end
where true;

create unique index if not exists show_invoice_lines_invoice_booking_uidx
  on public.show_invoice_lines (invoice_id, booking_id)
  where booking_id is not null;

comment on column public.show_invoices.status is
  'draft = editable prices; issued = numbered and locked; voided = cancelled.';
comment on column public.show_invoices.verifactu_payload is
  'JSON the Verifactu adapter will POST when SHOW_OPS_VERIFACTU_API_KEY is set.';
comment on column public.show_invoices.verifactu_status is
  'not_sent until issue; manual when no API key; recorded after a successful API call.';
