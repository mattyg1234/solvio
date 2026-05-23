import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookingPublicForm } from "./booking-public-form";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseBookingPublicContext, parseGuestModesFromRpc } from "@/lib/booking-public-context";
import type { AppointmentBreak } from "@/lib/booking-appointment-slots";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ deposit?: string | string[] }>;
};

function parseDepositFlash(raw: string | string[] | undefined): "success" | "cancel" | null {
  const v = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (v === "success") return "success";
  if (v === "cancel") return "cancel";
  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_booking_public_context", { p_slug: slug });
  const ctx = !error ? parseBookingPublicContext(data) : null;
  const name = ctx?.business_name;
  if (!name) {
    return { title: "Book · Solvio" };
  }
  return {
    title: `Book ${name} · Solvio`,
    description: `Request a reservation or appointment with ${name} through Solvio.`,
  };
}

export default async function PublicBookingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const depositFlash = parseDepositFlash(sp.deposit);
  if (!slug?.trim()) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseServiceRoleClient();
  const [{ data, error }, { data: bizRow }] = await Promise.all([
    supabase.rpc("get_booking_public_context", { p_slug: slug.trim() }),
    admin.from("businesses").select("id").eq("booking_slug", slug.trim()).maybeSingle(),
  ]);

  if (error) {
    console.error("[book] get_booking_public_context failed:", error.message);
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafbff] px-4 py-16">
        <div className="max-w-md rounded-[24px] border border-rose-100 bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-[#0f172a]">Booking page temporarily unavailable</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#64748b]">
            We couldn&apos;t load this venue&apos;s booking setup. If you&apos;re the owner, open Supabase → SQL Editor
            and run the latest migrations (including{" "}
            <code className="font-mono text-xs">20260621180000_repair_event_custom_questions.sql</code>), then try again.
          </p>
        </div>
      </div>
    );
  }

  const ctx = parseBookingPublicContext(data);

  if (!ctx) {
    notFound();
  }

  let publicBreaks: AppointmentBreak[] = [];
  if (bizRow?.id) {
    const { data: brkData } = await admin
      .from("appointment_breaks")
      .select("weekdays, start_time, end_time")
      .eq("business_id", bizRow.id);
    publicBreaks = (brkData ?? []) as AppointmentBreak[];
  }

  let guestModes = parseGuestModesFromRpc(ctx.guest_modes_raw);
  if (!guestModes.length) {
    guestModes = ["appointment", "table", "walk_in"];
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#f8fafc] via-[#fafbff] to-[#f5f3ff]/40">
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-[#ede9fe]/80 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 bottom-20 h-80 w-80 rounded-full bg-[#dbeafe]/60 blur-3xl" aria-hidden />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 py-12 md:py-16">
        <div className="w-full max-w-lg rounded-[28px] border border-[#ebe7f7]/90 bg-white/95 p-6 shadow-[0_28px_90px_-48px_rgba(124,58,237,0.35)] backdrop-blur-sm md:p-8">
          <BookingPublicForm slug={slug} context={ctx} guestModes={guestModes} depositFlash={depositFlash} breaks={publicBreaks} />
        </div>
      </div>
    </div>
  );
}
