-- Partner administrators manage their organisation; sellers see their own activity.
alter table public.show_ops_members add column partner_admin boolean not null default false;
alter table public.show_ops_members add constraint show_ops_partner_admin_role check (not partner_admin or (role = 'seller' and supplier_id is not null));

create or replace function private.show_ops_is_partner_admin(p_business_id uuid,p_supplier_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.show_ops_members m where m.business_id=p_business_id
    and m.supplier_id=p_supplier_id and m.user_id=(select auth.uid()) and m.role='seller' and m.partner_admin);
$$;
revoke all on function private.show_ops_is_partner_admin(uuid,uuid) from public;
grant execute on function private.show_ops_is_partner_admin(uuid,uuid) to authenticated;

drop policy if exists show_ops_members_select on public.show_ops_members;
create policy show_ops_members_select on public.show_ops_members for select to authenticated using (
  public.show_ops_can_access(business_id) or user_id=(select auth.uid())
  or (role='seller' and private.show_ops_is_partner_admin(business_id,supplier_id))
);
create policy show_ops_members_admin_update on public.show_ops_members for update to authenticated
using (private.show_ops_can_manage_catalogue(business_id)) with check (private.show_ops_can_manage_catalogue(business_id));
create policy show_ops_members_update_senior on public.show_ops_members as restrictive for update to authenticated
using (private.show_ops_can_manage_catalogue(business_id)) with check (private.show_ops_can_manage_catalogue(business_id));
create policy show_ops_members_partner_remove on public.show_ops_members for delete to authenticated
using (role='seller' and not partner_admin and user_id<>(select auth.uid()) and private.show_ops_is_partner_admin(business_id,supplier_id));

-- Serialize membership changes by identity: a portal account cannot be reassigned
-- across organisations or mixed with a staff account by concurrent invitations.
create or replace function private.show_ops_guard_partner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('partner-member/'||new.user_id::text,0));
  if new.role='seller' then
    if new.supplier_id is null or not exists (select 1 from public.show_suppliers s where s.id=new.supplier_id and s.business_id=new.business_id) then
      raise exception 'Partner must belong to this business';
    end if;
    if exists (select 1 from public.businesses b where b.owner_id=new.user_id)
       or exists (select 1 from public.show_ops_members m where m.user_id=new.user_id and m.id<>new.id) then
      raise exception 'This account already belongs to another workspace or organisation';
    end if;
    if TG_OP='UPDATE' and old.role='seller' and row(old.business_id,old.supplier_id,old.user_id) is distinct from row(new.business_id,new.supplier_id,new.user_id) then
      raise exception 'Remove the existing membership before assigning a different organisation';
    end if;
  elsif exists (select 1 from public.show_ops_members m where m.user_id=new.user_id and m.role='seller' and m.id<>new.id) then
    raise exception 'This account is already a partner seller';
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_guard_partner_membership() from public;
create trigger show_ops_partner_membership_guard before insert or update on public.show_ops_members
for each row execute function private.show_ops_guard_partner_membership();

-- Raw booking access exposes office-only columns. Partners use a safe projection.
drop policy if exists show_bookings_seller_sel on public.show_bookings;
drop policy if exists show_bookings_seller_upd on public.show_bookings;
create or replace function private.show_ops_stamp_seller_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.show_ops_seller_supplier_id(new.business_id) is not null then
    if new.created_by is not null and new.created_by<>(select auth.uid()) then
      raise exception 'Seller attribution must match your account';
    end if;
    new.created_by := (select auth.uid());
    new.created_at := now();
    new.office_only_comments := null;
  end if;
  return new;
end;
$$;
revoke all on function private.show_ops_stamp_seller_booking() from public;
create trigger show_ops_stamp_seller_booking before insert on public.show_bookings
for each row execute function private.show_ops_stamp_seller_booking();
create index show_bookings_partner_created_idx on public.show_bookings(business_id,supplier_id,created_at desc,id desc);

