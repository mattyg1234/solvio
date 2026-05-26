"use client";

import { BOOKING_PHONE_DIAL_CODES, type BookingPhoneDialCode } from "@/lib/normalize-phone";
import { cn } from "@/lib/utils";

const defaultInputStyles =
  "rounded-xl border border-[#ebe7f7] bg-white text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25";

type PhoneDialCodeFieldProps = {
  dialCode: string;
  localNumber: string;
  onDialCodeChange: (dial: string) => void;
  onLocalNumberChange: (local: string) => void;
  label?: string;
  required?: boolean;
  optional?: boolean;
  defaultDial?: BookingPhoneDialCode;
  compact?: boolean;
  showHint?: boolean;
  localPlaceholder?: string;
  idPrefix?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  /** Uncontrolled form field names — omit when using controlled dial/local state. */
  dialName?: string;
  localName?: string;
};

export function PhoneDialCodeField({
  dialCode,
  localNumber,
  onDialCodeChange,
  onLocalNumberChange,
  label = "Phone number",
  required = false,
  optional = false,
  defaultDial = "+44",
  compact = false,
  showHint = true,
  localPlaceholder = "7700 900123",
  idPrefix = "phone",
  className,
  selectClassName,
  inputClassName,
  dialName,
  localName,
}: PhoneDialCodeFieldProps) {
  const height = compact ? "h-9" : "h-10 sm:h-11";
  const textSize = compact ? "text-[13px]" : "text-[14px] sm:text-[15px]";
  const selectWidth = compact ? "w-[8.5rem]" : "w-[9.5rem]";

  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={`${idPrefix}-local`} className={cn("font-semibold text-[#0f172a]", compact ? "text-[13px]" : "text-sm")}>
        {label}
        {required ? " *" : null}
        {optional ? <span className="font-normal text-[#94a3b8]"> (optional)</span> : null}
      </label>
      <div className="flex gap-2">
        <select
          id={`${idPrefix}-dial`}
          name={dialName}
          required={required}
          value={dialCode || defaultDial}
          onChange={(e) => onDialCodeChange(e.target.value)}
          aria-label="Country code"
          className={cn(
            defaultInputStyles,
            height,
            textSize,
            selectWidth,
            "shrink-0 px-2 sm:px-3",
            selectClassName,
          )}
        >
          {BOOKING_PHONE_DIAL_CODES.map(({ dial, label: dialLabel }) => (
            <option key={dial} value={dial}>
              {dialLabel}
            </option>
          ))}
        </select>
        <input
          id={`${idPrefix}-local`}
          name={localName}
          type="tel"
          required={required}
          value={localNumber}
          onChange={(e) => onLocalNumberChange(e.target.value)}
          autoComplete="tel-national"
          inputMode="tel"
          placeholder={localPlaceholder}
          className={cn(defaultInputStyles, height, textSize, "min-w-0 flex-1 px-3", inputClassName)}
        />
      </div>
      {showHint ? (
        <p className={cn("leading-relaxed text-[#94a3b8]", compact ? "text-[10px]" : "text-[11px]")}>
          Pick country code, then enter the rest — or paste a full number starting with +.
        </p>
      ) : null}
    </div>
  );
}
