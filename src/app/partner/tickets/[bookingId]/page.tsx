import type { PartnerTicketBooking } from "@/lib/show-ops/partner-ticket-photo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireShowOpsSellerContext } from "@/lib/show-ops/access";
import { PartnerTicketUploadForm } from "./upload-form";

export default async function PartnerTicketPage({ params, searchParams }: { params: Promise<{ bookingId: string }>; searchParams: Promise<{ created?: string }> }) {
  const ctx = await requireShowOpsSellerContext();
  const { bookingId } = await params;
  const { created } = await searchParams;
  const { data: booking } = await ctx.supabase.rpc("show_ops_seller_ticket_booking", { p_booking: bookingId }).returns<PartnerTicketBooking[]>().maybeSingle();
  if (!booking) notFound();
  const photoPath = booking.no_show_proof_path;
  let photoUrl: string | undefined;
  if (photoPath?.startsWith(`${ctx.business.id}/${booking.id}/`)) {
    const { data } = await ctx.supabase.storage.from("show-ops-proofs").createSignedUrl(photoPath, 300);
    photoUrl = data?.signedUrl;
  }
  return <div className="mx-auto max-w-xl space-y-5">
    <Link href="/partner" className="text-sm text-violet-700 hover:underline">← Your bookings</Link>
    {created === "1" ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">Booking saved. You can add the ticket photo now or return to it later.</p> : null}
    <div><h1 className="text-2xl font-bold">Ticket photo</h1><p className="mt-1 text-slate-600">{booking.booking_ref} · {booking.guest_name}</p></div>
    <section className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      {photoPath ? <p className="text-sm text-emerald-800">A ticket photo is attached. {photoUrl ? <a href={photoUrl} target="_blank" rel="noreferrer" className="underline">View original photo</a> : null}</p> : null}
      {booking.cancelled_at ? <p>This booking is cancelled.</p> : <PartnerTicketUploadForm bookingId={booking.id} hasPhoto={!!photoPath} />}
    </section>
  </div>;
}
