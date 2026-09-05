-- Role and geography are independent. NULL explicitly means all islands; [] means none.
alter table public.show_ops_members add column allowed_islands text[];
create or replace function private.show_ops_global_admin(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=(select auth.uid()))
 or exists(select 1 from public.show_ops_members m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.role='admin' and m.allowed_islands is null);
$$;
create or replace function private.show_ops_island_access(p_business_id uuid,p_island text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.businesses b where b.id=p_business_id and b.owner_id=(select auth.uid()))
 or exists(select 1 from public.show_ops_members m where m.business_id=p_business_id and m.user_id=(select auth.uid())
 and (m.allowed_islands is null or p_island=any(m.allowed_islands)));
$$;
create or replace function private.show_ops_any_island(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.show_ops_global_admin(p_business_id) or exists(select 1 from public.show_ops_members m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and (m.allowed_islands is null or cardinality(m.allowed_islands)>0));
$$;
create or replace function private.show_ops_scope_covers(p_business_id uuid,p_islands text[])
returns boolean language sql stable security definer set search_path = '' as $$
 select private.show_ops_global_admin(p_business_id) or exists(select 1 from public.show_ops_members m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and (m.allowed_islands is null or (p_islands is not null and p_islands<@m.allowed_islands)));
$$;
create or replace function private.show_ops_product_access(p_business_id uuid,p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.show_products p where p.id=p_id and p.business_id=p_business_id and private.show_ops_island_access(p.business_id,p.island));
$$;
create or replace function private.show_ops_booking_access(p_business_id uuid,p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.show_bookings b where b.id=p_id and b.business_id=p_business_id and private.show_ops_island_access(b.business_id,b.island));
$$;
create or replace function private.show_ops_invoice_access(p_business_id uuid,p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.show_invoices i where i.id=p_id and i.business_id=p_business_id and private.show_ops_island_access(i.business_id,i.island));
$$;
create or replace function private.show_ops_supplier_access(p_business_id uuid,p_island text,p_write boolean)
returns boolean language sql stable security definer set search_path = '' as $$
 select case when nullif(trim(p_island),'') is null then
   case when p_write then private.show_ops_global_admin(p_business_id) else private.show_ops_any_island(p_business_id) end
 else private.show_ops_island_access(p_business_id,p_island) end;
$$;
create or replace function private.show_ops_proof_island(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.show_bookings b where b.business_id::text=split_part(p_path,'/',1) and b.id::text=split_part(p_path,'/',2) and private.show_ops_island_access(b.business_id,b.island));
$$;
-- All helper functions are private and callable only by signed-in database roles.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in('show_ops_global_admin','show_ops_island_access','show_ops_any_island','show_ops_scope_covers','show_ops_product_access','show_ops_booking_access','show_ops_invoice_access','show_ops_supplier_access','show_ops_proof_island') loop
 execute format('revoke all on function %s from public',f.signature); execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;

-- Restrictive policies constrain legacy permissive FOR ALL policies too.
do $$ declare t text; begin
 foreach t in array array['show_products','show_hotels','show_bus_stops','show_bus_orders','show_bus_night_orders','show_bookings','show_night_closes','show_invoices'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create policy %I on public.%I as restrictive for all to authenticated using(private.show_ops_island_access(business_id,island)) with check(private.show_ops_island_access(business_id,island))',t||'_island_scope',t);
 end if; end loop;
 foreach t in array array['show_ticket_types','show_extras','show_rate_prices'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create policy %I on public.%I as restrictive for all to authenticated using(private.show_ops_product_access(business_id,product_id)) with check(private.show_ops_product_access(business_id,product_id))',t||'_island_scope',t);
 end if; end loop;
 foreach t in array array['show_booking_payments','show_booking_history'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create policy %I on public.%I as restrictive for all to authenticated using(private.show_ops_booking_access(business_id,booking_id)) with check(private.show_ops_booking_access(business_id,booking_id))',t||'_island_scope',t);
 end if; end loop;
end $$;
create policy show_suppliers_island_read on public.show_suppliers as restrictive for select to authenticated using(private.show_ops_supplier_access(business_id,island,false));
create policy show_suppliers_island_insert on public.show_suppliers as restrictive for insert to authenticated with check(private.show_ops_supplier_access(business_id,island,true));
create policy show_suppliers_island_update on public.show_suppliers as restrictive for update to authenticated using(private.show_ops_supplier_access(business_id,island,true)) with check(private.show_ops_supplier_access(business_id,island,true));
create policy show_suppliers_island_delete on public.show_suppliers as restrictive for delete to authenticated using(private.show_ops_supplier_access(business_id,island,true));
create policy show_invoice_lines_island_scope on public.show_invoice_lines as restrictive for all to authenticated using(
 private.show_ops_invoice_access(business_id,invoice_id) and (booking_id is null or private.show_ops_booking_access(business_id,booking_id))
) with check(private.show_ops_invoice_access(business_id,invoice_id) and (booking_id is null or private.show_ops_booking_access(business_id,booking_id)));
create policy show_proofs_island_scope on storage.objects as restrictive for all to authenticated
using(bucket_id<>'show-ops-proofs' or private.show_ops_proof_island(name)) with check(bucket_id<>'show-ops-proofs' or private.show_ops_proof_island(name));

-- Global catalogues have no safe geographic owner. Read for booking; only global
-- administrators can change their shared definitions.
do $$ declare t text; op text; begin
 foreach t in array array['show_supplier_rates','show_pickup_timetables'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create policy %I on public.%I as restrictive for select to authenticated using(private.show_ops_any_island(business_id))',t||'_scope_read',t);
 foreach op in array array['insert','update','delete'] loop
 execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',t||'_scope_'||op,t,op,
 case op when 'insert' then 'with check(private.show_ops_global_admin(business_id))' when 'update' then 'using(private.show_ops_global_admin(business_id)) with check(private.show_ops_global_admin(business_id))' else 'using(private.show_ops_global_admin(business_id))' end);
 end loop; end if; end loop;
end $$;

drop policy show_ops_members_update_senior on public.show_ops_members;
create policy show_ops_members_update_senior on public.show_ops_members as restrictive for update to authenticated using(private.show_ops_global_admin(business_id)) with check(private.show_ops_global_admin(business_id));
create policy show_ops_members_invite_scope on public.show_ops_members as restrictive for insert to authenticated with check(
 private.show_ops_global_admin(business_id) or (role='seller' and not partner_admin and private.show_ops_scope_covers(business_id,allowed_islands))
);
create policy show_ops_members_delete_scope on public.show_ops_members as restrictive for delete to authenticated using(
 private.show_ops_global_admin(business_id) or (role='seller' and not partner_admin and user_id<>(select auth.uid()) and private.show_ops_is_partner_admin(business_id,supplier_id) and private.show_ops_scope_covers(business_id,allowed_islands))
);
create policy show_ops_members_read_scope on public.show_ops_members as restrictive for select to authenticated using(
 private.show_ops_global_admin(business_id) or user_id=(select auth.uid()) or (role='seller' and private.show_ops_is_partner_admin(business_id,supplier_id) and private.show_ops_scope_covers(business_id,allowed_islands))
);

create or replace function private.show_ops_supplier_access(p_business_id uuid,p_island text,p_write boolean)
returns boolean language sql stable security definer set search_path = '' as $$
 select case when nullif(trim(p_island),'') is null or 'ALL'=any(regexp_split_to_array(upper(p_island),'\s*,\s*')) then
   case when p_write then private.show_ops_global_admin(p_business_id) else private.show_ops_any_island(p_business_id) end
 else case when p_write then (select bool_and(private.show_ops_island_access(p_business_id,trim(x))) from unnest(string_to_array(p_island,',')) x)
 else (select bool_or(private.show_ops_island_access(p_business_id,trim(x))) from unnest(string_to_array(p_island,',')) x) end end;
$$;

-- A permitted island label cannot be used to reference a hidden show or hotel.
create or replace function private.show_ops_guard_island_references()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb:=to_jsonb(new); before_row jsonb; ref text; key text; table_name text; valid boolean; row_island text:=r->>'island'; biz uuid:=(r->>'business_id')::uuid;
begin
 if (select auth.uid()) is null then return new; end if;
 if TG_OP='UPDATE' then
  before_row:=to_jsonb(old);
  if (r-'updated_at'-'updated_by')=(before_row-'updated_at'-'updated_by') then return new; end if;
 end if;
 foreach key in array array['product_id','hotel_id','pickup_stop_id','bus_stop_id','supplier_id','invoice_id','rate_id','sale_rate_id','invoice_rate_id'] loop
  ref:=r->>key;
  if ref is null then continue; end if;
  -- Do not make historic guest-detail edits rewrite unrelated legacy references.
  if TG_OP='UPDATE' and ref is not distinct from before_row->>key and row_island is not distinct from before_row->>'island' and r->>'business_id'=before_row->>'business_id' then continue; end if;
  table_name:=case key when 'product_id' then 'show_products' when 'hotel_id' then 'show_hotels' when 'pickup_stop_id' then 'show_bus_stops' when 'bus_stop_id' then 'show_bus_stops' when 'supplier_id' then 'show_suppliers' when 'invoice_id' then 'show_invoices' else 'show_supplier_rates' end;
  execute format('select exists(select 1 from public.%I where id::text=$1 and business_id=$2)',table_name) into valid using ref,biz;
  if not valid then raise exception 'Referenced record must belong to this workspace'; end if;
  if key in ('product_id','hotel_id','pickup_stop_id','bus_stop_id') and row_island is not null then
   execute format('select exists(select 1 from public.%I where id::text=$1 and business_id=$2 and island=$3 and private.show_ops_island_access(business_id,island))',table_name) into valid using ref,biz,row_island;
   if not valid then raise exception 'Referenced show or pick-up must match your permitted island'; end if;
  elsif key='invoice_id' then
   if not private.show_ops_invoice_access(biz,ref::uuid) then raise exception 'Invoice is outside your island access'; end if;
  elsif key='supplier_id' then
   select private.show_ops_supplier_access(s.business_id,s.island,false) into valid from public.show_suppliers s where s.id=ref::uuid;
   if not coalesce(valid,false) then raise exception 'Partner is outside your island access'; end if;
  end if;
 end loop;
 if r ? 'stop_ids' and jsonb_typeof(r->'stop_ids')='array' then
  for ref in select value from jsonb_array_elements_text(r->'stop_ids') loop
   if not exists(select 1 from public.show_bus_stops s where s.id::text=ref and s.business_id=biz and s.island=row_island and private.show_ops_island_access(biz,s.island)) then
    raise exception 'Every ordered stop must belong to your permitted island';
   end if;
  end loop;
 end if;
 return new;
end;
$$;
revoke all on function private.show_ops_guard_island_references() from public;
do $$ declare t text; begin
 foreach t in array array['show_bookings','show_hotels','show_night_closes','show_bus_night_orders','show_invoices','show_suppliers','show_rate_prices'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create trigger show_ops_island_references before insert or update on public.%I for each row execute function private.show_ops_guard_island_references()',t);
 end if; end loop;
end $$;

-- Definer projections also apply the caller geographic scope.
create or replace function private.show_ops_partner_bookings(p_business_id uuid,p_supplier_id uuid,p_from timestamptz,p_to timestamptz,p_offset integer,p_limit integer)
returns table(id uuid,booking_ref text,guest_name text,show_name text,show_date date,hotel_name text,total_cost numeric,nett_total numeric,billing_mode text,payment_status text,created_at timestamptz,created_by uuid,adults integer,children integer,infants integer,island text,cancelled_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id,b.booking_ref,b.guest_name,b.show_name,b.show_date,b.hotel_name,b.total_cost,b.nett_total,b.billing_mode,b.payment_status,b.created_at,b.created_by,b.adults,b.children,b.infants,b.island,b.cancelled_at
  from public.show_bookings b
  where private.show_ops_island_access(b.business_id,b.island) and b.business_id=p_business_id and b.supplier_id=p_supplier_id
    and exists (select 1 from public.show_ops_members m where m.user_id=(select auth.uid()) and m.business_id=p_business_id and m.supplier_id=p_supplier_id and m.role='seller' and (m.partner_admin or b.created_by=m.user_id))
    and (p_from is null or b.created_at>=p_from) and (p_to is null or b.created_at<p_to)
  order by b.created_at desc,b.id desc limit greatest(1,least(coalesce(p_limit,500),500)) offset greatest(0,coalesce(p_offset,0));
$$;

create or replace function private.show_ops_owns_ticket_path(p_path text,p_active boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.show_bookings b join public.show_ops_members m
    on m.business_id=b.business_id and m.supplier_id=b.supplier_id and m.user_id=(select auth.uid()) and m.role='seller'
    where private.show_ops_island_access(b.business_id,b.island) and b.created_by=m.user_id and b.business_id::text=split_part(p_path,'/',1) and b.id::text=split_part(p_path,'/',2)
    and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
    and (not p_active or b.cancelled_at is null));
$$;

create or replace function private.show_ops_seller_ticket_booking(p_booking uuid)
returns table(id uuid,business_id uuid,supplier_id uuid,created_by uuid,cancelled_at timestamptz,booking_ref text,guest_name text,no_show_proof_path text)
language sql stable security definer set search_path = '' as $$
 select b.id,b.business_id,b.supplier_id,b.created_by,b.cancelled_at,b.booking_ref,b.guest_name,b.no_show_proof_path
 from public.show_bookings b join public.show_ops_members m on m.business_id=b.business_id and m.supplier_id=b.supplier_id
 where private.show_ops_island_access(b.business_id,b.island) and b.id=p_booking and b.created_by=(select auth.uid()) and m.user_id=(select auth.uid()) and m.role='seller';
$$;

create or replace function private.show_ops_partner_booked_dates(p_business_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(x.product_id,x.dates),'{}'::jsonb) from (
   select b.product_id,jsonb_agg(distinct b.show_date order by b.show_date) as dates
   from public.show_bookings b where private.show_ops_island_access(b.business_id,b.island) and b.business_id=p_business_id and b.product_id is not null
   and b.cancelled_at is null and b.show_date>=current_date and b.show_date<=current_date+interval '12 months'
   and public.show_ops_seller_supplier_id(p_business_id) is not null group by b.product_id
 ) x;
$$;

create or replace function private.show_ops_partner_team(p_business_id uuid,p_supplier_id uuid)
returns table(member_id uuid,user_id uuid,email text,full_name text,partner_admin boolean)
language sql stable security definer set search_path = '' as $$
  select m.id,m.user_id,p.email,p.full_name,m.partner_admin from public.show_ops_members m
  left join public.profiles p on p.id=m.user_id
  where private.show_ops_scope_covers(m.business_id,m.allowed_islands) and m.business_id=p_business_id and m.supplier_id=p_supplier_id and m.role='seller'
    and exists(select 1 from public.show_ops_members viewer where viewer.user_id=(select auth.uid()) and viewer.role='seller' and viewer.business_id=p_business_id and viewer.supplier_id=p_supplier_id and (viewer.partner_admin or viewer.user_id=m.user_id))
  order by m.created_at,m.id;
$$;

-- Legacy timetable rows have no reliable geographic key and are not used by the app.
do $$ begin if to_regclass('public.show_pickup_timetables') is not null then execute 'create policy show_pickup_timetables_global_read on public.show_pickup_timetables as restrictive for select to authenticated using(private.show_ops_global_admin(business_id))'; end if; end $$;

create policy show_ops_members_global_insert on public.show_ops_members for insert to authenticated with check(private.show_ops_global_admin(business_id));
create policy show_ops_members_global_delete on public.show_ops_members for delete to authenticated using(private.show_ops_global_admin(business_id));

-- Generated manual supplement rows retain their source for geographic privacy.
alter table public.show_invoice_lines add column source_booking_id uuid references public.show_bookings(id) on delete cascade;
create index show_invoice_lines_source_booking_idx on public.show_invoice_lines(source_booking_id) where source_booking_id is not null;
create policy show_invoice_lines_source_scope on public.show_invoice_lines as restrictive for all to authenticated
using(source_booking_id is null or private.show_ops_booking_access(business_id,source_booking_id))
with check(source_booking_id is null or private.show_ops_booking_access(business_id,source_booking_id));
create or replace function private.show_ops_invoice_island_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare inv public.show_invoices%rowtype; b public.show_bookings%rowtype; booking_ref_id uuid;
begin
 if TG_TABLE_NAME='show_invoices' then
  if TG_OP='UPDATE' and new.island is distinct from old.island and (
   exists(select 1 from public.show_invoice_lines l where l.invoice_id=old.id)
   or exists(select 1 from public.show_bookings x where x.invoice_id=old.id)
  ) then raise exception 'An invoice with bookings or lines keeps its original island'; end if;
  return new;
 end if;
 select * into inv from public.show_invoices where id=new.invoice_id;
 if not found or inv.business_id<>new.business_id then raise exception 'Invoice must belong to this workspace'; end if;
 foreach booking_ref_id in array array[new.booking_id,new.source_booking_id] loop
  if booking_ref_id is null then continue; end if;
  select * into b from public.show_bookings where id=booking_ref_id;
  if not found or b.business_id<>new.business_id or (inv.island is not null and inv.island<>b.island) then
   raise exception 'Invoice island must match every linked booking';
  end if;
 end loop;
 return new;
end;
$$;
revoke all on function private.show_ops_invoice_island_integrity() from public;
create trigger show_ops_invoice_island_integrity before update on public.show_invoices for each row execute function private.show_ops_invoice_island_integrity();
create trigger show_ops_invoice_line_island_integrity before insert or update on public.show_invoice_lines for each row execute function private.show_ops_invoice_island_integrity();
