/** True when stored cookies reference a session Supabase no longer has (DB reset, project switch, revoked refresh). */
export function isStaleAuthSessionError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("refresh token not found") ||
    m.includes("invalid refresh token") ||
    m.includes("session not found")
  );
}
