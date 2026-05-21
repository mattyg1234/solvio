import { redirect } from "next/navigation";

import { PhoneNumberManager } from "@/components/dashboard/phone-number-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Phone numbers · Solvio" };

type BusinessRow = {
  id: string;
  name: string;
  hasAssistant: boolean;
  phoneNumberId: string | null;
  phoneNumberE164: string | null;
  country: string | null;
};

export default async function PhoneNumbersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // First try the full select (works once the phone-number migration is applied).
  // If columns aren't there yet, gracefully fall back to a basic select so the
  // page still lists every business and tells the merchant a migration is pending.
  let rows: BusinessRow[] = [];
  let migrationPending = false;
  let loadError: string | null = null;

  const full = await supabase
    .from("businesses")
    .select("id,name,voice_receptionist_details,vapi_phone_number_id,phone_number_e164,phone_number_country")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const extractAssistantId = (details: unknown): string | null => {
    if (!details || typeof details !== "object") return null;
    const id = (details as Record<string, unknown>).vapi_assistant_id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  };

  if (full.error) {
    // Column missing → fall back to a select without the new phone-number columns.
    if (/vapi_phone_number_id|phone_number_e164|phone_number_country|does not exist|undefined column/i.test(full.error.message)) {
      migrationPending = true;
    } else {
      loadError = full.error.message;
    }

    const basic = await supabase
      .from("businesses")
      .select("id,name,voice_receptionist_details")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true });

    if (basic.data) {
      rows = basic.data.map((b) => ({
        id: b.id as string,
        name: (b.name as string) ?? "",
        hasAssistant: Boolean(extractAssistantId(b.voice_receptionist_details)),
        phoneNumberId: null,
        phoneNumberE164: null,
        country: null,
      }));
    } else if (basic.error && !loadError) {
      loadError = basic.error.message;
    }
  } else if (full.data) {
    rows = full.data.map((b) => ({
      id: b.id as string,
      name: (b.name as string) ?? "",
      hasAssistant: Boolean(extractAssistantId(b.voice_receptionist_details)),
      phoneNumberId: (b.vapi_phone_number_id as string | null) ?? null,
      phoneNumberE164: (b.phone_number_e164 as string | null) ?? null,
      country: (b.phone_number_country as string | null) ?? null,
    }));
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">Phone numbers</h1>
        <p className="max-w-2xl text-sm text-[#64748b]">
          Give your AI receptionist a real number so customers can call you. Each business has one dedicated number —
          customers see your name on caller ID, and inbound calls route straight to your saved receptionist.
        </p>
      </header>

      {migrationPending ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <p className="font-semibold">Database migration pending</p>
          <p className="mt-1">
            Run this SQL in your Supabase project (SQL editor → New query → Run) to enable number storage:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-amber-100/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-amber-950">
{`alter table public.businesses
  add column if not exists vapi_phone_number_id text,
  add column if not exists phone_number_e164 text,
  add column if not exists phone_number_country text,
  add column if not exists phone_number_provisioned_at timestamptz;`}
          </pre>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">Couldn&apos;t load your businesses</p>
          <p className="mt-1 font-mono text-[12px]">{loadError}</p>
        </div>
      ) : null}

      <PhoneNumberManager businesses={rows} />
    </div>
  );
}
