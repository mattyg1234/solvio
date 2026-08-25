-- Supplier contact email for Verifactu invoice packs.

alter table public.show_suppliers
  add column if not exists email text;
