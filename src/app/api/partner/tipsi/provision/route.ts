import { NextRequest, NextResponse } from "next/server";

import {
  isTipsiPartnerConfigured,
  provisionTipsiPartner,
  verifyTipsiPartnerRequest,
  type TipsiProvisionInput,
} from "@/lib/partner-tipsi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isTipsiPartnerConfigured()) {
    return NextResponse.json({ ok: false, message: "Partner integration not configured." }, { status: 503 });
  }
  if (!verifyTipsiPartnerRequest(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  let body: TipsiProvisionInput;
  try {
    body = (await request.json()) as TipsiProvisionInput;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const result = await provisionTipsiPartner(body);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
