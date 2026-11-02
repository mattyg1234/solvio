-- When the office last sent tonight's pick-up confirmation (WhatsApp template 3)
-- to this guest from the bus board, so pressing "Transport finalised" again
-- only messages guests who haven't had it yet.
alter table public.show_bookings
  add column if not exists transport_confirmed_at timestamptz;
