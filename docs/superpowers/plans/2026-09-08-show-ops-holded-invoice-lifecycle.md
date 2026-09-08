# Show Ops Holded Invoice Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a secure, idempotent Holded invoice and credit-note lifecycle while keeping Holded as the legal issuer and Solvio as the operational system.

**Architecture:** PostgreSQL owns claims, state transitions and append-only audit events. A focused Holded client validates third-party responses and maps Solvio packs into unapproved Holded drafts. Server actions enforce roles and orchestration; finance pages expose explicit push, refresh and correction operations. Database changes deploy before application changes.

**Tech Stack:** Next.js App Router server actions, TypeScript, Supabase PostgreSQL and RLS, Node test runner, disposable PostgreSQL integration tests, Holded Invoicing API.

---

### Task 1: Add the database lifecycle and tenant-safe policies

**Files:**
- Modify: `supabase/migrations/20260908230000_show_ops_holded.sql`
- Create: `tests/show-ops/holded-lifecycle.py`

- [ ] **Step 1: Write failing PostgreSQL tests**

Create disposable-database tests covering owner/admin credential access, denial for finance/booker/seller, one successful invoice claim, rejection of a second active claim, stale-claim recovery, one credit-note claim, tenant isolation and immutable audit events.

```python
def test_second_invoice_claim_is_rejected(conn):
    first = claim_invoice(conn, invoice_id)
    assert first["claimed"] is True
    second = claim_invoice(conn, invoice_id)
    assert second["claimed"] is False

def test_audit_event_cannot_be_updated(conn):
    event_id = insert_audit_event(conn, invoice_id, "invoice_push", "success")
    with pytest.raises(Exception):
        execute_as_authenticated(conn, "update show_invoice_external_events set outcome='error' where id=%s", event_id)
```

- [ ] **Step 2: Run the database test and confirm the new expectations fail**

Run: `python3 tests/show-ops/holded-lifecycle.py`

Expected: FAIL because the claims, audit table and restrictive integration policies do not exist.

- [ ] **Step 3: Extend the unapplied Holded migration**

Add explicit lifecycle columns to `show_invoices`, including invoice claim token/time, amount comparison, external verification state, credit-note identifier/state/amount/reason and last reconciliation state. Add an append-only `show_invoice_external_events` table.

Define security-invoker or private functions for atomic invoice and credit-note claims. Each function must lock the invoice row, verify tenant ownership and allowed state, return an existing external identifier when present, allow stale-claim recovery after a bounded interval and never expose credentials.

Replace the broad `show_ops_can_access` integration policies with owner/admin-only policies based on the current Show Ops role helper. Ordinary authenticated clients must not read `secret_ciphertext` or mutate integration rows.

```sql
create table if not exists public.show_invoice_external_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  invoice_id uuid not null references public.show_invoices(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  outcome text not null,
  external_id text,
  safe_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 4: Run the PostgreSQL lifecycle and existing permission/payment tests**

Run: `python3 tests/show-ops/holded-lifecycle.py && python3 tests/show-ops/staff-permissions.py && python3 tests/show-ops/payment-integrity.py`

Expected: PASS with credentials tenant-restricted and existing payment/permission behaviour unchanged.

- [ ] **Step 5: Commit only the database task files**

```bash
git add supabase/migrations/20260908230000_show_ops_holded.sql tests/show-ops/holded-lifecycle.py
git commit -m "feat: add Holded invoice lifecycle safeguards"
```

### Task 2: Harden Holded contracts and response validation

**Files:**
- Modify: `src/lib/show-ops/holded.ts`
- Modify: `src/lib/show-ops/holded.test.ts`
- Create: `src/lib/show-ops/holded-contract.test.ts`

- [ ] **Step 1: Add failing tests for exact tax and monetary contracts**

Cover active sales-tax matching, rejection when IGIC is unavailable, infants and manual lines, cent rounding, invalid or negative values, expected totals, draft/approved/paid/unknown responses, credit-note payloads and safe external identifiers.

```ts
test("an IGIC invoice fails closed when Holded exposes only IVA", () => {
  assert.throws(() => requireHoldedTaxKey(ivaTaxes, 7, "igic"), /IGIC/);
});

test("invoice comparison rejects a different Holded total", () => {
  assert.deepEqual(compareHoldedTotals({ total: 107 }, { total: 106.99 }), {
    matches: false,
    difference: 0.01,
  });
});
```

- [ ] **Step 2: Run the focused client tests and confirm failure**

Run: `node --require ./tests/show-ops/register-typescript.cjs --test src/lib/show-ops/holded.test.ts src/lib/show-ops/holded-contract.test.ts`

Expected: FAIL for missing strict tax, comparison and credit-note functions.

- [ ] **Step 3: Implement strict mappers and API methods**

Add typed helpers for exact tax lookup, totals, response validation, unique Solvio references and credit-note drafts. Add list/search reconciliation methods and `createCreditNote`. Keep `approveDoc: false`. Never use Holded delete for an approved document.

```ts
export type HoldedAmountComparison = {
  matches: boolean;
  expected: number;
  actual: number;
  difference: number;
};

