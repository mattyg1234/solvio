/*
 * Persist merchant_phone from signup metadata onto the new business row
 * so booking-alert SMS works before onboarding step 1.
 */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  biz_name text;
  website text;
  logo text;
  category text;
  merchant_phone text;
  flow_details jsonb;
begin
  biz_name := coalesce(new.raw_user_meta_data ->> 'business_name', '');
  website := nullif(trim(coalesce(new.raw_user_meta_data ->> 'website_url', '')), '');
  logo := nullif(trim(coalesce(new.raw_user_meta_data ->> 'logo_url', '')), '');
  category := nullif(trim(coalesce(new.raw_user_meta_data ->> 'business_category', '')), '');
  merchant_phone := nullif(trim(coalesce(new.raw_user_meta_data ->> 'merchant_phone', '')), '');

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  if length(trim(biz_name)) > 0 then
    flow_details := '{}'::jsonb;
    if merchant_phone is not null then
      flow_details := jsonb_build_object(
        'merchant_onboarding_profile',
        jsonb_build_object('phone', merchant_phone)
      );
    end if;

    insert into public.businesses (
      owner_id,
      name,
      onboarding_completed_at,
      website_url,
      logo_url,
      business_category,
      booking_flow_details
    )
    values (
      new.id,
      trim(biz_name),
      null,
      website,
      logo,
      category,
      case when flow_details = '{}'::jsonb then null else flow_details end
    );
  end if;

  return new;
end;
$$;
