import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookingPublicForm } from "./booking-public-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseBookingPublicContext, parseGuestModesFromRpc } from "@/lib/booking-public-context";

type PageProps = {
  params: Promise<{ slug: string }>;
};

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

export default async function PublicBookingPage({ params }: PageProps) {
  const { slug } = await params;
  if (!slug?.trim()) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_booking_public_context", { p_slug: slug });
  const ctx = !error ? parseBookingPublicContext(data) : null;

  if (!ctx) {
    notFound();
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
          <BookingPublicForm slug={slug} context={ctx} guestModes={guestModes} />
        </div>
      </div>
    </div>
  );
}
