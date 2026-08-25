-- Custom booking question answers + allow configurable sales channels
alter table public.show_bookings
  add column if not exists custom_answers jsonb not null default '{}'::jsonb;

alter table public.show_bookings
  drop constraint if exists show_bookings_sales_channel_check;

comment on column public.show_bookings.custom_answers is 'Answers keyed by Show Ops config booking_questions[].id';
