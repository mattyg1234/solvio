# Solvio outreach GTM — WhatsApp leads → demo site → paid merchant

**Offer:** £100 / €100 one-time setup + **£50/month** Booking plan (7-day card trial on signup; Stripe subscription after).

**Goal:** Find hospitality businesses (UK English / ES Spanish) that book via **phone / WhatsApp only**, build a **branded preview site** with a **fake Solvio booking embed** (looks real, no DB), host on **Vercel**, message on **WhatsApp**, close **£100 setup + £50/mo** there before they sign into Solvio.

---

## Pipeline (Village + Cursor)

| Step | Who | Output |
|------|-----|--------|
| 1. Find leads | **Trendscout** (Village) | **Tenerife restaurants** — weak/no website + no online table booking; you WhatsApp; Nova builds page + `mode=table` embed |
| 2. Mayor picks | **You** | Choose which leads get a demo (Village UI or chat) |
| 3. Build site | **Nova** (Village) | **Only approved leads** — Vercel + `/book/preview` iframe |
| 4. Message | **You** | WhatsApp pitch with demo URL |
| 5. Close | **WhatsApp + Solvio** | £100 setup + £50/mo; then real merchant onboarding |

Charters: `~/.openclaw/workspace/village/server/charters/trendscout.md` (mobile-only WhatsApp rules), `nova.md`  
Runtime: every Trendscout task gets `TRENDSCOUT_WHATSAPP_RULES` injected from `village/server/outreach-phone.mts`  
Cursor: `ship-marketing-site`, `ui-ux-pro-max`, `src/lib/outreach-demo.ts`

### Per-lead tracker (one file per wow site)

After each Nova deploy, add a card under **`docs/outreach-leads/{name}.md`**: demo URL, preview iframe URL, WhatsApp, `lang`, pitch.  
Example: [`docs/outreach-leads/malditos-bastardos.md`](./outreach-leads/malditos-bastardos.md).

**Click flow:** Nav/hero **Reservar mesa / Reserve a table** → `#reserva` (or `#book`) → iframe **`/book/preview?mode=table`** — Spanish `lang=es`, English `lang=en`. **Do not** create `outreach-*` rows in Supabase.

---

## 1) Lead criteria (Trendscout)

**Hot (WhatsApp outreach):** Verified **`wa.me` on their profile** using a **Spanish mobile** (`6xx` or `7[1-9]xx` after `34`) — **not** `922`/`91` landlines. Busy Instagram, **no** Treatwell/OpenTable/Booksy.

**Warm (demo only):** Phone-only landline — still build Nova site + table embed without `wa=`; Matty calls or visits instead of WhatsApp.

**Verify contacts:** Trendscout can mis-tag numbers. If the only published number is **+34 922…** (or other `9xx` geographic), treat as **phone-only** — no `wa=` on iframe, no WhatsApp CTAs on the demo site.

**Skip:** Already polished online booking, chains with central IT.

**Per lead capture:** `name`, `type`, `whatsapp`, `logo_url`, `website`, `instagram`, `booking_situation`, `why_good_lead`.

---

## 2) Fake booking preview (no Supabase)

One shared route mimics real `/book` UI — **no reservations saved**.

```
https://www.solviosystems.com/book/preview?lang=es&mode=table&name=La%20Brasería&wa=34600111222
```

| Param | Required | Notes |
|-------|----------|--------|
| `lang` | yes | `es` or `en` (copy + calendar labels) |
| `mode` | yes (default `table`) | **`table`** = party size + date + time (restaurants). **`appointment`** = services (barbers only) |
| `name` | yes | Business name in header |
| `wa` | only if **mobile** | Digits only (no `+`) — success screen **Continue on WhatsApp**. **Do not** use Spanish landlines (`922` Tenerife, `91` Madrid, etc.) — they are not WhatsApp; use `tel:` on the demo site instead. Helper: `isLikelyWhatsAppE164()` in `outreach-demo.ts` (Spain: `6xx` / `7xx` after `34`). |
| `logo` | optional | Image URL for header |

TypeScript: `outreachBookingEmbedSrc({ businessName, lang, mode: 'table', whatsapp })` in `src/lib/outreach-demo.ts`.

After they pay, you provision a **real** merchant in Solvio (dashboard onboarding) — not via `outreach-*` slugs.

---

## 3) Nova demo site (booking embedded)

### Real assets (mandatory)

Before building any outreach demo:

1. **Scrape/fetch the lead’s live site** — contact, prices/menu/hire, about.
2. **Images** — hero and service photos must come from **their** domain (e.g. `static.wixstatic.com` for Wix, `/images/` on their host). **Do not** use generic Unsplash unless they have no photos.
3. **Copy & prices** — use their wording and published prices; note source in `docs/outreach-leads/{slug}.md`.
4. **Brand** — nav colours, fonts, logo from their site when possible.

Cursor rule: `.cursor/rules/outreach-demo-site-assets.mdc`

**Mandatory block** on every outreach site:

