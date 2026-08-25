/**
 * Whether an E.164 number can receive WhatsApp (mobile, not geographic landline).
 * Spain: 6xx / 7[1-9]xx; UK: 07… after +44.
 */
export function isLikelyWhatsAppE164(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return false;

  if (digits.startsWith("34") && digits.length >= 11) {
    const national = digits.slice(2);
    return /^(6\d{8}|7[1-9]\d{7})$/.test(national);
  }

  if (digits.startsWith("44") && digits.length >= 12) {
    const national = digits.slice(2);
    return /^7\d{9}$/.test(national);
  }

  if (digits.startsWith("1") && digits.length === 11) {
    return true;
  }

  return false;
}

export function toTwilioWhatsAppAddress(e164: string): string {
  const trimmed = e164.trim();
  const bare = trimmed.startsWith("whatsapp:") ? trimmed.slice("whatsapp:".length) : trimmed;
  const withPlus = bare.startsWith("+") ? bare : `+${bare.replace(/\D/g, "")}`;
  return `whatsapp:${withPlus}`;
}
