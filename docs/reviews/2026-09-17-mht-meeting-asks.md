# MHT meeting — week of 14 September 2026 (Thursday 17 Sept, confirm the day)

What Solvio needs from Joel, Ruth and Jesus, in the order it matters for a 1 December start. Numbered so it can be worked through in the room. Written 11 September; supersedes the "Thursday 11 Sept" list.

## A. Money first — Ruth (30 min)

1. **Prices now come from each partner's rate card.** Solvio read the Lanzasoft rate cards on 10 Sept and checked them against every future booking: the partner's *sale* card reproduces 1,232 of 1,248 guest-paid bookings and 440 of 449 invoiced ones; "master price + €10 bus" only reproduced 1 in 5 guest-paid bookings. New bookings, the seller portal, partner links and GetYourGuide now all price from the card. Ruth to confirm this is how she prices today.
2. **Nett = partner % of the card price, rounded per head.** That is what your invoices show (e.g. 65% of €59 = €38.35 per adult). The *invoice* rate cards in Lanzasoft are out of date on several partners (GetYourGuide, Spanish Dave, ACE Travel ON, TUI) — Solvio ignores them and uses the partner's %. Ruth to confirm the % on each invoice partner is right (list attached in Solvio → Partners).
3. **Five bookings to look at together** (MHT-308709, 311393, 305875, 309327, 309012): sold at a price that is neither the master price nor the current card. Card edited after the sale, or a manual price? Tells us whether the desk needs a "price override" box.
4. **Rate-card "tipo".** 91 card rows carry different prices under tipo 0/1/2 for the same show. What do 0 and 2 mean? Solvio currently uses tipo 1.
5. **Editing a booking keeps its price.** Changing pax on the same show/partner/bus multiplies the original price; changing show, partner or bus reprices from the card. Confirm, or say when Ruth wants a requote instead.
6. **Deposits:** the deposit % still comes from the partner record. Give three real examples including the TFS/ACE rounding one (P3-09).
7. **72 imported bookings show more paid than the ticket price.** Real overpayments/credits, or a Lanzasoft quirk? Solvio holds them as credits for now.

## B. Holded / Verifactu — Jesus (20 min)

8. Create **MHT's own Holded company** on the **Canary Islands regime** (IGIC, not IVA). Confirm the IGIC rates that apply to tickets (7%? 3%? 0%?) — Solvio only invoices at rates you approve, and needs purchase-side IGIC for expenses.
9. Invoice **series** for 2026/2027 that does not clash with Lanzasoft numbering (or confirm Holded starts fresh on 1 Jan).
10. Upload the company **digital certificate** in Holded for Verifactu; confirm who approves invoices (Ruth). Solvio only creates drafts.
11. Invite Matty (mattygale4@gmail.com) to that Holded and create a **v1 API key** (Configuración → Desarrolladores → Credenciales → "Ir a API Keys v1" → Nueva API Key). Not a V2 token — Solvio's connector uses the v1 invoicing API and will reject a V2 token. Paste it only into Solvio → Settings → Holded.
12. **Door sales:** does each walk-in sale need a simplified invoice (factura simplificada) under Verifactu? Yes = hundreds a night, different design. What does Lanzasoft do today?
13. **Expenses:** Solvio records costs with the receipt and pushes them to Holded as *draft purchases* (double-send now impossible, and a "Reconcile" button recovers a send that Holded did not confirm). Which tags/categories does Jesus want (island, show)?

## C. Operations — Joel / Ruth (20 min)

14. **Staff logins, created in the room.** Bring the list: name, email, role (finance / office / booker / door), islands, and which pages each may see. Only Joel's owner login exists today, so none of the "seniors only" rules has been exercised. Ruth (finance) and Lee (door) first.
15. **Show start times** — 6 of 14 done. Needed for night lists and GetYourGuide availability.
16. **GetYourGuide:** Solvio's connection passed GetYourGuide's full test suite and is waiting for their live test. They need MHT's GYG **Option IDs and titles** for 1 MHT ACE, 2 MHT TFS and 7 MHT LPA (from MHT's supplier portal). Who owns that account, and roughly how many GYG bookings a week?
17. **Backups:** Solvio now snapshots every table plus receipts/ticket photos and can restore into a separate project. Agree who holds the restore key and how often we prove a restore (proposal: once before go-live, then monthly).
18. **Cutover files:** freeze date for the Lanzasoft export and who runs the final import rehearsal (proposal: mid-November).

## D. Commercial — Joel (10 min)

19. **Deposit:** 50% of the €4,000 build. Nothing paid; work is three months from go-live and the pricing, Holded, GetYourGuide and backup pieces above are already built.
20. **Scope for 1 December:** core + Holded invoicing + expenses/P&L + GetYourGuide (subject to their review). Make API and the team messenger move to January.

## Things Solvio already does that they may not know

- Prices and netts from the partner rate cards (new this week); imported bookings keep their imported money on every edit and door payment.
- Partner links cannot overbook (capacity is enforced in the database).
- Invoice packs → Holded drafts with the legal number and paid status flowing back; credit notes after approval.
- Expenses → Holded purchases with a safe send/reconcile; P&L by month and island.
- GetYourGuide: availability, reserve, book, cancel — all four product shapes certified in their portal.
