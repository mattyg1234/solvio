# Show Ops — security backups & Plan B

**RPO (v1):** 24 hours  
**RTO (v1):** restore a tenant from JSON export + Supabase PITR within one business day

## Daily / continuous

1. **Supabase PITR / daily backups** — enable on the Solvio project (`aasfahcrdcoqxwnlkdnv`). Point-in-time recovery covers accidental deletes and schema mistakes.
2. **Tenant export** — authenticated owners download `/api/show-ops/export` (full JSON of master + bookings + finance). Schedule this nightly (cron / GitHub Action with service role per tenant later).
3. **Object storage** — store encrypted exports off-platform (S3 / R2) when automation lands.

## Plan B if primary region dies

1. Keep Vercel project + Supabase credentials in a sealed runbook (1Password).
2. Stand up a second Supabase project from PITR or latest export; point `NEXT_PUBLIC_SUPABASE_*` on a Vercel preview/prod alias.
3. Custom domains: re-attach in Vercel; DNS TTLs kept ≤ 1 hour for ops domains.
4. Communicate status on a simple status page / email to tenant admins.

## Access control

- RLS via `show_ops_can_access` (owner or `show_ops_members`).
- No cross-tenant reads.
- Booking create/update stamps `created_by` / `updated_by`.

## Restore drill

Quarterly: pick a non-prod business, wipe Show Ops tables for that `business_id`, re-import from a saved export JSON (script TBD), verify Last 50 + one invoice pack.
