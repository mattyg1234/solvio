"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";

type PasswordInputProps = {
  id: string;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
  className?: string;
  value?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

export function PasswordInput({
  id,
  name = "password",
  autoComplete = "current-password",
  required,
  minLength,
  placeholder = "••••••••",
  className,
  value,
  onChange,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={cn(
          "w-full rounded-2xl border border-[#ebe7f7] bg-white py-3 pl-4 pr-12 text-[15px] text-[#0f172a] shadow-inner shadow-black/[0.03] outline-none ring-[#a78bfa]/35 transition-[box-shadow,border-color] placeholder:text-[#94a3b8] focus:border-[#c4b5fd] focus:ring-4",
          className,
        )}
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#475569]"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}
