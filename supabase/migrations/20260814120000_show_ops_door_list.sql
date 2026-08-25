-- Door / office list check-off: arrived, cash/card at the door, no-show.

alter table public.show_bookings
  add column if not exists arrived_at timestamptz,
  add column if not exists door_pay_method text,
  add column if not exists no_show boolean not null default false,
  add column if not exists list_checked_by uuid references auth.users (id) on delete set null;

alter table public.show_bookings drop constraint if exists show_bookings_door_pay_method_check;
alter table public.show_bookings
  add constraint show_bookings_door_pay_method_check
  check (door_pay_method is null or door_pay_method in ('cash', 'card'));

create index if not exists show_bookings_show_date_list_idx
  on public.show_bookings (business_id, show_date, cancelled_at);