export function requireHoldedTaxKey(
  taxes: HoldedTax[],
  rate: number,
  regime: "igic" | "iva",
): string {
  const match = findExactActiveSalesTax(taxes, rate, regime);
  if (!match) throw new Error(`Holded has no active ${regime.toUpperCase()} sales tax at ${rate}%.`);
  return match.key;
}
```

- [ ] **Step 4: Run the focused client tests**

Expected: all Holded mapper and contract tests PASS.

- [ ] **Step 5: Commit only the Holded client files**

```bash
git add src/lib/show-ops/holded.ts src/lib/show-ops/holded.test.ts src/lib/show-ops/holded-contract.test.ts
git commit -m "feat: validate Holded invoice and credit note contracts"
```

### Task 3: Orchestrate invoice pushes, reconciliation and credit notes

**Files:**
- Modify: `src/app/dashboard/show-ops/actions-holded.ts`
- Modify: `src/lib/show-ops/holded-connection.ts`
- Create: `src/lib/show-ops/actions-holded-integrity.test.ts`

- [ ] **Step 1: Write failing server-action integrity tests**

Test role denial before data access, exact IGIC gating, atomic claims, duplicate-click reuse, timeout reconciliation by unique Solvio reference, amount mismatch, safe audit events, paginated sync, immutable legal invoices and credit-note draft creation.

- [ ] **Step 2: Run the action tests and confirm failure**

Run: `node --require ./tests/show-ops/register-typescript.cjs --test src/lib/show-ops/actions-holded-integrity.test.ts`

Expected: FAIL because the lifecycle orchestration is incomplete.

- [ ] **Step 3: Refactor the actions around explicit state transitions**

Use the database claim before network creation. On uncertain create responses, mark reconciliation required and search by the unique Solvio reference before retrying. Compare Holded and Solvio totals before exposing approval readiness. Record safe append-only events for every outcome.

Add correction preview and creation actions. An approved invoice creates an unapproved credit note; an unapproved draft can be cancelled only with explicit confirmation and a verified response. Synchronisation must page through all eligible rows and report per-invoice failures.

- [ ] **Step 4: Run action, client, permission and type checks**

Run: `node --require ./tests/show-ops/register-typescript.cjs --test src/lib/show-ops/holded.test.ts src/lib/show-ops/holded-contract.test.ts src/lib/show-ops/actions-holded-integrity.test.ts src/lib/show-ops/actions-permission-integrity.test.ts`

Run: `node node_modules/typescript/bin/tsc --noEmit --incremental false`

Expected: PASS.

- [ ] **Step 5: Commit only the action task files**

```bash
git add src/app/dashboard/show-ops/actions-holded.ts src/lib/show-ops/holded-connection.ts src/lib/show-ops/actions-holded-integrity.test.ts
git commit -m "feat: orchestrate Holded invoice lifecycle"
```

### Task 4: Complete the finance interface

**Files:**
- Modify: `src/app/dashboard/show-ops/settings/page.tsx`
- Modify: `src/app/dashboard/show-ops/invoices/page.tsx`
- Modify: `src/app/dashboard/show-ops/invoices/[id]/page.tsx`

- [ ] **Step 1: Add UI-facing tests for available states and actions**

Extend the action integrity or page tests so not-sent, draft, mismatch, approved, paid, correction-pending, corrected and error states expose only valid next actions.

- [ ] **Step 2: Implement the settings and invoice states**

Settings must show the regime, series and a blocking warning when IGIC is unavailable. Invoice detail must show the Solvio reference, Holded number, totals comparison, last sync and correction history. Correction requires a reason and preview. Invoice list must report paginated sync results without implying that a number proves Verifactu submission.

- [ ] **Step 3: Run focused UI lint and TypeScript checks**

Run: `npx eslint src/app/dashboard/show-ops/settings/page.tsx src/app/dashboard/show-ops/invoices/page.tsx 'src/app/dashboard/show-ops/invoices/[id]/page.tsx'`

Run: `node node_modules/typescript/bin/tsc --noEmit --incremental false`

Expected: PASS.

- [ ] **Step 4: Commit only the finance UI files**

```bash
git add src/app/dashboard/show-ops/settings/page.tsx src/app/dashboard/show-ops/invoices/page.tsx 'src/app/dashboard/show-ops/invoices/[id]/page.tsx'
git commit -m "feat: add Holded finance lifecycle interface"
```

### Task 5: Document, review and prepare the coordinated release

**Files:**
- Modify: `docs/holded-connector.md`
- Modify: `docs/reviews/2026-09-08-mht-priority-repairs.md`
- Create: `docs/reviews/2026-09-08-mht-holded-release.md`

- [ ] **Step 1: Update operator documentation**

Document system ownership, exact tax prerequisites, safe test procedure, correction workflow, failure recovery, selected migration order and the distinction between locally tested, deployed and live-verified.

- [ ] **Step 2: Run the complete focused verification suite**

Run all Holded tests, disposable PostgreSQL lifecycle tests, the 158 priority-repair tests, TypeScript and focused ESLint. Do not perform a Holded write test without Matty's separate approval because it creates third-party records.

- [ ] **Step 3: Reconcile production migration history read-only**

Compare the three priority-repair migrations and the Holded migration with the linked Solvio database. Prepare selected SQL in dependency order. Do not blanket-apply the repository migration directory.

- [ ] **Step 4: Review the release as one coordinated unit**

Review security, tenant isolation, financial correctness, external idempotency, recoverability and rollback. Resolve all high-severity findings before release.

- [ ] **Step 5: Deploy database first, then application**

After verification, apply only the reviewed database changes to Supabase project `aasfahcrdcoqxwnlkdnv`, then deploy the matching application to the Vercel `solvio` production target.

- [ ] **Step 6: Perform live non-customer acceptance**

Confirm authenticated role access and read-only Holded connection state. Because the current Holded account has no IGIC sales taxes, keep invoice creation blocked until the correct MHT company is connected. Do not email customers, approve a legal invoice, collect payment or submit Verifactu during smoke testing.

- [ ] **Step 7: Commit release documentation**

```bash
git add docs/holded-connector.md docs/reviews/2026-09-08-mht-priority-repairs.md docs/reviews/2026-09-08-mht-holded-release.md
git commit -m "docs: record Holded release evidence"
```

