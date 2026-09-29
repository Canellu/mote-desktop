/**
 * Flat surface for nested list items (device rows, collapsible groups). Drops
 * the default card elevation (shadow + ring) for a hairline border so these
 * read as quiet sub-items sitting on the content card.
 */
export const FLAT_CARD =
  "border border-border/60 shadow-none ring-0 dark:shadow-none";

/**
 * Visual contract used by the elevated, expandable cards in Settings. They sit
 * straight on the page's card surface, so the raised fill is what sets them
 * apart; the shadow only adds lift.
 */
export const SETTINGS_EXPANDABLE_CARD =
  "border-0 bg-(--settings-raised) shadow-sm ring-0 dark:shadow-sm dark:shadow-black/25";

export const SETTINGS_EXPANDABLE_TRIGGER =
  "transition-colors hover:bg-(--settings-control-hover)";

export const SETTINGS_EXPANDABLE_TRIGGER_OPEN = "bg-(--settings-control-open)";

/**
 * A label beside its control that wraps the control onto its own line once the
 * row is too narrow for both, instead of squeezing or clipping either.
 */
export const SETTINGS_WRAP_ROW =
  "flex flex-wrap items-center justify-between gap-x-6 gap-y-3";

/** The label side of {@link SETTINGS_WRAP_ROW}. */
export const SETTINGS_WRAP_ROW_TEXT = "min-w-0 flex-1 basis-56";

/**
 * Curated Hue v2 room/zone archetypes offered in the create wizard. The bridge
 * accepts these snake_case values; each maps to an icon via `getRoomZoneIcon`.
 * `other` leads so the wizard has a sensible neutral default.
 */
export const SPACE_ARCHETYPES: Array<{ value: string; label: string }> = [
  { value: "other", label: "Other" },
  { value: "living_room", label: "Living room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "dining", label: "Dining" },
  { value: "bathroom", label: "Bathroom" },
  { value: "office", label: "Office" },
  { value: "kids_bedroom", label: "Kids bedroom" },
  { value: "nursery", label: "Nursery" },
  { value: "hallway", label: "Hallway" },
  { value: "garage", label: "Garage" },
  { value: "garden", label: "Garden" },
  { value: "gym", label: "Gym" },
  { value: "recreation", label: "Recreation" },
];
