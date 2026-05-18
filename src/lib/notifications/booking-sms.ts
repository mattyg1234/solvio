/** Lightweight Twilio helper — no SDK dependency beyond fetch. */

export async function sendBookingSms(opts: {
  phoneE164: string;
  body: string;
}): Promise<boolean> {
  const sid = process.env.SOLVIO_TWILIO_ACCOUNT_SID?.trim() || process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.SOLVIO_TWILIO_AUTH_TOKEN?.trim() || process.env.TWILIO_AUTH_TOKEN?.trim();
  const from =
    process.env.SOLVIO_TWILIO_FROM_NUMBER?.trim() ||
    process.env.TWILIO_FROM_NUMBER?.trim() ||
    process.env.TWILIO_PHONE_NUMBER?.trim();

  if (!sid || !token || !from) return false;
  const to = opts.phoneE164.trim().replace(/\s+/g, "");
  if (!to.startsWith("+") || opts.body.trim().length < 3) return false;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: to,
      From: from,
      Body: opts.body.slice(0, 1200),
    }),
  });

  return res.ok;
}
