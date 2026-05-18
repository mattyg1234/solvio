import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Settings · Dashboard · Solvio",
};

export default async function DashboardSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: businesses } = await supabase.from("businesses").select("*").eq("owner_id", user.id);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Badge variant="outline" className="rounded-full border-[#ebe7f7] text-[11px] font-semibold uppercase tracking-[0.2em] text-[#64748b]">
          Workspace identity
        </Badge>
        <h1 className="text-[clamp(1.45rem,3vw,2rem)] font-semibold tracking-tight text-[#0f172a]">Settings</h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-[#64748b]">
          Profile and venue rows stay governed by Supabase RLS — adjust commerce details under Payments when Stripe connects.
        </p>
      </div>

      {!profile ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your profile row wasn&apos;t created yet — run the database migration in Supabase (SQL file in{" "}
          <code className="rounded bg-white px-1">supabase/migrations/</code>), then sign up again or insert a profile for your user id.
        </p>
      ) : null}

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Profile</CardTitle>
          <CardDescription className="text-[#64748b]">Stored securely in Supabase with row-level security.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-[15px] text-[#475569]">
          <p>
            <span className="font-semibold text-[#0f172a]">Email:</span> {profile?.email ?? user.email ?? "—"}
          </p>
          <p>
            <span className="font-semibold text-[#0f172a]">Name:</span> {(profile?.full_name as string)?.trim() || "—"}
          </p>
          <p className="text-xs text-[#94a3b8]">User id: {user.id}</p>
        </CardContent>
      </Card>

      <Card className="rounded-[22px] border border-[#ebe7f7] bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-[#0f172a]">Businesses</CardTitle>
          <CardDescription className="text-[#64748b]">
            Created from your signup — Stripe Connect IDs land here as you onboard payments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!businesses?.length ? (
            <p className="text-[15px] text-[#64748b]">No business rows yet.</p>
          ) : (
            <ul className="space-y-2">
              {businesses.map((b) => (
                <li
                  key={b.id}
                  className="rounded-2xl border border-[#f1eefc] bg-[#fafbff] px-4 py-3 text-[15px] text-[#0f172a]"
                >
                  {b.name}
                  {b.stripe_connect_account_id ? (
                    <span className="mt-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#64748b]">
                      Stripe connected
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 rounded-[22px] border border-dashed border-[#ddd6fe] bg-[#fafbff]/90 px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#0f172a]">Need marketing context?</p>
          <p className="text-sm text-[#64748b]">Jump back to the public site — your session stays signed in.</p>
        </div>
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-[#ebe7f7] font-semibold")}>
          View homepage
        </Link>
      </div>

      <div className="md:hidden">
        <SignOutButton className="w-full rounded-xl border-[#ebe7f7] font-semibold" />
      </div>
    </div>
  );
}
