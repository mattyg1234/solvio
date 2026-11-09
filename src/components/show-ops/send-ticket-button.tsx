"use client";

import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";

import { BOOKING_EDIT_FORM_ID, formSnapshot } from "@/lib/show-ops/form-snapshot";

/**
 * "Send ticket to guest" on the booking page. If the booking form above has
 * changes nobody saved yet (a corrected email, say), it saves them first and then
 * sends, so the ticket goes to the new details instead of the page snapping back.
 */
export function SendTicketButton({ className, children }: { className?: string; children: string }) {
  const { pending } = useFormStatus();

  function onClick(e: MouseEvent<HTMLButtonElement>) {
    const edit = document.getElementById(BOOKING_EDIT_FORM_ID) as HTMLFormElement | null;
    const initial = edit?.dataset.initial;
    if (!edit || initial == null) return;
    if (formSnapshot(new FormData(edit)) === initial) return; // nothing unsaved: plain send
    e.preventDefault();
    const own = e.currentTarget.form;
    const updated = own?.querySelector<HTMLInputElement>('input[name="updated"]')?.checked ?? false;
    const sendNow = edit.querySelector<HTMLInputElement>('input[name="send_now"]');
    const sendNowUpdated = edit.querySelector<HTMLInputElement>('input[name="send_now_updated"]');
    if (!sendNow || !sendNowUpdated) return;
    sendNow.value = "1";
    sendNowUpdated.value = updated ? "1" : "";
    edit.requestSubmit();
  }

  return (
    <button type="submit" disabled={pending} onClick={onClick} className={className}>
      {pending ? "Working…" : children}
    </button>
  );
}
