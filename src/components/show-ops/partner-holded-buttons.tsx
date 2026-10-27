"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { sendPartnerToHoldedAction, updatePartnerFromHoldedAction } from "@/app/dashboard/show-ops/actions-holded-partners";

/** Send the partner's saved details to Holded, or take Holded's into the Hub. */
export function PartnerHoldedButtons({ supplierId, linked }: { supplierId: string; linked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  function run(direction: "send" | "pull") {
    setNotice(null);
    const fd = new FormData();
    fd.set("supplier_id", supplierId);
    start(async () => {
      try {
        const res = await (direction === "send" ? sendPartnerToHoldedAction(fd) : updatePartnerFromHoldedAction(fd));
        setNotice(res);
        if (res.ok) router.refresh();
      } catch {
        setNotice({ ok: false, message: "Holded didn't answer. Please retry." });
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => run("send")}
          disabled={pending}
          className="rounded-lg bg-[var(--show-ops-primary,#7c3aed)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Working…" : linked ? "Send changes to Holded" : "Send to Holded"}
        </button>
        {linked ? (
          <button
            type="button"
            onClick={() => run("pull")}
            disabled={pending}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 disabled:opacity-60"
          >
            Update from Holded
          </button>
        ) : null}
      </div>
      {notice ? (
        <p className={`text-xs ${notice.ok ? "text-emerald-700" : "text-rose-700"}`} role="status">
          {notice.message}
        </p>
      ) : null}
    </div>
  );
}
