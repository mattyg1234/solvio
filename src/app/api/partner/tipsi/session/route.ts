import { NextRequest, NextResponse } from "next/server";

import {
  isTipsiPartnerConfigured,
  syncTipsiStripeForLinkedBusiness,
  verifyTipsiPartnerRequest,
} from "@/lib/partner-tipsi";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildMagicConfirmUrl(siteUrl: string, tokenHash: string, nextPath: string): string {
  const next = encodeURIComponent(nextPath);
  return `${siteUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${next}`;
}

/** Fresh magic link for an already-provisioned Tipsi venue (Open Solvio from Tipsi dashboard). */
export async function POST(request: NextRequest) {
  if (!isTipsiPartnerConfigured()) {
    return NextResponse.json({ ok: false, message: "Partner integration not configured." }, { status: 503 });
  }
  if (!verifyTipsiPartnerRequest(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const { tipsiBusinessId, ownerEmail, tipsiStripeAccountId } = (await request.json()) as {
    tipsiBusinessId?: string;
    ownerEmail?: string;
    tipsiStripeAccountId?: string;
  };

  const tipsiId = tipsiBusinessId?.trim();
  const email = ownerEmail?.trim().toLowerCase();
  if (!tipsiId || !email?.includes("@")) {
    return NextResponse.json({ ok: false, message: "tipsiBusinessId and ownerEmail required." }, { status: 400 });
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: biz } = await admin
    .from("businesses")
    .select("id, booking_slug, owner_id")
    .eq("partner_tipsi_business_id", tipsiId)
    .maybeSingle();

  if (!biz?.id) {
    return NextResponse.json({ ok: false, message: "Solvio not linked for this Tipsi business." }, { status: 404 });
  }

  await syncTipsiStripeForLinkedBusiness(tipsiId, tipsiStripeAccountId);

  const { data: profile } = await admin.from("profiles").select("email").eq("id", biz.owner_id).maybeSingle();
  if ((profile?.email as string | undefined)?.toLowerCase() !== email) {
    return NextResponse.json({ ok: false, message: "Owner email does not match linked account." }, { status: 403 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (await getSiteUrl())).replace(/\/$/, "");
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !data.properties?.hashed_token) {
    return NextResponse.json({ ok: false, message: "Could not create sign-in link." }, { status: 500 });
  }

  const slug = (biz.booking_slug as string | undefined)?.trim();
  return NextResponse.json({
    ok: true,
    dashboardMagicUrl: buildMagicConfirmUrl(siteUrl, data.properties.hashed_token, "/dashboard"),
    bookUrl: slug ? `${siteUrl}/book/${slug}` : null,
    bookingSlug: slug ?? null,
  });
}
