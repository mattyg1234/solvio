"use client";

import { BOOKING_PHONE_DIAL_CODES, type BookingPhoneDialCode } from "@/lib/normalize-phone";
import { cn } from "@/lib/utils";

type PhoneWithCountryCodeProps = {
  dialName?: string;
  localName?: string;
  defaultDial?: BookingPhoneDialCode;
  required?: boolean;
  localPlaceholder?: string;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
};

const inputStyles =
  "h-12 rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25";

export function PhoneWithCountryCode({
  dialName = "phone_country_dial",
  localName = "phone_local",
  defaultDial = "+44",
  required = true,
  localPlaceholder = "7700 900123",
  className,
  selectClassName,
  inputClassName,
}: PhoneWithCountryCodeProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={localName} className="text-sm font-semibold text-[#0f172a]">
        Mobile number{required ? " *" : ""}
      </label>
      <div className="flex gap-2">
        <select
          id={dialName}
          name={dialName}
          required={required}
          defaultValue={defaultDial}
          aria-label="Country code"
          className={cn(inputStyles, "w-[9.5rem] shrink-0 px-3 text-[14px]", selectClassName)}
        >
          {BOOKING_PHONE_DIAL_CODES.map(({ dial, label }) => (
            <option key={dial} value={dial}>
              {label}
            </option>
          ))}
        </select>
        <input
          id={localName}
          name={localName}
          type="tel"
          required={required}
          autoComplete="tel-national"
          inputMode="tel"
          placeholder={localPlaceholder}
          className={cn(inputStyles, "min-w-0 flex-1", inputClassName)}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-[#94a3b8]">
        Include country code — we use this for confirmations and AI calls. Or paste a full number starting with +.
      </p>
    </div>
  );
}
