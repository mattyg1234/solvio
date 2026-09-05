export async function deliverBusList(
  input: { date: string; bookingIds: string[]; recipient: string },
  deps: {
    allowed: (email: string) => boolean;
    build: () => Promise<Uint8Array>;
    send: (attachment: {
      filename: string;
      content: string;
    }) => Promise<{ ok: boolean; message?: string }>;
  },
): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient))
    throw new Error("Enter a valid recipient email.");
  if (!deps.allowed(input.recipient))
    throw new Error(
      "Bus list not sent: email is in test mode for this recipient.",
    );
  const bytes = await deps.build();
  const result = await deps.send({
    filename: `bus-list-${input.date}.pdf`,
    content: Buffer.from(bytes).toString("base64"),
  });
  if (!result.ok)
    throw new Error(
      `Bus list not sent: ${result.message || "Email delivery failed. Please retry."}`,
    );
}
