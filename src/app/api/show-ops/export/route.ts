import { NextResponse } from "next/server";

import { buildShowOpsBackup } from "@/lib/show-ops/backup";
import { resolveShowOpsBusinessId } from "@/lib/show-ops/resolve-business";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Tenant JSON backup — the Plan B restore source. Every table read in full. */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveShowOpsBusinessId(supabase, user.id);
  if (!resolved?.show_ops_enabled) {
    return NextResponse.json({ error: "Show Ops not enabled" }, { status: 403 });
  }

  const { data: business } = await supabase
    .from("businesses")
    .select(
      "id,name,show_ops_enabled,show_ops_config,show_ops_billing_tier,show_ops_display_name,show_ops_custom_domain",
    )
    .eq("id", resolved.id)
    .maybeSingle();
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 });

  const payload = await buildShowOpsBackup(supabase, business);

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="show-ops-backup-${String(business.id).slice(0, 8)}.json"`,
    },
  });
}
