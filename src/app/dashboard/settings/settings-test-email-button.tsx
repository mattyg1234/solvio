"use client";

import { useState, useTransition } from "react";

import { sendSettingsTestEmailAction } from "@/app/dashboard/settings/actions";
import { Button } from "@/components/ui/button";

export function SettingsTestEmailButton({ email }: { email: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#64748b]">
        Send a test to <span className="font-semibold text-[#0f172a]">{email}</span> to confirm Resend and your domain are
        working for guest confirmations and account emails.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="h-10 rounded-full px-5 font-semibold"
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await sendSettingsTestEmailAction();
            setMessage(result.ok ? "Test email sent — check your inbox." : result.message);
          });
        }}
      >
        {pending ? "Sending…" : "Send test email"}
      </Button>
      {message ? (
        <p className={`text-sm ${message.includes("sent") ? "text-emerald-800" : "text-rose-800"}`}>{message}</p>
      ) : null}
    </div>
  );
}
