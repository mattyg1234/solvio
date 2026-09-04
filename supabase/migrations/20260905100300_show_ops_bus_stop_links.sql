-- Show Ops · 5 Sept 2026 · Joel's notes
--
-- A map link and a photo of each pick-up point, so a new guide (or a guest) can
-- find the exact spot. Plain URLs; the bus run sheet shows "Map" as a link and
-- the photo as a small print-friendly image.

alter table public.show_bus_stops
  add column if not exists map_url text,
  add column if not exists photo_url text;

comment on column public.show_bus_stops.map_url is
  'Link to the stop on a map (Google Maps etc.). Shown as "Map" on the bus run sheet.';
comment on column public.show_bus_stops.photo_url is
  'Photo of the pick-up point. Shown small on the bus run sheet.';
