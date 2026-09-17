-- Rate cards are now edited in the app (Partners → Rates). A card created there
-- has no Lanzasoft id, so its price rows cannot carry the legacy keys the import
-- required. Imported rows keep theirs; nothing reads these columns for pricing.
alter table public.show_rate_prices alter column legacy_rate_id drop not null;
alter table public.show_rate_prices alter column legacy_show_id drop not null;
