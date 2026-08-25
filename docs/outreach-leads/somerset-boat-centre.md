# Somerset Boat Centre — North Newton, Bridgwater

| Field | Value |
|-------|--------|
| **Existing site** | https://somersetboatcentre.co.uk/ |
| **Address** | Maidenmead Moorings, Banklands, North Newton, Bridgwater TA7 0DQ |
| **Email** | info@somersetboatcentre.co.uk |
| **Phone** | **07508 959 996** · 07946 580 050 (council listing — not on new site footer) |
| **WhatsApp** | **None listed** — do not pitch “reply on WhatsApp” unless they confirm a mobile |
| **Booking embed** | `https://www.solviosystems.com/book/preview?lang=en&mode=appointment&name=Somerset%20Boat%20Centre` (no `wa=`) |
| **Demo site** | https://somerset-boat-centre.vercel.app ✓ |
| **mode** | `appointment` (kayak / SUP / narrowboat in preview) |
| **outreach_channel** | `email` or `phone` |

## MS Beauty Salon (previous lead) — WhatsApp

**07397 111110** · `+44 7397 111110` · `wa=447397111110`  
Demo: https://ms-beauty-salon-luton.vercel.app

## Fleet & prices (from boat-hire page)

| Craft | Price |
|-------|-------|
| Skippered narrowboat (Somersun) | £180 / 2.5h |
| Self-drive narrowboat (Somerdays) | £195 / 7h (+ £100 deposit) |
| Wheelchair boat | £60 / 1h |
| Canadian canoe | £15 / 1h |
| SUP | £12.50 / 1h |
| Big Billie paddle board | £50 / 1h |
| Kayak single | £12.50 / 1h |
| Kayak twin | £15 / 1h |
| Rafted canoes | £20 / 1h |

All nine appear on demo with **their photos** from `somersetboatcentre.co.uk/images/*` + matching copy.

Demo styling matches their site: `#004D6B` nav, `#FF6300` buttons, Bitter + Open Sans, hero `1756334675.jpg` (canal — not stock diver).

## Qualification

- New website; hire catalog with “Book now” (existing flow).
- **Wedge:** unified online book + **deposit** (narrowboat £100 deposit mentioned on site) vs email back-and-forth.
- Moorings/training = email enquiry; hire = best for Solvio book flow.

## Deploy

```bash
npx tsx scripts/build-somerset-boat-outreach.mts
```

## Email pitch (no WhatsApp)

Subject: Quick booking preview for Somerset Boat Centre

Hi,

I'm Matty from Solvio — we built a short **online hire booking preview** for Somerset Boat Centre:

https://somerset-boat-centre.vercel.app

Scroll to **Book online** and try picking a craft and time on your phone (demo only). If you'd like this live with deposits on your site: £100 setup + £50/month.

Happy to jump on a quick call: 07508 959 996 works if easier.

Matty

## Phone pitch (optional)

Same link; they already have online book buttons — focus on **deposit + one calendar** for kayaks through to narrowboat.
