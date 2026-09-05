/** A filtered list can reorder its stops without discarding hidden stops' positions. */
export function mergeBusNightOrder(
  previous: string[],
  visibleOrder: string[],
): string[] {
  if (new Set(visibleOrder).size !== visibleOrder.length)
    throw new Error("A stop appears more than once.");
  const chosen = new Set(visibleOrder);
  let index = 0;
  const merged = previous.map((id) =>
    chosen.has(id) ? visibleOrder[index++] : id,
  );
  for (const id of visibleOrder) if (!merged.includes(id)) merged.push(id);
  return [...new Set(merged)];
}
