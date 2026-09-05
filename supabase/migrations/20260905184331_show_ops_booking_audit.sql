-- Full automatic booking history begins here. Existing history is retained;
-- missing past edits are deliberately not invented or backfilled.
alter table public.show_bookings add column created_by_name text;
drop policy if exists show_booking_history_ins on public.show_booking_history;
revoke insert,update,delete on public.show_booking_history from authenticated;

create or replace function private.show_ops_audit_actor_name(p_user uuid,p_business uuid)
returns text language sql stable security definer set search_path = '' as $$
 select case when p_user is null then 'System / integration' else coalesce(
 (select nullif(m.display_name,'') from public.show_ops_members m where m.user_id=p_user and m.business_id=p_business limit 1),
 (select coalesce(nullif(p.full_name,''),nullif(p.email,'')) from public.profiles p where p.id=p_user),p_user::text) end;
$$;
revoke all on function private.show_ops_audit_actor_name(uuid,uuid) from public;

create or replace function private.show_ops_booking_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP='INSERT' then
  if (select auth.uid()) is not null then
   new.created_by:=(select auth.uid());new.created_at:=now();
   new.created_by_name:=private.show_ops_audit_actor_name((select auth.uid()),new.business_id);
  else
   new.created_by_name:=null;
  end if;
 elsif (select auth.uid()) is not null and row(new.created_by,new.created_at,new.created_by_name) is distinct from row(old.created_by,old.created_at,old.created_by_name) then
  raise exception 'A booking keeps its original creator and creation time';
 end if;
 return new;
end;
$$;
revoke all on function private.show_ops_booking_creator() from public;
create trigger show_ops_booking_creator before insert or update on public.show_bookings for each row execute function private.show_ops_booking_creator();

create or replace function private.show_ops_record_booking_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare before_row jsonb:='{}'; after_row jsonb:=to_jsonb(new); changes jsonb; actor uuid:=(select auth.uid());
begin
 if TG_OP='UPDATE' then before_row:=to_jsonb(old); end if;
 select coalesce(jsonb_object_agg(key,jsonb_build_object('from',before_row->key,'to',value)),'{}') into changes
 from jsonb_each(after_row) where key not in('updated_at','updated_by','ticket_token') and value is distinct from before_row->key;
 if TG_OP='INSERT' then changes:=jsonb_build_object('created',jsonb_build_object('from',null,'to',new.booking_ref))||changes; end if;
 if changes<>'{}'::jsonb then
  insert into public.show_booking_history(business_id,booking_id,changed_at,changed_by,changed_by_name,changes)
  values(new.business_id,new.id,clock_timestamp(),actor,private.show_ops_audit_actor_name(actor,new.business_id),changes);
 end if;
 return new;
end;
$$;
revoke all on function private.show_ops_record_booking_audit() from public;
create trigger show_ops_booking_audit after insert or update on public.show_bookings for each row execute function private.show_ops_record_booking_audit();

create or replace function private.show_ops_record_payment_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_data jsonb; new_data jsonb; row_data jsonb; actor uuid:=(select auth.uid());biz uuid; booking uuid;
begin
 if TG_OP<>'INSERT' then old_data:=to_jsonb(old)-'stripe_checkout_session_id'; end if;
 if TG_OP<>'DELETE' then new_data:=to_jsonb(new)-'stripe_checkout_session_id'; end if;
 row_data:=coalesce(new_data,old_data);biz:=(row_data->>'business_id')::uuid;booking:=(row_data->>'booking_id')::uuid;
 if old_data is distinct from new_data and exists(select 1 from public.show_bookings where id=booking) then
  insert into public.show_booking_history(business_id,booking_id,changed_at,changed_by,changed_by_name,changes)
  values(biz,booking,clock_timestamp(),actor,private.show_ops_audit_actor_name(actor,biz),jsonb_build_object('payment',jsonb_build_object('from',old_data,'to',new_data)));
 end if;
 return coalesce(new,old);
end;
$$;
revoke all on function private.show_ops_record_payment_audit() from public;
create trigger show_ops_payment_audit after insert or update or delete on public.show_booking_payments for each row execute function private.show_ops_record_payment_audit();
