# MS Beauty Salon — Luton

| Field | Value |
|-------|--------|
| **Existing site** | https://msbeautysalon.co.uk/ |
| **Address** | 3 Archway Rd, Marsh Rd, Luton LU3 2RW |
| **Phone / WhatsApp** | 07397 111110 · `wa=447397111110` |
| **Email** | info@msbeautysalon.co.uk |
| **Booking embed** | `https://www.solviosystems.com/book/preview?lang=en&mode=appointment&name=MS%20Beauty%20Salon&wa=447397111110` |
| **Demo site** | https://ms-beauty-salon-luton.vercel.app |
| **lang** | `en` |
| **mode** | `appointment` (beauty treatments in preview) |
| **outreach_channel** | `whatsapp_mobile` |

## Qualification

- **Not** a “no website” lead — they have a full SEO site + WhatsApp booking.
- **Wedge:** cleaner **self-serve book + deposit** vs WhatsApp-only / generic form; optional replace or embed on their domain later.
- Strong fit for Solvio **Booking** (£50/mo); 348+ Google reviews = real volume.

## Deploy

```bash
cd Village/sites/solvio
npx tsx scripts/build-ms-beauty-outreach.mts
```

## WhatsApp pitch

Hi — Matty from Solvio. We mocked up a **faster online booking** preview for MS Beauty Salon (your Luton salon):

https://ms-beauty-salon-luton.vercel.app

Scroll to **Book online** — pick a treatment and time on your phone (demo). If you want it live on your site with deposits: £100 setup + £50/month. Happy to chat.

No pressure.

## Notes

- Stock hero image (Unsplash) — not their salon photos.
- After Solvio prod deploy, iframe shows threading / cut / wax (not barber defaults).
