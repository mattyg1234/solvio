"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireShowOpsEnabled } from "@/lib/show-ops/access";
import {
  checkTipsiPassword,
  makeTipsiUnlockToken,
  TIPSI_GATE_COOKIE,
  TIPSI_GATE_TTL_SECONDS,
} from "@/lib/show-ops/tipsi-gate";

const PAGE = "/dashboard/show-ops/tipsi";

export async function unlockTipsiTab(formData: FormData): Promise<void> {
  const ctx = await requireShowOpsEnabled();
  if (ctx.role !== "owner") redirect("/dashboard/show-ops");
  const password = String(formData.get("password") ?? "");
  if (!checkTipsiPassword(password)) {
    // A small pause makes guessing slower; the owner-only check is the real gate.
    await new Promise((r) => setTimeout(r, 800));
    redirect(`${PAGE}?wrong=1`);
  }
  const jar = await cookies();
  jar.set(TIPSI_GATE_COOKIE, makeTipsiUnlockToken(ctx.user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: PAGE,
    maxAge: TIPSI_GATE_TTL_SECONDS,
  });
  const period = String(formData.get("period") ?? "");
  redirect(period ? `${PAGE}?period=${encodeURIComponent(period)}` : PAGE);
}

export async function lockTipsiTab(): Promise<void> {
  const jar = await cookies();
  jar.set(TIPSI_GATE_COOKIE, "", { path: PAGE, maxAge: 0 });
  redirect(PAGE);
}
