-- Partners carry their own payment days (0–365, Joel's per-partner terms), and an invoice run copies them onto
-- the invoice. Invoices only accepted 7/15/30/45/60/90, so every run for the three Get Your Guide partners
-- (14 days) failed on this check (27 Oct 2026). Invoices now take the same range as partners.
alter table public.show_invoices drop constraint if exists show_invoices_payment_terms_days_check;
alter table public.show_invoices
  add constraint show_invoices_payment_terms_days_check check (payment_terms_days between 0 and 365);
