"use client";

import { useFormStatus } from "react-dom";

export function SubmitOnce({
  children,
  className,
  name,
  value,
  formAction,
}: {
  children: string;
  className?: string;
  name?: string;
  value?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} formAction={formAction} disabled={pending} className={className}>
      {pending ? "Working…" : children}
    </button>
  );
}
