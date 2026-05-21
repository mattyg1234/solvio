import { getPlatformElevenLabsVoiceIdFromEnv, PLATFORM_ELEVENLABS_VOICE_MODEL } from "@/lib/platform-voice-config";

/** Spoken when merchants tap play on any voice card in Receptionist Studio. */
export const SOLVIO_VOICE_DEMO_SENTENCE =
  "Choosing Solvio to automate your business and organise your bookings is the best choice.";

export type SolvioVoiceCategory = "system" | "solvio";

export type SubscriptionTier = "trial" | "pro" | "business" | "scale" | "enterprise";

export type SolvioVoiceEntry = {
  id: string;
  name: string;
  description: string;
  category: SolvioVoiceCategory;
  /** Lowest plan tier that may select this voice. */
  minTier: SubscriptionTier;
};

const TIER_RANK: Record<SubscriptionTier, number> = {
  trial: 0,
  pro: 1,
  business: 2,
  scale: 3,
  enterprise: 4,
};

/** Curated ElevenLabs library voices — available on all plans. */
const SYSTEM_VOICES: SolvioVoiceEntry[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    description: "Calm, clear American — good default for hospitality.",
    category: "system",
    minTier: "trial",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    description: "Soft and reassuring — ideal for bookings and enquiries.",
    category: "system",
    minTier: "trial",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    description: "Deep and steady — confident front-of-house tone.",
    category: "system",
    minTier: "trial",
  },
  {
    id: "IKne3meq5aSn9XLyUdCD",
    name: "Charlie",
    description: "Friendly Australian — relaxed neighbourhood vibe.",
    category: "system",
    minTier: "trial",
  },
  {
    id: "XB0fDUnXU5powFXDhCwa",
    name: "Charlotte",
    description: "Polished British — quiet luxury and fine dining.",
    category: "system",
    minTier: "trial",
  },
];

type PersonalisedVoiceJson = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  minTier?: unknown;
};

function parsePersonalisedVoicesFromEnv(): SolvioVoiceEntry[] {
  const raw = process.env.SOLVIO_PERSONALISED_VOICES_JSON?.trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const out: SolvioVoiceEntry[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as PersonalisedVoiceJson;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) continue;

    const minTierRaw = typeof row.minTier === "string" ? row.minTier.trim() : "trial";
    const minTier: SubscriptionTier =
      minTierRaw === "trial" ||
      minTierRaw === "pro" ||
      minTierRaw === "business" ||
      minTierRaw === "scale" ||
      minTierRaw === "enterprise"
        ? minTierRaw
        : "trial";

    out.push({
      id,
      name,
      description:
        typeof row.description === "string" && row.description.trim()
          ? row.description.trim()
          : "Solvio brand voice — crafted for reception and bookings.",
      category: "solvio",
      minTier,
    });
  }

  return out;
}

function platformVoiceAsSolvioEntry(platformVoiceId: string): SolvioVoiceEntry | null {
  if (!platformVoiceId) return null;
  return {
    id: platformVoiceId,
    name: "Solvio default",
    description: "Same voice as the Solvio homepage receptionist.",
    category: "solvio",
    minTier: "trial",
  };
}

/** Full catalogue for Receptionist Studio (server-side). */
export function getSolvioVoiceLibrary(platformVoiceId?: string): SolvioVoiceEntry[] {
  const platformId = platformVoiceId?.trim() || getPlatformElevenLabsVoiceIdFromEnv();
  const personalised = parsePersonalisedVoicesFromEnv();
  const solvioById = new Map<string, SolvioVoiceEntry>();

  for (const voice of personalised) {
    solvioById.set(voice.id, voice);
  }

  const platformEntry = platformVoiceAsSolvioEntry(platformId);
  if (platformEntry && !solvioById.has(platformEntry.id)) {
    solvioById.set(platformEntry.id, platformEntry);
  }

  return [...SYSTEM_VOICES, ...solvioById.values()];
}

export function getSolvioVoiceLibraryForClient(platformVoiceId?: string): {
  demoSentence: string;
  voices: SolvioVoiceEntry[];
  voiceModel: string;
} {
  return {
    demoSentence: SOLVIO_VOICE_DEMO_SENTENCE,
    voices: getSolvioVoiceLibrary(platformVoiceId),
    voiceModel: PLATFORM_ELEVENLABS_VOICE_MODEL,
  };
}

export function findVoiceInLibrary(voiceId: string, platformVoiceId?: string): SolvioVoiceEntry | null {
  const id = voiceId.trim();
  if (!id) return null;
  return getSolvioVoiceLibrary(platformVoiceId).find((v) => v.id === id) ?? null;
}

export function tierMeetsMinimum(current: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_RANK[current] >= TIER_RANK[required];
}

export function isVoiceAllowedForTier(voice: SolvioVoiceEntry, tier: SubscriptionTier): boolean {
  return tierMeetsMinimum(tier, voice.minTier);
}

export function resolveDefaultVoiceSelection(
  tier: SubscriptionTier,
  savedVoiceId: string | undefined,
  platformVoiceId: string,
): SolvioVoiceEntry {
  const library = getSolvioVoiceLibrary(platformVoiceId);

  if (savedVoiceId) {
    const saved = library.find((v) => v.id === savedVoiceId.trim());
    if (saved && isVoiceAllowedForTier(saved, tier)) return saved;
  }

  const platformEntry = library.find((v) => v.category === "solvio" && v.id === platformVoiceId.trim());
  if (platformEntry && isVoiceAllowedForTier(platformEntry, tier)) return platformEntry;

  const firstAllowed = library.find((v) => isVoiceAllowedForTier(v, tier));
  if (firstAllowed) return firstAllowed;

  return SYSTEM_VOICES[0]!;
}

export function planLabelForVoice(voice: SolvioVoiceEntry): string | null {
  if (voice.minTier === "trial") return null;
  if (voice.minTier === "pro") return "Pro";
  if (voice.minTier === "business") return "Business";
  if (voice.minTier === "scale") return "Scale";
  return "Enterprise";
}
