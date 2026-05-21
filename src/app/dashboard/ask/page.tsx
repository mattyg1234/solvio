import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AskSolvioChat } from "@/components/dashboard/ask-solvio-chat";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ask Solvio · Dashboard",
};

export default async function AskSolvioPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">Ask Solvio</h1>
        <p className="max-w-2xl text-sm text-[#64748b]">
          Chat with your own data — your AI receptionist&apos;s call transcripts, every booking, every event. Ask in
          plain English; Solvio looks it up.
        </p>
      </header>

      <AskSolvioChat />
    </div>
  );
}
