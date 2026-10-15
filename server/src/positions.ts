/** Below this gap between neighbours, a list is renumbered instead of halving the gap again. */
const MIN_POSITION_GAP = 1e-6;

export interface Positioned {
  id: number;
  position: number;
}

/**
 * Where an item goes when placed at `index` among `siblings` (sorted by position, without the item itself;
 * clamped to the end). Usually only the item gets a new position, halfway between its neighbours. When they
 * are too close, `renumbered` lists new positions 1, 2, 3 … for the siblings, leaving a slot for the item.
 */
export function positionForIndex(
  siblings: readonly Positioned[],
  index: number,
): { position: number; renumbered: Positioned[] } {
  const at = Math.min(Math.max(index, 0), siblings.length);
  const prev = siblings[at - 1];
  const next = siblings[at];

  if (prev && next && next.position - prev.position < MIN_POSITION_GAP) {
    return {
      position: at + 1,
      renumbered: siblings.map((sibling, i) => ({ id: sibling.id, position: i < at ? i + 1 : i + 2 })),
    };
  }

  let position: number;
  if (prev && next) position = (prev.position + next.position) / 2;
  else if (prev) position = prev.position + 1;
  else if (next) position = next.position - 1;
  else position = 1;
  return { position, renumbered: [] };
}
