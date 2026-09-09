/*
 * Expenses capture (Accounts line of the MHT quote).
 *
 * Office staff record a cost once in Solvio (with the receipt photo); Solvio
 * pushes it to Holded as a draft purchase so the accountant never retypes it,
 * and the cost side of the per-island P&L comes from here. Simple columns, no
 * lifecycle guard: a purchase draft in Holded is cheap to correct or delete.
 */

create table if not exists public.show_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  expense_date date not null,
  supplier_name text not null,
  supplier_tax_id text,
  description text not null,
  category text not null default 'other',
  island text,
  product_id uuid references public.show_products (id) on delete set null,
  net_amount numeric(12,2) not null check (net_amount >= 0),
  tax_rate numeric(6,2) not null default 0 check (tax_rate >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  currency text not null default 'eur' check (currency in ('eur', 'gbp', 'usd')),
  receipt_path text,
  notes text,
  holded_contact_id text,
  holded_purchase_id text,
  holded_status text not null default 'not_sent' check (holded_status in ('not_sent', 'draft', 'error')),
  holded_pushed_at timestamptz,
  holded_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists show_expenses_business_date_idx on public.show_expenses (business_id, expense_date desc);
create index if not exists show_expenses_business_island_idx on public.show_expenses (business_id, island, expense_date);

alter table public.show_expenses enable row level security;
drop policy if exists show_expenses_select on public.show_expenses;
create policy show_expenses_select on public.show_expenses
  for select to authenticated using (private.show_ops_has_action(business_id, 'office', array['invoices', 'reports']));
drop policy if exists show_expenses_write on public.show_expenses;
create policy show_expenses_write on public.show_expenses
  for all to authenticated
  using (private.show_ops_has_action(business_id, 'finance', array['invoices']))
  with check (private.show_ops_has_action(business_id, 'finance', array['invoices']));

comment on table public.show_expenses is
  'Operating costs captured in Solvio; pushed to Holded as draft purchases (holded_purchase_id). Cost side of the P&L.';

insert into supabase_migrations.schema_migrations (version, name)
values ('20260909020000', 'show_ops_expenses') on conflict do nothing;