```html
<!-- Spanish restaurant (default) -->
<section id="reserva">
  <h2>Reservar mesa — Pruébalo ahora</h2>
  <iframe
    src="https://www.solviosystems.com/book/preview?lang=es&amp;mode=table&amp;name=RESTAURANT&amp;wa=34600111222"
    width="100%" height="700" style="border:none;border-radius:12px;"
    title="Reservar mesa" loading="lazy"></iframe>
</section>
```

CTAs on the **marketing site** should point to **their WhatsApp** for activation (£100 + £50/mo), not Solvio login.

**Site structure:** Header (their logo) → Hero → Services/About → **#book** → Location/hours → Footer.

**Quality:** UI/UX Pro Max design-system first; Lucide icons; mobile-first; no emoji UI chrome.

**Host:** Deploy to Vercel (separate preview project per city batch or one `solvio-outreach` repo with subfolders).

**Share only the short production URL** (e.g. `https://9-malditos-bastardos.vercel.app`) — **not** links like `https://9-malditos-bastardos-abc123-mattyg1234s-projects.vercel.app`. Those long deployment URLs ask visitors to log in to Vercel (Deployment Protection). After `vercel deploy`, use **Production URL** from `npx vercel project ls` or the project’s `*.vercel.app` alias.

---

## 4) WhatsApp message (template)

Use `outreachWhatsAppPitch()` in `outreach-demo.ts`, or:

> Hi — [name] from Solvio. We built a free preview for **[Business]**: [demo URL]  
> Scroll to **Book Online** — that's your real booking page.  
> If you want to keep it: **£100 setup + £50/month** — we connect it to your business: [login link]  
> No obligation.

Send from a number they can reply to; follow up once after 48h.

---

## 5) When they say yes — payment & login

### Today (already in product)

| Step | Where |
|------|--------|
| Sign up | `/login` → auth |
| Business + booking setup | Dashboard onboarding wizard |
| Subscription | `/dashboard/pricing` → **Booking £50/mo** (`STRIPE_PRICE_BOOKING`), 7-day trial if new |
| Payouts | Stripe Connect in dashboard |
| Go live | Publish `booking_slug` (replace `outreach-*` or new slug) |

### £100 setup fee (manual / Stripe TODO)

**Not automated yet.** Options:

1. **Stripe one-time** — create Product “Solvio setup” £100; add `STRIPE_PRICE_OUTREACH_SETUP`; Checkout link before onboarding call.
2. **Invoice / bank transfer** — for first 10 closes, then productise.
3. **Bundle** — first month £150 (£100 + £50) via single Checkout (needs custom Stripe Price).

Document closes in a spreadsheet: lead slug, demo URL, paid setup Y/N, `business_id`, live slug.

### Handover (claim outreach demo)

1. Merchant signs up with **same email** you agreed on WhatsApp (or you invite).
2. Either:
   - **A)** Update existing outreach row: set `owner_id` to their user, rename business, keep slug; or  
   - **B)** They create fresh business; you copy floor plan / hours from outreach row; retire `outreach-*` slug.
3. Walk through onboarding on a **15-min call** (see `docs/solvio-launch-checklist.md` Phase E).
4. Stripe Connect + test booking together.
5. Add card for £50/mo (or trial).

---

## 6) Pricing alignment

| Item | Amount | Stripe |
|------|--------|--------|
| Setup (your pitch) | £100 / €100 | Create one-time Price (TODO) |
| Monthly Booking | £50 | `STRIPE_PRICE_BOOKING` ✓ |
| Trial | 7 days | On new businesses (`BOOKING_TRIAL_DAYS`) |

Platform fee on guest deposits: 5% Booking tier (`BOOKING_PLATFORM_FEE_BPS`).

---

## 7) Checklist per lead

- [ ] Trendscout JSON saved (name, WhatsApp, lang)
- [ ] Nova site deployed; iframe `/book/preview?lang=…&name=…&wa=…`
- [ ] Preview tried on phone (fake submit → WhatsApp CTA)
- [ ] WhatsApp pitch sent with demo URL
- [ ] If yes: £100 setup on WhatsApp → real Solvio merchant + £50/mo

---

## 8) What to build next (product)

1. **Stripe £100 setup** checkout + webhook → mark lead “paid setup”.
2. **Admin: create real merchant** after WhatsApp close (not fake preview rows).
3. **Optional:** auto-generate preview URL from Trendscout JSON in Village Nova task.
4. **Outreach dashboard** — table of leads, demo URL, status, WhatsApp sent.

---

## Quick commands

```bash
# Design system for a barbershop demo
python3 ~/.cursor/skills/ui-ux-pro-max/scripts/search.py "UK barbershop booking premium dark" --design-system

# Slug in node (from repo root)
node -e "const {outreachBookingSlug,outreachBookingHref,outreachWhatsAppPitch}=require('./dist/...')"
# Or import from @/lib/outreach-demo in app code
```

Village server: `cd ~/.openclaw/workspace/village/server && node server.mjs` → assign Trendscout then Nova with lead JSON in the task.
