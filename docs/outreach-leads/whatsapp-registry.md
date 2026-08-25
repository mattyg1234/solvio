# Village outreach sites — WhatsApp & contact registry

Last checked: 2026-05-28. Sources: site HTML, official business websites, Mercado Barceló / signoribarbers.com scrapes.

| Business | Demo URL (Vercel) | Lang | WhatsApp (outreach) | wa.me | Phone (if no WA) | Notes |
|----------|-------------------|------|---------------------|-------|------------------|-------|
| **Malditos Bastardos** | https://9-malditos-bastardos.vercel.app/ | es | **+34 692 25 68 45** | [link](https://wa.me/34692256845) | +34 911 63 10 41 (Barceló shop) | WA from [Mercado Barceló](https://mercadobarcelo.es/portfolio/malditos-bastardos-barberia/) “PIDE CITA POR WHATSAPP”. Demo copy says Salamanca; real brand is multi-location (Barceló / Colmenar). |
| **Signori Barbers** | *(deploy TBD — source in `village/data/websites/signori-barbers-manchester/`)* | en | **+44 7458 302 461** | [link](https://wa.me/447458302461) | Same | Confirmed on [signoribarbers.com](https://signoribarbers.com/) (SMS + WhatsApp). 101 Crumpsall Ln, Manchester M8 5SR. |
| **Barbería Provenza** | *(deploy TBD — `openclaw/workspace/data/websites/barberia-provenza/`)* | es | **+34 611 248 562** | [link](https://wa.me/34611248562) | Same | Confirmed on [barberiaprovenza.com](https://barberiaprovenza.com/). Puente de Vallecas positioning on demo. |
| **Chamberí 5** | https://chamberi5-demo.vercel.app/ | es | **None found** | — | **+34 917 27 39 03** | Real shop: Plaza de Chamberí 5. Books via [Booksy](https://booksy.com/es-es/50365_chamberi-5-barberia_barberia_53009_madrid). Pitch by phone or find IG bio WA. |
| **Leith Barbers** | https://10-leith-barbers.vercel.app/ | en | **Not advertised** | [try mobile](https://wa.me/447951476895) | **+44 7951 476 895** | Real: [leithbarbersedinburgh.co.uk](https://www.leithbarbersedinburgh.co.uk/), 1 Great Junction St EH6 5HX. Demo site still has **wrong** placeholder `+44 131 555 0199`. UK mobile may accept WA — unverified. |
| **Sauchiehall Barbers** | https://sauchiehall-barbers.vercel.app/ | en | **None found** | — | **+44 141 332 0900** | Real: [sauchiebarbers.co.uk](https://www.sauchiebarbers.co.uk/), 281 Sauchiehall St G2 3HQ. Online via Fresha; landline — poor WA fit. |
| **Mobile Barber LDN** | *(demo / fictional lead)* | en | **Placeholder only** | — | — | Site uses `447700000000` — **not a real business**. Replace when Trendscout finds a real mobile barber. |

## Preview iframe `wa=` (Solvio)

```
/book/preview?lang=es&name=Malditos%20Bastardos&wa=34692256845
/book/preview?lang=en&name=Signori%20Barbers&wa=447458302461
/book/preview?lang=es&name=Barber%C3%ADa%20Provenza&wa=34611248562
/book/preview?lang=en&name=Leith%20Barbers&wa=447951476895   # unverified WA
/book/preview?lang=es&name=Chamberi%205                    # no wa — phone close
/book/preview?lang=en&name=Sauchiehall%20Barbers           # no wa — phone close
```

## Not hospitality outreach (Village built, skip for Solvio barber pitch)

`4-solvio`, `7-solvio`, `8-solvio`, `forge-fitness`, `6-forge-fitness`, `synapse-saas`, `hearth-harvest`, `tide-co`, `inkwell-landing` — product/marketing demos, not Trendscout barber leads.
