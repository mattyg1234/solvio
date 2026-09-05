-- Ticket types are priced choices within one physical show: all use its capacity.
create table public.show_ticket_types (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 product_id uuid not null references public.show_products(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 description text check(length(description)<=1000),
 adult_price numeric(12,2) not null default 0 check(adult_price>=0),
 child_price numeric(12,2) not null default 0 check(child_price>=0),
 infant_price numeric(12,2) not null default 0 check(infant_price>=0),
 adult_price_no_transport numeric(12,2) check(adult_price_no_transport>=0),
 child_price_no_transport numeric(12,2) check(child_price_no_transport>=0),
 infant_price_no_transport numeric(12,2) check(infant_price_no_transport>=0),
 adult_nett numeric(12,2) check(adult_nett>=0),
 child_nett numeric(12,2) check(child_nett>=0),
 transport_available boolean not null default true,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index show_ticket_types_name_idx on public.show_ticket_types(product_id,lower(trim(name))) where active;
create index show_ticket_types_business_idx on public.show_ticket_types(business_id,product_id);
alter table public.show_ticket_types enable row level security;
grant select,insert,update,delete on public.show_ticket_types to authenticated;
create policy show_ticket_types_read on public.show_ticket_types for select to authenticated using(
 public.show_ops_can_access(business_id) or (active and public.show_ops_seller_supplier_id(business_id) is not null)
);
create policy show_ticket_types_write on public.show_ticket_types for all to authenticated
using(private.show_ops_can_manage_catalogue(business_id)) with check(private.show_ops_can_manage_catalogue(business_id));
alter table public.show_bookings add column ticket_type_id uuid references public.show_ticket_types(id) on delete restrict;
alter table public.show_bookings add column ticket_type_name text;
create index show_bookings_ticket_type_idx on public.show_bookings(ticket_type_id) where ticket_type_id is not null;

create or replace function private.show_ops_ticket_type_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.show_products p where p.id=new.product_id and p.business_id=new.business_id) then
   raise exception 'Ticket type must belong to this show and business';
 end if;
 if TG_OP='UPDATE' and row(new.product_id,new.business_id) is distinct from row(old.product_id,old.business_id) then
   raise exception 'Create a new ticket type to move it to a different show';
 end if;
 return new;
end;
$$;
revoke all on function private.show_ops_ticket_type_scope() from public;
create trigger show_ops_ticket_type_scope before insert or update on public.show_ticket_types for each row execute function private.show_ops_ticket_type_scope();

create or replace function private.show_ops_booking_ticket_type_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type public.show_ticket_types%rowtype;
begin
 if TG_OP='UPDATE' and row(new.ticket_type_id,new.product_id,new.business_id) is not distinct from row(old.ticket_type_id,old.product_id,old.business_id) then return new; end if;
 if new.ticket_type_id is null then return new; end if;
 select * into v_type from public.show_ticket_types t where t.id=new.ticket_type_id;
 if not found or v_type.business_id<>new.business_id or v_type.product_id<>new.product_id then
   raise exception 'Ticket type must match the selected show';
 end if;
 if not v_type.active then raise exception 'This ticket type is no longer available'; end if;
 if new.transport_required and not v_type.transport_available then raise exception 'This ticket type does not offer transport'; end if;
 new.ticket_type_name:=v_type.name;
 return new;
end;
$$;
revoke all on function private.show_ops_booking_ticket_type_scope() from public;
create trigger show_ops_booking_ticket_type_scope before insert or update on public.show_bookings for each row execute function private.show_ops_booking_ticket_type_scope();
