-- Joel (17 Sept): some partners' commission rounds up to the nearest whole
-- pound or euro (10.99 becomes 11). Only for the partners the office ticks.
alter table public.show_suppliers
  add column if not exists round_up boolean not null default false;
comment on column public.show_suppliers.round_up is
  'Round this partner''s per-ticket commission UP to the nearest whole unit of currency; the nett we invoice goes down by the same pennies.';
