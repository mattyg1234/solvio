import QRCode from "qrcode";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { showOpsTicketUrl } from "@/lib/show-ops/ticket-token";
import { getDeploymentSiteUrl } from "@/lib/deployment-site-url";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const token = (await params).token?.trim().toLowerCase() ?? "";
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from("show_bookings")
    .select("ticket_token,cancelled_at")
    .eq("ticket_token", token)
    .maybeSingle();
  if (!data || data.cancelled_at) {
    return new Response("Not found", { status: 404 });
  }
  const png = await QRCode.toBuffer(showOpsTicketUrl(getDeploymentSiteUrl(), token), {
    type: "png",
    width: 480,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  // Buffer is not a valid BodyInit under the DOM lib; hand Response a plain view.
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
