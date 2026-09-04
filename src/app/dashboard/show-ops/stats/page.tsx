import { redirect } from "next/navigation";

/**
 * Stats & insights moved into Reports (the "Year" block at the bottom).
 * Old links and bookmarks land there with their month / island carried over.
 */
export default async function ShowOpsStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ island?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  if (sp.island) p.set("island", sp.island);
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) p.set("stats_month", sp.month);
  const q = p.toString();
  redirect(q ? `/dashboard/show-ops/reports?${q}#year` : "/dashboard/show-ops/reports#year");
}
