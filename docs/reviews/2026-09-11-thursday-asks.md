# Thursday 11 Sept — what Solvio needs from MHT (Joel, Ruth, Jesus)

## From Jesus (accountant) — Holded
1. Create **MHT's own Holded company** (not Matty's test one), set to the **Canary Islands regime** so taxes are IGIC.
   Confirm the IGIC rates that apply to MHT tickets (7%? 3% for some legs? 0%?) — Solvio will only invoice with the
   rates you approve.
2. Invoice **series** for 2026/2027 that does not clash with Lanzasoft's numbering (or confirm Holded starts fresh 1 Jan).
3. Upload the company **digital certificate** in Holded for Verifactu; confirm who approves invoices (Ruth?) — Solvio
   only creates drafts, approval stays in Holded.
4. Invite Matty (mattygale4@gmail.com) to that Holded and create an **API Token V2** for Solvio — paste it only into
   Solvio Settings → Holded, never into chat/email.
5. **Door sales:** do walk-in door sales need a simplified invoice (factura simplificada) per sale under Verifactu?
   Yes = hundreds of records a night ⇒ different architecture (direct Verifactu API from Solvio). What does Lanzasoft do today?
6. **Expenses:** Solvio can now record costs with the receipt and push them to Holded as *draft purchases*. Do you want them as
   drafts you approve, and which tags/categories do you want on them (island, show)?
7. Purchase-side IGIC taxes exist in Holded? (needed for the expense push).

## From Joel / Ruth — operations
8. Who owns MHT's **GetYourGuide** supplier account, and roughly how many GYG bookings a week? Screenshot of the product list
   so we can map each GYG option to a show.
9. Finish the **show start times** (6 of 14 done) — needed for lists and for GetYourGuide availability.
10. **72 imported bookings show more paid than the ticket price.** Real overpayments/credits or Lanzasoft quirk? Solvio keeps them as credits for now.
11. **Staff logins:** currently only Joel's owner login exists. Who needs logins (Ruth finance, Lee door, office)? Solvio now
    enforces page permissions, so we should create them together.
12. Money: deposit (50%) for the €4k build — nothing paid yet, work is 3 months from go-live.
13. Confirm scope for 1 Dec: core + Holded invoicing + expenses/P&L + GYG (subject to GYG review). Make API and messenger → January.

## Things Solvio already does that they may not know
- Imported paid balances are now preserved on every edit and door payment (audit fix).
- Partner links cannot overbook (capacity checked in the database).
- Packs → Holded drafts with the legal number and paid status flowing back; credit notes for corrections after approval.
- Expenses → Holded purchases; P&L by month and island on the Invoicing page.
