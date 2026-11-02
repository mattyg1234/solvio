# Show Ops — backups & Plan B

What protects MHT's bookings, and what to do if the Hub goes down. The plain
version for the office is "If the Hub goes down" below; the rest is for whoever
restores it.

## What runs automatically

| What | How often | Where it lands | Survives |
|---|---|---|---|
| Full snapshot of every Show Ops table, plus receipts, ticket photos and logo (`/api/cron/show-ops-backup`) | Every 5 minutes | Private Supabase Storage bucket `show-ops-backups/<businessId>/` | App bugs, bad edits, accidental deletes |
| Plan B pack: night list PDFs (next 3 nights, one per island), bus list PDFs (tonight + tomorrow), upcoming-bookings CSV (`/api/cron/show-ops-plan-b`) | 06:30 and 16:30 UTC | Inboxes under Settings → Daily email (`office_report_emails`) | Hub, Vercel and Supabase all down |
| Off-site copy of the newest full snapshot (same cron) | 06:30 and 16:30 UTC | `SHOW_OPS_OFFSITE_BACKUP_EMAILS` (comma list, Vercel env) | The Supabase project itself being lost |
| Supabase daily backups / PITR | Supabase plan | Supabase | Database corruption, schema mistakes |

Retention in the bucket: every copy from the last hour, one an hour for a day,
one a day for a month. The off-site emails are kept as long as the inbox keeps
them.

`show_ops_integrations.secret_ciphertext` is encrypted with
`SHOW_OPS_SECRETS_KEY`. Keep that key in the password manager: a snapshot
restored into a new project only gets working Holded / Meta / Gmail
connections back if the new deployment has the same key. Otherwise reconnect
them in Settings.

**RPO:** 5 minutes (bucket), 12 hours worst case off-site.
**RTO:** minutes for an app outage (Vercel rollback); same day for a lost database.

## If the Hub goes down (for the office)

1. **Check it is really down.** Try mht.solviosystems.com on a phone on mobile
   data. If only one computer cannot reach it, it is that computer's internet.
2. **Tell Matty** (WhatsApp +44 7415 810959) with a screenshot and the time.
3. **Tonight's show: open the latest Plan B pack email** (subject
   "MHT Plan B pack, <date>"). Print the night list for your island and the bus
   list. The door, bus and kitchen work from paper exactly as before the Hub.
4. **New bookings while it is down:** write them on paper or in a copy of the
   upcoming-bookings spreadsheet from the same email: name, mobile, hotel, pax,
   show date, island, partner, pick-up, diet, paid/owed. Keep taking them.
5. **Guest questions:** the spreadsheet has every upcoming booking with mobile,
   hotel and payment status; search it in Excel or Google Sheets.
6. **When the Hub is back:** add the paper bookings into the Hub (newest show
   date first), then tick arrivals for any night that ran on paper. Tell Matty
   when you are caught up.

Do not take payments into a new or different account while the Hub is down;
record cash/card as normal and note it on the paper booking.

## Restoring (for Matty / Solvio)

**App down, data fine** (bad deploy, Vercel incident): Vercel → mhthub →
Deployments → promote the last good deployment. Minutes.

**Some data wrong or deleted** (bad edit, wrong bulk action): take the newest
snapshot from before the mistake (Backups & Plan B page lists them, or the
`show-ops-backups` bucket), restore it into a scratch Supabase project with
`scripts/show-ops-restore.ts` (it refuses to target production), and copy the
affected rows back by hand. For a whole-database mistake use Supabase PITR.

**Supabase project lost:**
1. Create a new Supabase project; apply `supabase/migrations/` in order.
2. Take the newest snapshot: from the bucket if it is reachable, otherwise the
   newest "off-site backup" email attachment.
3. `scripts/show-ops-restore.ts` into the new project.
4. In Vercel set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` to the new project, keep `SHOW_OPS_SECRETS_KEY`,
   redeploy.
5. Re-create the logins (Supabase auth users are not in the snapshot) and
   re-check Holded, Meta WhatsApp and Gmail in Settings.
6. Office re-enters bookings taken since the snapshot (step 6 above).

## Sealed runbook

Keep in 1Password: Vercel and Supabase logins, `SHOW_OPS_SECRETS_KEY`,
`CRON_SECRET`, Resend key, and this document's link.

## Drills

- **Monthly:** on the Backups & Plan B page press "Email me the Plan B pack
  now" and open each attachment.
- **Quarterly:** restore the newest off-site snapshot into a scratch project
  and check a recent booking, an invoice and tonight's night list.

## Access control

- RLS via `show_ops_can_access` (owner or `show_ops_members`).
- No cross-tenant reads.
- Booking create/update stamps `created_by` / `updated_by`.
