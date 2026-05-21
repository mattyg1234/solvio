import { redirect } from "next/navigation";

import { TwilioNumberAdmin } from "@/components/admin/twilio-number-admin";
import { isSolvioAdminEmail } from "@/lib/solvio-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasTwilioCredentials, SUPPORTED_TWILIO_COUNTRIES } from "@/lib/twilio-phone-numbers";

export const metadata = { title: "Twilio numbers · Solvio admin" };

export default async function AdminTwilioPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isSolvioAdminEmail(user.email ?? null)) redirect("/dashboard");

  const credsReady = hasTwilioCredentials();
  const countries = SUPPORTED_TWILIO_COUNTRIES.slice();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7c3aed]">Solvio admin</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">Twilio numbers</h1>
        <p className="text-sm text-[#64748b]">
          Search and claim numbers that power the shared Solvio outbound line — used for booking-confirmation SMS and
          AI-dialled campaign calls across every merchant. Numbers bought here are billed to your Twilio sub-account
          (~£1/month carry plus per-message usage).
        </p>
      </header>

      {!credsReady ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <p className="font-semibold">Set Twilio credentials first</p>
          <p className="mt-1">
            Add these env vars on Vercel (Production + Preview), then redeploy:
          </p>
          <ul className="mt-2 space-y-1 font-mono text-[12px]">
            <li>SOLVIO_TWILIO_ACCOUNT_SID = your Twilio Account SID (starts with AC…)</li>
            <li>SOLVIO_TWILIO_AUTH_TOKEN = the auth token from console.twilio.com</li>
          </ul>
        </div>
      ) : (
        <TwilioNumberAdmin countries={countries} />
      )}

      <div className="rounded-2xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-4 text-xs text-[#64748b]">
        <p className="font-semibold text-[#0f172a]">After you buy a number</p>
        <p className="mt-1">
          Set <code className="font-mono">SOLVIO_TWILIO_FROM_NUMBER</code> on Vercel to the new E.164 number, then
          redeploy. Booking confirmation SMS will start flowing from it on the next booking-confirmed event.
        </p>
      </div>
    </div>
  );
}