create or replace function private.show_ops_partner_bookings(p_business_id uuid,p_supplier_id uuid,p_from timestamptz,p_to timestamptz,p_offset integer,p_limit integer)
returns table(id uuid,booking_ref text,guest_name text,show_name text,show_date date,hotel_name text,total_cost numeric,nett_total numeric,billing_mode text,payment_status text,created_at timestamptz,created_by uuid,adults integer,children integer,infants integer,island text,cancelled_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id,b.booking_ref,b.guest_name,b.show_name,b.show_date,b.hotel_name,b.total_cost,b.nett_total,b.billing_mode,b.payment_status,b.created_at,b.created_by,b.adults,b.children,b.infants,b.island,b.cancelled_at
  from public.show_bookings b
  where b.business_id=p_business_id and b.supplier_id=p_supplier_id
    and exists (select 1 from public.show_ops_members m where m.user_id=(select auth.uid()) and m.business_id=p_business_id and m.supplier_id=p_supplier_id and m.role='seller' and (m.partner_admin or b.created_by=m.user_id))
    and (p_from is null or b.created_at>=p_from) and (p_to is null or b.created_at<p_to)
  order by b.created_at desc,b.id desc limit greatest(1,least(coalesce(p_limit,500),500)) offset greatest(0,coalesce(p_offset,0));
$$;
create or replace function public.show_ops_partner_bookings(p_business_id uuid,p_supplier_id uuid,p_from timestamptz,p_to timestamptz,p_offset integer default 0,p_limit integer default 500)
returns table(id uuid,booking_ref text,guest_name text,show_name text,show_date date,hotel_name text,total_cost numeric,nett_total numeric,billing_mode text,payment_status text,created_at timestamptz,created_by uuid,adults integer,children integer,infants integer,island text,cancelled_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from private.show_ops_partner_bookings(p_business_id,p_supplier_id,p_from,p_to,p_offset,p_limit);
$$;
revoke all on function private.show_ops_partner_bookings(uuid,uuid,timestamptz,timestamptz,integer,integer) from public;
revoke all on function public.show_ops_partner_bookings(uuid,uuid,timestamptz,timestamptz,integer,integer) from public;
grant execute on function private.show_ops_partner_bookings(uuid,uuid,timestamptz,timestamptz,integer,integer) to authenticated;
grant execute on function public.show_ops_partner_bookings(uuid,uuid,timestamptz,timestamptz,integer,integer) to authenticated;

create or replace function private.show_ops_partner_team(p_business_id uuid,p_supplier_id uuid)
returns table(member_id uuid,user_id uuid,email text,full_name text,partner_admin boolean)
language sql stable security definer set search_path = '' as $$
  select m.id,m.user_id,p.email,p.full_name,m.partner_admin from public.show_ops_members m
  left join public.profiles p on p.id=m.user_id
  where m.business_id=p_business_id and m.supplier_id=p_supplier_id and m.role='seller'
    and exists(select 1 from public.show_ops_members viewer where viewer.user_id=(select auth.uid()) and viewer.role='seller' and viewer.business_id=p_business_id and viewer.supplier_id=p_supplier_id and (viewer.partner_admin or viewer.user_id=m.user_id))
  order by m.created_at,m.id;
$$;
create or replace function public.show_ops_partner_team(p_business_id uuid,p_supplier_id uuid)
returns table(member_id uuid,user_id uuid,email text,full_name text,partner_admin boolean)
language sql stable security invoker set search_path = '' as $$
 select * from private.show_ops_partner_team(p_business_id,p_supplier_id);
$$;
revoke all on function private.show_ops_partner_team(uuid,uuid) from public;
revoke all on function public.show_ops_partner_team(uuid,uuid) from public;
grant execute on function private.show_ops_partner_team(uuid,uuid) to authenticated;
grant execute on function public.show_ops_partner_team(uuid,uuid) to authenticated;

-- Ticket evidence is private and belongs to the seller who created the booking.
create or replace function private.show_ops_owns_ticket_path(p_path text,p_active boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.show_bookings b join public.show_ops_members m
    on m.business_id=b.business_id and m.supplier_id=b.supplier_id and m.user_id=(select auth.uid()) and m.role='seller'
    where b.created_by=m.user_id and b.business_id::text=split_part(p_path,'/',1) and b.id::text=split_part(p_path,'/',2)
    and p_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$'
    and (not p_active or b.cancelled_at is null));
$$;
revoke all on function private.show_ops_owns_ticket_path(text,boolean) from public;
grant execute on function private.show_ops_owns_ticket_path(text,boolean) to authenticated;
create policy show_ops_seller_proofs_select on storage.objects for select to authenticated
using (bucket_id='show-ops-proofs' and private.show_ops_owns_ticket_path(name));
create policy show_ops_seller_proofs_insert on storage.objects for insert to authenticated
with check (bucket_id='show-ops-proofs' and private.show_ops_owns_ticket_path(name,true));
-- Sellers cannot delete ticket evidence, including concurrent uploads.
create or replace function private.show_ops_attach_seller_ticket(p_booking uuid,p_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.show_bookings where id=p_booking for update;
  if split_part(p_path,'/',2)<>p_booking::text or not private.show_ops_owns_ticket_path(p_path,true) then
    raise exception 'You can only attach tickets to your own active bookings';
  end if;
  perform 1 from storage.objects o where o.bucket_id='show-ops-proofs' and o.name=p_path for key share;
  if not found then
    raise exception 'Upload the photo first';
  end if;
  update public.show_bookings b set no_show_proof_path=p_path,updated_at=now(),updated_by=(select auth.uid())
    where b.id=p_booking and b.created_by=(select auth.uid()) and b.cancelled_at is null and private.show_ops_owns_ticket_path(p_path,true);
  if not found then raise exception 'Booking no longer available'; end if;
end;
$$;
create or replace function public.show_ops_attach_seller_ticket(p_booking uuid,p_path text)
returns void language sql security invoker set search_path = '' as $$
 select private.show_ops_attach_seller_ticket(p_booking,p_path);
$$;
revoke all on function private.show_ops_attach_seller_ticket(uuid,text) from public;
revoke all on function public.show_ops_attach_seller_ticket(uuid,text) from public;
grant execute on function private.show_ops_attach_seller_ticket(uuid,text) to authenticated;
grant execute on function public.show_ops_attach_seller_ticket(uuid,text) to authenticated;

create or replace function private.show_ops_seller_ticket_booking(p_booking uuid)
returns table(id uuid,business_id uuid,supplier_id uuid,created_by uuid,cancelled_at timestamptz,booking_ref text,guest_name text,no_show_proof_path text)
language sql stable security definer set search_path = '' as $$
 select b.id,b.business_id,b.supplier_id,b.created_by,b.cancelled_at,b.booking_ref,b.guest_name,b.no_show_proof_path
 from public.show_bookings b join public.show_ops_members m on m.business_id=b.business_id and m.supplier_id=b.supplier_id
 where b.id=p_booking and b.created_by=(select auth.uid()) and m.user_id=(select auth.uid()) and m.role='seller';
$$;
create or replace function public.show_ops_seller_ticket_booking(p_booking uuid)
returns table(id uuid,business_id uuid,supplier_id uuid,created_by uuid,cancelled_at timestamptz,booking_ref text,guest_name text,no_show_proof_path text)
language sql stable security invoker set search_path = '' as $$
 select * from private.show_ops_seller_ticket_booking(p_booking);
$$;
revoke all on function private.show_ops_seller_ticket_booking(uuid) from public;
revoke all on function public.show_ops_seller_ticket_booking(uuid) from public;
grant execute on function private.show_ops_seller_ticket_booking(uuid) to authenticated;
grant execute on function public.show_ops_seller_ticket_booking(uuid) to authenticated;

create or replace function private.show_ops_can_invite_seller(p_business_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.show_ops_can_manage_catalogue(p_business_id) or exists(
 select 1 from public.show_ops_members m where m.business_id=p_business_id and m.user_id=(select auth.uid()) and m.role in ('office','finance'));
$$;
revoke all on function private.show_ops_can_invite_seller(uuid) from public;
grant execute on function private.show_ops_can_invite_seller(uuid) to authenticated;

-- Invitations insert through the caller's JWT, so revocation still takes effect
-- after server-side Auth account provisioning has begun. Only ordinary sellers.
create policy show_ops_members_invite_seller on public.show_ops_members for insert to authenticated
with check (role='seller' and not partner_admin and supplier_id is not null and (
 private.show_ops_is_partner_admin(business_id,supplier_id)
 or private.show_ops_can_invite_seller(business_id)
));

-- Exceptional booked nights are safe calendar data, with no guest or seller details.
create or replace function private.show_ops_partner_booked_dates(p_business_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_object_agg(x.product_id,x.dates),'{}'::jsonb) from (
   select b.product_id,jsonb_agg(distinct b.show_date order by b.show_date) as dates
   from public.show_bookings b where b.business_id=p_business_id and b.product_id is not null
   and b.cancelled_at is null and b.show_date>=current_date and b.show_date<=current_date+interval '12 months'
   and public.show_ops_seller_supplier_id(p_business_id) is not null group by b.product_id
 ) x;
$$;
create or replace function public.show_ops_partner_booked_dates(p_business_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select private.show_ops_partner_booked_dates(p_business_id);
$$;
revoke all on function private.show_ops_partner_booked_dates(uuid) from public;
revoke all on function public.show_ops_partner_booked_dates(uuid) from public;
grant execute on function private.show_ops_partner_booked_dates(uuid) to authenticated;
grant execute on function public.show_ops_partner_booked_dates(uuid) to authenticated;
