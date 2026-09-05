"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPartnerTicketPhoto } from "./actions";

export function PartnerTicketUploadForm({ bookingId, hasPhoto }: { bookingId: string; hasPhoto: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const photo = new FormData(form).get("photo");
    if (photo instanceof File && photo.size > 3 * 1024 * 1024) {
      setResult({ ok: false, message: "Choose a photo up to 3 MB. Reduce its size and try again." });
      return;
    }
    setBusy(true); setResult(null);
    try {
      const next = await uploadPartnerTicketPhoto(new FormData(form));
      setResult(next);
      if (next.ok) { form.reset(); router.refresh(); }
    } catch { setResult({ ok: false, message: "Upload interrupted. Please try again." }); }
    finally { setBusy(false); }
  }}>
    <input type="hidden" name="booking_id" value={bookingId} />
    <label className="block text-sm font-medium">Ticket photo
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required className="mt-2 block w-full rounded-lg border p-3" />
    </label>
    <p className="text-sm text-slate-600">JPEG, PNG, WebP or HEIC/HEIF, up to 3 MB. Photograph the whole ticket clearly. The original can be sent with your organisation’s invoice.</p>
    {result ? <p role={result.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>{result.message}</p> : null}
    <button disabled={busy} className="rounded-xl bg-[var(--show-ops-primary,#7c3aed)] px-4 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? "Uploading…" : hasPhoto ? "Replace ticket photo" : "Attach ticket photo"}</button>
  </form>;
}
