"use client";

import { useState } from "react";

import { PhoneDialCodeField } from "@/components/ui/phone-dial-code-field";
import { type BookingPhoneDialCode } from "@/lib/normalize-phone";

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
  const [dialCode, setDialCode] = useState<string>(defaultDial);
  const [localNumber, setLocalNumber] = useState("");

  return (
    <PhoneDialCodeField
      label="Mobile number"
      dialCode={dialCode}
      localNumber={localNumber}
      onDialCodeChange={setDialCode}
      onLocalNumberChange={setLocalNumber}
      defaultDial={defaultDial}
      required={required}
      localPlaceholder={localPlaceholder}
      className={className}
      selectClassName={selectClassName}
      inputClassName={inputClassName}
      dialName={dialName}
      localName={localName}
      idPrefix="booking-phone"
      showHint
    />
  );
}
