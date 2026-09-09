-- GetYourGuide availability push memory: the last vacancies figure Solvio pushed per
-- channel product and night. Their spec says push only when a night sells out, reopens,
-- or a low-seat night changes inside 60 days — that needs the previous value.
-- Service-role only (written by server code); no user policies.
create table if not exists public.show_channel_availability_pushes (
  business_id uuid not null references public.businesses (id) on delete cascade,
  channel text not null default 'getyourguide',
  external_product_id text not null,
  show_date date not null,
  last_vacancies integer not null check (last_vacancies >= 0),
  pushed_at timestamptz,
  last_status text,
  updated_at timestamptz not null default now(),
  primary key (business_id, channel, external_product_id, show_date)
);
alter table public.show_channel_availability_pushes enable row level security;
comment on table public.show_channel_availability_pushes is 'Last vacancies figure pushed to a sales channel per product/night (push-policy memory). Service role only.';
