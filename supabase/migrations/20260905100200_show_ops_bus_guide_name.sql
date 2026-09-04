-- Show Ops · 5 Sept 2026 · Joel's notes
--
-- Which guide is on the coach that night. One per bus order (per island per
-- night); printed in the bus run sheet header.

alter table public.show_bus_orders
  add column if not exists guide_name text;

comment on column public.show_bus_orders.guide_name is
  'Guide riding this island''s coach tonight. Printed on the bus run sheet.';
