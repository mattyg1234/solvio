import { Mail } from "lucide-react";
import Link from "next/link";

import type { EmailFormDraft } from "@/lib/show-ops/email-bookings/draft";

/** Above the new-booking form when it was opened from an email: where it came from and what to check. */
export function EmailDraftBanner({ source }: { source: EmailFormDraft }) {
  const { email, draft } = source;
  const done = email.status === "added" && email.booking_id;
  return (
    <div className="rounded-2xl bg-violet-50/70 p-4 text-sm ring-1 ring-violet-200">
      <p className="flex items-center gap-2 font-semibold text-violet-950">
        <Mail className="h-4 w-4" aria-hidden /> From {email.seller_name ?? email.from_name}: {email.subject}
      </p>
      <p className="mt-1 text-violet-900/80">
        Filled in from the email{draft.island ? ` for ${draft.island}` : ""}
        {draft.product ? ` · ${draft.product.name}` : ""}
        {draft.supplier ? ` · partner ${draft.supplier.name}` : ""}
        {draft.hotel ? ` · ${draft.hotel.name}` : ""}. Check it as you would a phoned-in booking, then save. The reference{" "}
        {draft.channelRef ? <strong>{draft.channelRef}</strong> : "(none)"} is saved on the booking so the same email can&rsquo;t be added twice.
      </p>
      {done ? <p className="mt-2 font-semibold text-rose-700">This email has already been added as a booking.</p> : null}
      {draft.checks.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-violet-950">
          {draft.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      <Link href={`/dashboard/show-ops/email-bookings?id=${email.id}`} className="mt-2 inline-block text-xs font-semibold text-violet-700 hover:underline">
        Back to the email
      </Link>
    </div>
  );
}
