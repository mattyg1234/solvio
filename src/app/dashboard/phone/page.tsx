import { redirect } from "next/navigation";

import { PhoneNumberManager } from "@/components/dashboard/phone-number-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Phone numbers · Solvio" };

export default async function PhoneNumbersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id,name,vapi_assistant_id,vapi_phone_number_id,phone_number_e164,phone_number_country")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  const rows = (businesses ?? []).map((b) => ({
    id: b.id as string,
    name: (b.name as string) ?? "",
    hasAssistant: Boolean(b.vapi_assistant_id),
    phoneNumberId: (b.vapi_phone_number_id as string | null) ?? null,
    phoneNumberE164: (b.phone_number_e164 as string | null) ?? null,
    country: (b.phone_number_country as string | null) ?? null,
  }));

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">Phone numbers</h1>
        <p className="max-w-2xl text-sm text-[#64748b]">
          Give your AI receptionist a real number so customers can call you. Each business has one dedicated number —
          customers see your name on caller ID, and inbound calls route straight to your saved receptionist.
        </p>
      </header>

      <PhoneNumberManager businesses={rows} />
    </div>
  );
}
