import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { requireShowOpsPage } from "@/lib/show-ops/access";

import { BookingSheetImport } from "./booking-sheet-import";

export const dynamic = "force-dynamic";

export default async function ImportBookingSheetPage() {
  await requireShowOpsPage("bookings");
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <Link href="/dashboard/show-ops/bookings" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Bookings
      </Link>
      <div>
        <h1 className="text-xl font-bold text-black">Paper bookings sheet</h1>
        <p className="mt-1 text-sm text-slate-700">
          If the Hub is ever down, take bookings in this Excel sheet (it is also in every Plan B email). When the Hub is
          back, drop the filled-in sheet below. The Hub checks every row first and tells you anything it does not
          understand. Nothing is added until you press Add.
        </p>
        <a
          href="/dashboard/show-ops/bookings/import/sheet"
          download
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-slate-50"
        >
          <Download className="h-4 w-4" /> Download a blank sheet
        </a>
      </div>
      <BookingSheetImport />
    </div>
  );
}
