-- The 5-minute backup reads every Show Ops table with the service role. This audit
-- table was sealed from service_role entirely, so every snapshot from 11 to 18 Sept
-- 2026 aborted with "permission denied". Read-only is enough for the backup; inserts,
-- updates and deletes stay revoked so the log remains append-only via its functions.
grant select on public.show_invoice_external_events to service_role;
