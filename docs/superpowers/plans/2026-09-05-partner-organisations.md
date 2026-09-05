# Partner organisation implementation plan

Use subagent-driven-development for independent implementation and review; user authorises build and repository shipping. Parent owns database protections and integration. Separate workers own invitations/access and portal UI/analytics.

- [x] Database: add partner_admin membership flag, secure membership visibility, own-seller booking read policy, creator stamping/immutability and updates denial for sellers; retain staff and transactional capacity checks. Test on isolated PostgreSQL with two sellers, org admin and another organisation.
- [x] Invitations/access: ctx.partnerAdmin, staff-only grant/revoke administration, admin-only teammate invite/remove, binding and replay/failure-safe links, honest email gate; tests with stubbed auth/transport. Update Settings and email template.
- [x] Portal: crown/navigation, admin-only Team, seller-specific bookings, role-scoped analytics date range and currency-separated leaderboard. No raw unscoped service-client data exposure. Test analytics and visibility.
- [ ] Review final spec/security diff, typecheck, relevant tests and browser smoke; apply reviewed migration only to confirmed Solvio project; deploy clean archive and verify domain. No unrelated planner edits or real email sends.

## Added during implementation

- Sellers can attach original ticket photos to their own bookings. Reuse private invoice evidence with no seller delete permission, 3 MiB upload validation and a 4 MB request limit.
- Clarify the Shows editor for you: schedule, guest prices, optional nett fallback and explicit repricing warnings.
- Add named, fully priced ticket types/packages as children of a physical show. Keep its schedule and capacity shared; never create independent capacity per ticket type. Preserve the existing base option and historical booking snapshots. You confirmed optional extras must be configurable infrastructure: custom names, prices, charging basis and commission treatment, saved into booking and invoice snapshots.

## Verification so far

- 16 local PostgreSQL organisation tests pass, including concurrent organisation assignment, current invitation authority, revocation, scoped analytics and private ticket evidence.
- The review found and corrected first-account token type handling, invitation revocation checks, storage deletion/attachment races and an RLS recursion issue discovered by a real authenticated insert test.
- Production preflight confirmed the Solvio project and no existing conflicting supplier/account bindings. No invitations or test bookings have been sent to real recipients.

## Your additional requests implemented

- Restrict each user to permitted islands, with database enforcement and protected global settings.
- Search hotels by linked pick-up names and pick-ups by linked hotels.
- Save draggable nightly bus-stop order and use it consistently in print, PDF and email, including guide notes and map/photo links.
- Record booking creation, edits, cancellations and payment changes transactionally, with creator snapshots and readable before/after history. Earlier unrecorded history is explicitly incomplete.
- Keep paid infants and optional extras in guest tickets and invoice totals; protect invoice source bookings across island boundaries.

## Combined verification before release

184 application tests, 62 isolated PostgreSQL tests, TypeScript and targeted lint pass. Production migration, final deployment and signed-in screen checks remain the release steps. No real invitations, invoices or guest messages have been sent during verification.
