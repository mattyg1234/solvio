-- Configurable add-ons are separate from priced ticket types and do not add seats.
create table public.show_extras (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 product_id uuid not null references public.show_products(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 description text check(length(description)<=1000),
 unit_price numeric(12,2) not null check(unit_price>=0),
 charge_basis text not null default 'quantity' check(charge_basis in ('per_booking','per_person','quantity')),
 commissionable boolean not null default true,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index show_extras_name_idx on public.show_extras(product_id,lower(trim(name))) where active;
create index show_extras_business_idx on public.show_extras(business_id,product_id);
alter table public.show_extras enable row level security;
grant select,insert,update,delete on public.show_extras to authenticated;
create policy show_extras_read on public.show_extras for select to authenticated using (
 public.show_ops_can_access(business_id) or (active and public.show_ops_seller_supplier_id(business_id) is not null)
);
create policy show_extras_write on public.show_extras for all to authenticated using(private.show_ops_can_manage_catalogue(business_id)) with check(private.show_ops_can_manage_catalogue(business_id));
create trigger show_ops_extra_scope before insert or update on public.show_extras for each row execute function private.show_ops_ticket_type_scope();
alter table public.show_bookings add column extras_snapshot jsonb not null default '[]'::jsonb check(jsonb_typeof(extras_snapshot)='array' and jsonb_array_length(extras_snapshot)<=50);
alter table public.show_bookings add column infant_nett_total numeric(12,2) not null default 0;

-- The app supplies authoritative catalogue snapshots; direct seller writes must
-- also match current catalogue values, not a user-supplied price or organisation.
create or replace function private.show_ops_seller_extra_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare line jsonb; extra public.show_extras%rowtype; qty integer; pct numeric; seen uuid[]:='{}';
begin
 if public.show_ops_seller_supplier_id(new.business_id) is null then return new; end if;
 for line in select value from jsonb_array_elements(new.extras_snapshot) loop
  select * into extra from public.show_extras where id=(line->>'id')::uuid and business_id=new.business_id and product_id=new.product_id and active;
  if not found or extra.id=any(seen) then raise exception 'Extra must be an available choice for this show'; end if;
  seen:=array_append(seen,extra.id);
  select case when extra.commissionable then s.invoice_nett_percent else 100 end into pct from public.show_suppliers s where s.id=new.supplier_id and s.business_id=new.business_id;
  qty:=(line->>'quantity')::integer;
  if qty is null or qty<1 or (extra.charge_basis='quantity' and qty>100)
    or (extra.charge_basis='per_booking' and qty<>1)
    or (extra.charge_basis='per_person' and qty<>(new.adults+new.children+new.infants)) then
    raise exception 'Extra quantity does not match its charging rule';
  end if;
  if (line->>'unit_price')::numeric is distinct from extra.unit_price
    or (line->>'name') is distinct from extra.name
    or (line->>'charge_basis') is distinct from extra.charge_basis
    or (line->>'commissionable')::boolean is distinct from extra.commissionable
    or (line->>'gross_total')::numeric is distinct from round(extra.unit_price*qty,2)
    or (line->>'nett_total')::numeric is distinct from round(round(extra.unit_price*qty,2)*coalesce(pct,100)/100,2) then
    raise exception 'Extra prices must match the saved catalogue';
  end if;
 end loop;
 return new;
end;
$$;
revoke all on function private.show_ops_seller_extra_scope() from public;
create trigger show_ops_seller_extra_scope before insert on public.show_bookings for each row execute function private.show_ops_seller_extra_scope();
