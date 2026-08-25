import type { FitSignal, NormalizedPlace, ScoredPlace } from "./types";

/**
 * Score a business for how good a Solvio prospect it is.
 *
 * Solvio sells an AI voice receptionist + online booking to hospitality. The
 * best prospects are reachable by phone but have a weak digital presence —
 * no website, no online booking, or an old/insecure site — because that's
 * exactly the gap Solvio fills. We turn those gaps into weighted "fit signals"
 * that add up to a 0-100 score, and surface them so the outbound pitch can
 * reference the specific defect.
 *
 * Website checks do a single best-effort fetch with a short timeout; failures
 * never throw — a site we can't load is itself a (mild) signal.
 */

const WEIGHTS = {
  noWebsite: 45,
  websiteUnreachable: 20,
  noHttps: 15,
  noOnlineBooking: 20,
  hasPhone: 10,
  goodReputation: 10, // popular-but-underserved = worth winning
} as const;

const BOOKING_HINTS = [
  "book",
  "booking",
  "reserve",
  "reservation",
  "reserva", // ES
  "opentable",
  "thefork",
  "resengo",
  "covermanager",
  "book a table",
];

type WebsiteProbe = {
  reachable: boolean;
  https: boolean;
  hasOnlineBooking: boolean;
};

async function probeWebsite(website: string): Promise<WebsiteProbe> {
  const https = website.trim().toLowerCase().startsWith("https://");
  try {
    const res = await fetch(website, {
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
      headers: { "user-agent": "SolvioLeadFinder/1.0 (+https://solvio.app)" },
    });
    if (!res.ok) return { reachable: false, https, hasOnlineBooking: false };
    const html = (await res.text()).toLowerCase();
    const hasOnlineBooking = BOOKING_HINTS.some((h) => html.includes(h));
    return { reachable: true, https, hasOnlineBooking };
  } catch {
    return { reachable: false, https, hasOnlineBooking: false };
  }
}

export async function qualify(place: NormalizedPlace): Promise<ScoredPlace> {
  const signals: FitSignal[] = [];
  const hasWebsite = Boolean(place.website && place.website.trim());

  if (!hasWebsite) {
    signals.push({ key: "no_website", label: "No website at all", weight: WEIGHTS.noWebsite });
  } else {
    const probe = await probeWebsite(place.website as string);
    if (!probe.reachable) {
      signals.push({
        key: "website_unreachable",
        label: "Website down / unreachable",
        weight: WEIGHTS.websiteUnreachable,
      });
    }
    if (!probe.https) {
      signals.push({ key: "no_https", label: "No HTTPS (insecure site)", weight: WEIGHTS.noHttps });
    }
    if (probe.reachable && !probe.hasOnlineBooking) {
      signals.push({
        key: "no_online_booking",
        label: "No online booking on site",
        weight: WEIGHTS.noOnlineBooking,
      });
    }
  }

  if (place.phone && place.phone.trim()) {
    signals.push({ key: "has_phone", label: "Reachable by phone", weight: WEIGHTS.hasPhone });
  }

  // Popular places with lots of reviews are worth winning even if smaller gaps.
  if ((place.rating ?? 0) >= 4.0 && (place.reviewCount ?? 0) >= 100) {
    signals.push({
      key: "good_reputation",
      label: "Well-reviewed (worth winning)",
      weight: WEIGHTS.goodReputation,
    });
  }

  const fitScore = Math.min(100, signals.reduce((s, sig) => s + sig.weight, 0));

  return { ...place, hasWebsite, fitScore, fitSignals: signals };
}

/** Qualify a batch with bounded concurrency so we don't hammer many sites at once. */
export async function qualifyAll(places: NormalizedPlace[], concurrency = 5): Promise<ScoredPlace[]> {
  const out: ScoredPlace[] = [];
  for (let i = 0; i < places.length; i += concurrency) {
    const batch = places.slice(i, i + concurrency);
    out.push(...(await Promise.all(batch.map(qualify))));
  }
  return out;
}
