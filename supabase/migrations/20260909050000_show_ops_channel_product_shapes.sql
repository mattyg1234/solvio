-- GetYourGuide product shapes: a mapped product is either a time point (show starts at
-- show_time) or a time period (bookable for the date, opening times returned), and priced
-- per person or per GROUP (vacancies reported in groups of group_size seats).
alter table public.show_channel_products
  add column if not exists availability_type text not null default 'time_point'
    check (availability_type in ('time_point', 'time_period')),
  add column if not exists pricing_type text not null default 'individual'
    check (pricing_type in ('individual', 'group')),
  add column if not exists group_size integer
    check (group_size is null or group_size between 1 and 200),
  add column if not exists period_minutes integer not null default 180
    check (period_minutes between 15 and 1440);
