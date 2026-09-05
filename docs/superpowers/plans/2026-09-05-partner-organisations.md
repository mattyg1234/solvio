# Partner organisation implementation plan

Use subagent-driven-development for independent implementation and review; user authorises build and repository shipping. Parent owns database protections and integration. Separate workers own invitations/access and portal UI/analytics.

- [ ] Database: add partner_admin membership flag, secure membership visibility, own-seller booking read policy, creator stamping/immutability and updates denial for sellers; retain staff and transactional capacity checks. Test on isolated PostgreSQL with two sellers, org admin and another organisation.
- [ ] Invitations/access: ctx.partnerAdmin, staff-only grant/revoke administration, admin-only teammate invite/remove, binding and replay/failure-safe links, honest email gate; tests with stubbed auth/transport. Update Settings and email template.
- [ ] Portal: crown/navigation, admin-only Team, seller-specific bookings, role-scoped analytics date range and currency-separated leaderboard. No raw unscoped service-client data exposure. Test analytics and visibility.
- [ ] Review final spec/security diff, typecheck, relevant tests and browser smoke; apply reviewed migration only to confirmed Solvio project; deploy clean archive and verify domain. No unrelated planner edits or real email sends.

## Added during implementation

- Sellers can attach original ticket photos to their own bookings. Reuse private invoice evidence with no seller delete permission, 3 MiB upload validation and a 4 MB request limit.
- Clarify the Shows editor for you: schedule, guest prices, optional nett fallback and explicit repricing warnings.
- Add named, fully priced ticket types/packages as children of a physical show. Keep its schedule and capacity shared; never create independent capacity per ticket type. Preserve the existing base option and historical booking snapshots. Optional add-on charges remain a separate unanswered preference, so no charges are invented.

## Verification so far

- 16 local PostgreSQL organisation tests pass, including concurrent organisation assignment, current invitation authority, revocation, scoped analytics and private ticket evidence.
- The review found and corrected first-account token type handling, invitation revocation checks, storage deletion/attachment races and an RLS recursion issue discovered by a real authenticated insert test.
- Production preflight confirmed the Solvio project and no existing conflicting supplier/account bindings. No invitations or test bookings have been sent to real recipients.
