/** Sync public site origin for webhooks and tool URLs (no request headers). */
export function getDeploymentSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

export function vapiToolServerUrl(): string {
  return `${getDeploymentSiteUrl()}/api/webhooks/vapi-tool`;
}
