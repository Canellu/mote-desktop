/** Per-space item sections whose order the user can change. */
export type EditCategory = "scenes" | "lights" | "switches" | "sensors";

/** Sentinel id the scene gallery tile takes in a space's saved scene order. */
export const SCENE_GALLERY_TILE_ID = "scene-gallery";

export const itemOrderKey = (roomId: string, section: EditCategory) =>
  `hue-space-item-order:${roomId}:${section}`;

export const readItemOrder = (key: string): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored)
      ? stored.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
};

/**
 * Sorts `items` by the saved id order. Ids missing from `order` (newly added
 * since the last reorder) keep their original relative position at the end, so
 * a saved order never hides a new light/scene. A stable sort preserves that.
 */
export function applyItemOrder<T extends { id: string }>(
  items: T[],
  order: string[],
): T[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((id, index) => [id, index] as const));
  return items
    .map((item, index) => ({
      item,
      index,
      rank: rank.get(item.id) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
