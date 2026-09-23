-- Ruth (23 Sept): tonight's bus board can change a stop's pick-up time for that
-- night only (roadworks, late show, one-off), alongside tonight's running order.
-- stop_id -> "HH:MM". Absent = the stop's permanent pickup_time. Reset = delete row.
alter table public.show_bus_night_orders
  add column if not exists stop_times jsonb not null default '{}'::jsonb;
comment on column public.show_bus_night_orders.stop_times is
  'Per-night pick-up time overrides, stop_id -> HH:MM. Missing stop = permanent pickup_time.';
