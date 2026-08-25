import Link from "next/link";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { showOpsTicketPath } from "@/lib/show-ops/ticket-token";

export default async function ShowOpsPaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const sp = await searchParams;
  const ref = sp.ref?.trim() || "";
  let ticketHref: string | null = null;
  if (ref) {
    const admin = createSupabaseServiceRoleClient();
    const { data } = await admin
      .from("show_bookings")
      .select("ticket_token")
      .eq("booking_ref", ref)
      .is("cancelled_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.ticket_token) ticketHref = showOpsTicketPath(String(data.ticket_token));
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Payment received</h1>
      <p className="mt-3 text-slate-600">
        Thank you. {ref ? `Booking ${ref} is marked paid.` : "Your booking is marked paid."} Your ticket is on its way
        by email and text.
      </p>
      {ticketHref ? (
        <p className="mt-6">
          <Link
            href={ticketHref}
            className="inline-block rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white"
          >
            View your ticket
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-sm text-slate-500">You can close this page.</p>
      )}
    </main>
  );
}
