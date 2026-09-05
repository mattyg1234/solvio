type Membership = { business_id: string; supplier_id: string | null; role: string };
export type PartnerInviteDependencies = {
  deliveryAllowed: () => boolean;
  assertAuthorized: () => Promise<void>;
  findUser: (email: string) => Promise<string | null>;
  memberships: (userId: string) => Promise<Membership[]>;
  generateLink: (email: string) => Promise<{ userId: string; tokenHash: string; verificationType: "signup" | "email" | "magiclink" }>;
  addMember: (userId: string) => Promise<void>;
  send: (url: string) => Promise<{ ok: boolean; message?: string }>;
};

export function assertPartnerAdmin(partnerAdmin: boolean): void {
  if (!partnerAdmin) throw new Error("Only your organisation administrator can manage sellers.");
}

export function assertRemovableSeller(
  ctx: { businessId: string; supplierId: string; userId: string },
  row: (Membership & { user_id: string; partner_admin: boolean }) | null,
): void {
  if (!row || row.role !== "seller" || row.business_id !== ctx.businessId || row.supplier_id !== ctx.supplierId) {
    throw new Error("You can only remove sellers from your own organisation.");
  }
  if (row.user_id === ctx.userId) throw new Error("You cannot remove your own login.");
  if (row.partner_admin) throw new Error("Only Solvio staff can remove an organisation administrator.");
}

/** Fresh one-time links make failed delivery recoverable without changing global credentials. */
export async function invitePartnerSeller(
  input: { businessId: string; supplierId: string; email: string; siteUrl: string },
  deps: PartnerInviteDependencies,
): Promise<{ userId: string }> {
  if (!deps.deliveryAllowed()) throw new Error("Invitation not sent: Show Ops is in test mode for this recipient. Retry when email delivery is enabled.");
  const checkMemberships = async (userId: string) => {
    const rows = await deps.memberships(userId);
    if (rows.some((m) => m.role !== "seller" || m.business_id !== input.businessId || m.supplier_id !== input.supplierId)) {
      throw new Error("That email already belongs to another organisation or staff account.");
    }
    return rows.length > 0;
  };
  const existingId = await deps.findUser(input.email);
  if (existingId) await checkMemberships(existingId);
  await deps.assertAuthorized();
  const link = await deps.generateLink(input.email);
  if (existingId && existingId !== link.userId) throw new Error("Invitation identity changed. Please retry.");
  // Recheck the authoritative identity returned by Auth, including concurrent account creation.
  const hasMembership = await checkMemberships(link.userId);
  if (!hasMembership) await deps.addMember(link.userId);
  const url = new URL("/auth/confirm", input.siteUrl);
  url.searchParams.set("token_hash", link.tokenHash);
  url.searchParams.set("type", link.verificationType);
  url.searchParams.set("next", "/partner/password");
  await deps.assertAuthorized();
  const sent = await deps.send(url.toString());
  if (!sent.ok) throw new Error(`Invitation not sent: ${sent.message || "Email delivery failed."} You can retry this invitation.`);
  return { userId: link.userId };
}
