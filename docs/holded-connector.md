# Holded connector (accounts + Verifactu issuer)

Built 8 Sept 2026. Holded is the operator's ledger and the legal invoice issuer; Solvio stays the
operational system. Nothing here talks to AEAT directly — Holded does that when the office approves.

## Flow
1. Owner/admin pastes the Holded **API Token V2** in Settings → "Holded — accounts & Verifactu".
   Solvio pings Holded, reads the tax table (detects IGIC vs IVA regime), then stores the token
   AES-256-GCM encrypted in `show_ops_integrations` (key = `SHOW_OPS_SECRETS_KEY`).
2. Finance issues a partner pack in Solvio as before (local number, e.g. MHT-2026-0007).
3. "Send to Holded" on the invoice page: partner → Holded contact (matched by tax id, created if
   missing, remembered in `show_suppliers.holded_contact_id`), pack → **draft** sales invoice
   (adult/child items, IGIC tax keys). Holded id stored on `show_invoices.holded_document_id`.
4. Office approves the draft in Holded → Holded assigns the legal number + Verifactu record.
5. "Refresh from Holded" / "Sync with Holded" (invoice list) pulls doc number, approved/paid state.
   Paid in Holded ⇒ paid in Solvio. Legal number is copied into `verifactu_number`, status `recorded`.

## Files
- `supabase/migrations/20260908230000_show_ops_holded.sql` — table + columns (apply in SQL editor).
- `src/lib/show-ops/holded.ts` — client + pure mappers (tested in `holded.test.ts`).
- `src/lib/show-ops/secrets.ts` — encrypt/decrypt (tested).
- `src/lib/show-ops/holded-connection.ts` — read-only status for pages.
- `src/app/dashboard/show-ops/actions-holded.ts` — connect/test/disconnect, push, refresh, sync.
- UI: settings page section, invoice detail panel, invoice list "Sync with Holded" + number column.
- `scripts/holded-*.mjs` — manual API probes (read `.env.local`, never print secrets).

## Environment
- `SHOW_OPS_SECRETS_KEY` — 32 bytes base64. Generate: `openssl rand -base64 32`. Must exist on
  Vercel (production + preview) before anyone connects Holded. Losing it = every stored token is
  unreadable; operators just paste their token again.
- Local `.env.local` has a dev key plus `HOLDED_API_KEY` / `HOLDED_API_TOKEN` for the probe scripts only.

## Known gaps / next
- Approval stays manual in Holded for the first months (review gate for Ruth).
- Rectificativas (corrections after approval) not built — void in Solvio does not touch Holded yet.
- Expenses capture → Holded purchases (P&L cost side) not built yet.
- Non-EUR packs pass `currency`; Holded company must have that currency enabled.
- Holded contact match is by `code`/`vatnumber` scan of the contact list; fine to ~2k contacts.
- Holded test company (Matty's "Solvio systems") has IVA taxes only — MHT's real account must be on the
  Canary regime or invoices carry the wrong tax type in Verifactu.

## 9 Sept 2026 — lifecycle wiring
- Lifecycle functions (claim → external write → complete/resolve, plus a new status **sync**) live in `private`;
  `20260909010000_show_ops_holded_rpc_wrappers.sql` adds the `public.show_ops_holded_*` wrappers PostgREST can call.
  Finance users may claim / request reconciliation; only the backend (service role) may complete, resolve or sync.
- `actions-holded.ts`: Send = prepare (contact, approved IGIC tax per rate) → claim → Holded draft with immutable
  operation reference `solvio-inv-<pack id>` → complete(created|failed|unknown). Refresh/Sync read Holded and call
  sync. Reconcile recovers an unconfirmed write by looking the reference up in Holded → resolve(found|not found).
- IGIC approvals: Settings → "Approved IGIC taxes" lists Holded's IGIC sales taxes; one approved per rate, stored in
  integration meta. No approval for a rate ⇒ the pack is not sent (fail closed). Test company has no IGIC taxes —
  add a custom tax named "IGIC 7%" there to test.
- Direct writes to `holded_*` columns from the app are refused by the DB trigger; never bypass the wrappers.
