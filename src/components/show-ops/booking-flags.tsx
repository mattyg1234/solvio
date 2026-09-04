/**
 * The things a door or office person needs to see at a glance, each in its
 * own colour so they can be read across a busy room:
 *
 *   amber   dietary / special meal
 *   rose    money still due at the door
 *   violet  a comment from the office
 *
 * Joel asked for this twice. Used on the Door cards and every night list.
 */
export function BookingFlags({
  dietaryRequired,
  dietaryNotes,
  balanceDueLabel,
  comments,
  compact = false,
}: {
  dietaryRequired?: boolean | null;
  dietaryNotes?: string | null;
  /** Already-formatted money, e.g. "€40.00", or null when nothing is due. */
  balanceDueLabel?: string | null;
  comments?: string | null;
  compact?: boolean;
}) {
  const diet = dietaryRequired ? (dietaryNotes?.trim() || "Special meal") : null;
  const note = comments?.trim() || null;
  if (!diet && !balanceDueLabel && !note) return null;
  const base = compact
    ? "rounded-md px-2 py-0.5 text-[11px] font-semibold"
    : "rounded-lg px-2.5 py-1 text-xs font-semibold";
  return (
    <div className={`mt-2 flex flex-wrap gap-1.5 ${compact ? "" : "print:gap-1"}`}>
      {diet ? (
        <span className={`${base} bg-amber-100 text-amber-950 ring-1 ring-amber-300`}>🥗 {diet}</span>
      ) : null}
      {balanceDueLabel ? (
        <span className={`${base} bg-rose-100 text-rose-900 ring-1 ring-rose-300`}>💶 {balanceDueLabel} due</span>
      ) : null}
      {note ? (
        <span className={`${base} bg-violet-100 text-violet-950 ring-1 ring-violet-300 whitespace-pre-wrap`}>💬 {note}</span>
      ) : null}
    </div>
  );
}
