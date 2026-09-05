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
/**
 * The same three flags as coloured dots for the laptop tables, so a night list
 * fits one screen wide with no sideways scrolling. Hover a dot for the text.
 * On paper the dots give way to the full text, because the kitchen and the
 * door read the printed sheet, not a tooltip.
 */
export function FlagDots({
  dietaryRequired,
  dietaryNotes,
  balanceDueLabel,
  comments,
}: {
  dietaryRequired?: boolean | null;
  dietaryNotes?: string | null;
  balanceDueLabel?: string | null;
  comments?: string | null;
}) {
  const diet = dietaryRequired ? (dietaryNotes?.trim() || "Special meal") : null;
  const note = comments?.trim() || null;
  const flags: Array<{ key: string; text: string; dot: string; chip: string; label: string }> = [];
  if (diet) flags.push({ key: "diet", text: diet, dot: "bg-amber-400 ring-amber-600", chip: "bg-amber-100 text-amber-950 ring-amber-300", label: "Diet" });
  if (balanceDueLabel) flags.push({ key: "owed", text: `${balanceDueLabel} due`, dot: "bg-rose-500 ring-rose-700", chip: "bg-rose-100 text-rose-900 ring-rose-300", label: "Owed" });
  if (note) flags.push({ key: "note", text: note, dot: "bg-violet-500 ring-violet-700", chip: "bg-violet-100 text-violet-950 ring-violet-300", label: "Comment" });
  if (!flags.length) return <span className="text-slate-300">—</span>;
  const print = "[print-color-adjust:exact] [-webkit-print-color-adjust:exact]";
  return (
    <>
      <span className="inline-flex items-center gap-1.5 print:hidden">
        {flags.map((f) => (
          <span
            key={f.key}
            role="img"
            aria-label={`${f.label}: ${f.text}`}
            title={`${f.label}: ${f.text}`}
            className={`inline-block h-3 w-3 cursor-help rounded-full ring-1 ${f.dot}`}
          />
        ))}
      </span>
      <span className="hidden print:flex print:flex-col print:gap-0.5">
        {flags.map((f) => (
          <span key={f.key} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 whitespace-pre-wrap ${f.chip} ${print}`}>
            {f.text}
          </span>
        ))}
      </span>
    </>
  );
}

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
  // Force the tint through on paper too — a printed list should read the same as the phone.
  const base = `${compact ? "rounded-md px-2 py-0.5 text-[11px]" : "rounded-lg px-2.5 py-1 text-xs"} font-semibold [print-color-adjust:exact] [-webkit-print-color-adjust:exact]`;
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
