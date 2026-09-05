export function isGlobalShowOpsAdmin(
  role: string,
  allowedIslands: string[] | null,
): boolean {
  return role === "owner" || (role === "admin" && allowedIslands === null);
}
export function islandAllowed(
  allowedIslands: string[] | null,
  island: string,
): boolean {
  return allowedIslands === null || allowedIslands.includes(island);
}
export function parseMemberIslands(
  form: FormData,
  knownIslands: string[],
): string[] | null {
  const mode = String(form.get("islands_mode") ?? "all");
  if (mode === "all") return null;
  if (mode !== "selected")
    throw new Error("Choose all islands or selected islands.");
  const selected = [...new Set(form.getAll("allowed_island").map(String))];
  if (selected.some((island) => !knownIslands.includes(island)))
    throw new Error("Choose islands configured for this workspace.");
  return selected;
}

export function assertWorkspaceOnlyStaffAccount(
  businessId: string,
  memberships: { business_id: string; role: string }[],
  ownsBusiness: boolean,
): void {
  if (
    ownsBusiness ||
    !memberships.length ||
    memberships.some(
      (member) => member.business_id !== businessId || member.role === "seller",
    )
  ) {
    throw new Error(
      "This account has access beyond this staff workspace. Ask the person to reset their own password.",
    );
  }
}
