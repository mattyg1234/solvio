/*
 * Platform onboarding: capability flags customize nav; first-login wizard gate.
 * Backfill completes existing businesses once; new signups get onboarding_completed_at = NULL via trigger INSERT.
 */

alter table public.businesses
  add column if not exists platform_capabilities jsonb not null default '{}'::jsonb;

alter table public.businesses
  add column if not exists onboarding_completed_at timestamptz;

alter table public.businesses
  add column if not exists business_category text;

alter table public.businesses
  add column if not exists website_url text;

alter table public.businesses
  add column if not exists logo_url text;

comment on column public.businesses.platform_capabilities is
  'Feature toggles from onboarding wizard. Empty {} means legacy / full navigation (all sections shown).';

comment on column public.businesses.onboarding_completed_at is
  'NULL = merchant should complete dashboard onboarding wizard.';

update public.businesses
set onboarding_completed_at = coalesce(onboarding_completed_at, now())
where onboarding_completed_at is null;

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
begin
  biz_name := coalesce(new.raw_user_meta_data ->> 'business_name', '');
  website := nullif(trim(coalesce(new.raw_user_meta_data ->> 'website_url', '')), '');
  logo := nullif(trim(coalesce(new.raw_user_meta_data ->> 'logo_url', '')), '');
  category := nullif(trim(coalesce(new.raw_user_meta_data ->> 'business_category', '')), '');

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );

  if length(trim(biz_name)) > 0 then
    insert into public.businesses (
      owner_id,
      name,
      onboarding_completed_at,
      website_url,
      logo_url,
      business_category
    )
    values (
      new.id,
      trim(biz_name),
      null,
      website,
      logo,
      category
    );
  end if;

  return new;
end;
$$;
