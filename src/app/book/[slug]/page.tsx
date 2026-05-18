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
    <div className="relative min-h-screen overflow-hidden bg-[#f8fafc]">
      <div className="pointer-events-none absolute -left-32 top-0 h-72 w-72 rounded-full bg-[#ede9fe]/90 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 bottom-20 h-80 w-80 rounded-full bg-[#dbeafe]/70 blur-3xl" aria-hidden />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16">
        <BookingPublicForm slug={slug} context={ctx} guestModes={guestModes} />
      </div>
    </div>
  );
}
