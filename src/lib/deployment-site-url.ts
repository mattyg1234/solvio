/** Sync public site origin for webhooks and tool URLs (no request headers). */
export function getDeploymentSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  // Production fallback — the branded Solvio domain. Used when NEXT_PUBLIC_SITE_URL is
  // not set in this deployment (e.g. server actions / webhooks without a request host).
  // Prefer not to leak the random *.vercel.app preview URL into SMS / email confirmations.
  if (process.env.VERCEL_ENV === "production") {
    return "https://www.solviosystems.com";
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

export function vapiToolServerUrl(): string {
  return `${getDeploymentSiteUrl()}/api/webhooks/vapi-tool`;
}
