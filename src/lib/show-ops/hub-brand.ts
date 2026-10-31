/**
 * The MHT Hub's own front door. On MHT's hosts (mht.solviosystems.com now, mhtshowshub.com
 * later) the sign in page wears MHT Shows' branding instead of Solvio's.
 *
 * Colours and logo match MHT's Show Ops branding in Settings (business "MHT Show Ops").
 */
export type HubBrand = {
  name: string;
  company: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  islands: string[];
  contactEmail: string;
  website: string;
};

export const MHT_HUB_BRAND: HubBrand = {
  name: "The MHT Hub",
  company: "MHT Shows · Music Hall Tavern",
  logoUrl:
    "https://aasfahcrdcoqxwnlkdnv.supabase.co/storage/v1/object/public/business-logos/5a16bfc4-3363-43e1-bd8c-30afcf3d3529/logo-5286512c-3678-4bb4-a3c0-e6a39451992d.png",
  primaryColor: "#ff40ff",
  accentColor: "#fffb00",
  islands: ["Lanzarote", "Tenerife", "Gran Canaria"],
  contactEmail: "reservations@musichalltavern.com",
  website: "https://musichalltavern.com",
};

/** True for the hosts the MHT Hub is served on. */
export function isMhtHubHost(rawHost: string | null | undefined): boolean {
  const host = (rawHost ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (!host) return false;
  if (host.startsWith("mht.")) return true;
  return host === "mhtshowshub.com" || host.endsWith(".mhtshowshub.com");
}

/** The Hub brand for this request, or null for Solvio's own pages. `?hub=mht` previews it anywhere. */
export function hubBrandFor(host: string | null | undefined, hubParam?: string | string[]): HubBrand | null {
  const param = Array.isArray(hubParam) ? hubParam[0] : hubParam;
  if (param === "mht" || isMhtHubHost(host)) return MHT_HUB_BRAND;
  return null;
}
