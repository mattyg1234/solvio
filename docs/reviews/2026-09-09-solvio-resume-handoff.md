# Solvio resume handoff - 9 September 2026

## Objective

Finish and safely release the Solvio-to-Holded workflow and the Partners performance repair without disturbing the stable production release or unrelated local work.

## Confirmed live in production

- Production site is Ready at `https://www.solviosystems.com`.
- The three priority repairs are live: imported payment preservation, partner-link capacity protection, and staff action permissions.
- The reviewed Holded database foundation is live.
- Production contains the protected integration table, invoice external-event audit table, 24 Holded lifecycle fields, row-level security, and backend-only completion functions.
- The five selected migration versions were recorded as applied without rewriting unrelated historical migration records.
- Existing production bookings remained at 16,036 immediately after release.
- No real Holded invoice or credit note was created, approved, sent, or paid during this work.

## Backups taken before the database release

- Public schema snapshot: `tmp/deploy-backups/solvio-public-schema-pre-release-20260909-002222.sql`
- Show Ops data snapshot: `tmp/deploy-backups/solvio-show-ops-data-pre-release-20260909-002222.sql`

## Implemented locally but not deployed

### Holded client contracts

Local commits:

- `4488d9d` - strict Holded document contracts
- `1944211` - initial IGIC and response-validation corrections

Already implemented:

- Draft-only invoice and credit-note API methods.
- Strict response and money validation.
- Expected-versus-actual total reconciliation.
- Explicit IGIC configuration with fail-closed behavior.
- Mocked tests only; no real Holded writes.

Still being corrected after independent review:

1. Prevent duplicate invoices or credit notes when Holded accepts a POST but the follow-up read fails.
2. Use an immutable Solvio operation reference and reconcile before any retry.
3. Remove or quarantine the undocumented `relatedDocuments` credit-note assumption until supported by verified Holded sandbox evidence.
4. Fail closed on malformed draft, status, and approval fields.
5. Correctly represent negative credit-note settlement states.
6. Replace floating-point cent rounding with deterministic decimal/cents handling.
7. Validate an explicitly accountant-approved IGIC tax identifier and legal treatment, not text matching.
8. Cover ambiguous timeouts, POST-success/read-failure, retries, partial payments, malformed fields, zero/negative credits, and rate limiting with mocked tests.

Do not deploy this layer until both requirements review and security/code-quality review approve the final correction.

### Partners performance repair

Local commit:

- `6bdbec3` - lazy-mount partner editors

Implemented:

- Collapsed partner rows are lightweight.
- Full editing controls mount only when a partner is opened.
- Individual partner saving remains available.
- Bulk edits send selected partner IDs and explicit bulk fields instead of relying on hundreds of mounted hidden forms.
- Three focused tests pass.

Still required:

1. Independent requirements review.
2. Independent code-quality review.
3. Correct any findings and repeat review.
4. Run focused verification.
5. Deploy only the reviewed commits and confirm Vercel reports Ready.
6. Measure the Partners page again after release.

## Holded test and production boundary

- The current Holded workspace, `Solvio systems`, is a test company and currently uses IVA-style taxes.
- It may be used for controlled draft testing only.
- Never approve, send, email, pay, or treat its documents as MHT legal invoices.
- MHT needs a separate MHT-owned Holded workspace.
- MHT or its accountant must configure the legal company details, invoice series, Canary Islands tax regime, and exact IGIC tax identifiers.
- MHT should invite Matty to that workspace and create a separate API key for it.
- Secrets must be configured securely, never pasted into chat, logs, commits, or client-side code.

## Remaining application work after client contracts

1. Wire Solvio finance actions to database claim/completion functions and the reviewed Holded client.
2. Make contact creation, invoice draft creation, status refresh, amount reconciliation, and failure recovery idempotent.
3. Add the finance screens Ruth will use: connection status, create draft, refresh status, compare totals, request reconciliation, and request a credit-note draft.
4. Keep final approval and legal sending manual inside Holded.
5. Add a clear audit history and user-facing failure/reconciliation states.
6. Test every path against the Solvio test Holded company using non-customer test records only.
7. Perform requirements and security review for every stage.
8. Release database dependencies before website code, then verify the production deployment and non-customer paths.

## GetYourGuide

- GetYourGuide is not implemented yet.
- Treat it as a separate connector and approval project, not part of the current Holded release.
- Required lifecycle includes availability, reservation, cancellation, booking confirmation, booking cancellation, availability notifications, sandbox testing, and GetYourGuide approval.

## Preserve these unrelated local changes

Do not discard, overwrite, stage, or commit these as part of this work:

- `src/components/dashboard/staff-week-planner.tsx`
- `.agents/`
- `.codex/`
- Existing commercial-review documents
- `output/`
- `tmp/`
- Test cache directories

## Resume order

1. Let the active Holded correction finish.
2. Review its exact diff and mocked tests.
3. Repeat requirements and security/code-quality reviews until approved.
4. Review the Partners performance commit independently and correct any findings.
5. Implement Holded server actions and idempotent reconciliation.
6. Implement the finance screens.
7. Run controlled test-company acceptance flows without approval or sending.
8. Deploy reviewed changes and verify production Ready.
9. Begin GetYourGuide as a separate scoped connector.

## Non-negotiable release rules

- Do not blanket-push Supabase migrations: local and remote migration histories have historical drift.
- Apply only explicitly reviewed migrations in order and record only those versions.
- Confirm the project is Solvio and the Supabase project is the Solvio project, never Tipsi.
- Take a recoverable backup before production database changes.
- No real customer communications, payments, invoice approvals, or legal submissions without explicit authorization.
- Never describe local or test-only behavior as live.
