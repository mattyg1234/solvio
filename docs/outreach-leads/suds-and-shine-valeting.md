# Suds & Shine Valeting — Greater Manchester

| Field | Value |
|-------|--------|
| **Service** | Mobile car valeting & detailing |
| **Area** | Manchester / Greater Manchester |
| **Contact** | **No WhatsApp** (May 2026) — use Instagram DM, Facebook, phone, or email from their profile |
| **Booking embed** | `https://www.solviosystems.com/book/preview?lang=en&mode=appointment&name=Suds%20%26%20Shine%20Valeting` (no `wa=`) |
| **Demo site** | https://suds-and-shine-valeting.vercel.app |
| **lang** | `en` |
| **mode** | `appointment` |
| **outreach_channel** | `phone_or_social` (not WhatsApp) |

## Gap (pitch)

- Strong social / before-and-after content; bookings handled manually (DMs, calls, texts).
- No self-serve “pick package + Saturday slot + deposit” while on a job.

## Rebuild / deploy

```bash
cd Village/sites/solvio
npx tsx scripts/build-suds-shine-outreach.mts
```

## Pitch — Instagram / Facebook DM (not WhatsApp)

Hi — I'm Matty from Solvio. I put together a quick **booking preview** for Suds & Shine Valeting:

https://suds-and-shine-valeting.vercel.app

Scroll to **Book online** and try it on your phone (demo only). If you want it live with deposits and calendar: £100 setup + £50/month — happy to jump on a quick call.

No pressure.

## Pitch — if you find a phone / email only

Same link; offer a **5-minute call** instead of “reply on WhatsApp”.

## Notes

- Earlier lead data listed +44 7414 656133 as WhatsApp — **incorrect**; removed from demo.
- Do not add `wa=` to the iframe unless they give a verified business WhatsApp.
- When they go live, Solvio can email alerts + (later) SMS; merchant WhatsApp alerts are a separate product feature.
