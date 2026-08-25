-- Track Verifactu invoice emails sent to suppliers.

alter table public.show_invoices
  add column if not exists emailed_at timestamptz,
  add column if not exists emailed_to text;
