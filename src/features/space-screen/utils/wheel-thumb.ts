import type { CSSProperties } from "react";

// Thumbs scale with the wheel: a tenth of its diameter, kept between 28px and
// 44px. The wheel is its own size container, so `cqw` is the wheel's width.
const THUMB_FRACTION = 0.1;
const THUMB_MIN_PX = 28;
const THUMB_MAX_PX = 44;

export const wheelThumbStyle = {
  "--thumb": `clamp(${THUMB_MIN_PX}px, ${THUMB_FRACTION * 100}cqw, ${THUMB_MAX_PX}px)`,
} as CSSProperties;

export const wheelThumbClasses = {
  base: "size-(--thumb)",
  lifted: "size-[calc(var(--thumb)*1.43)]",
  hover: "hover:size-[calc(var(--thumb)*1.2)]",
  icon: "size-[calc(var(--thumb)*0.57)]",
  liftTranslate: "-50% calc(-50% - var(--thumb))",
};

// Half the rendered thumb diameter. A press within this many pixels of a thumb
// centre drags it from where it is; farther away grabs the nearest and snaps.
export const wheelThumbHitRadius = (wheelWidth: number) =>
  Math.min(THUMB_MAX_PX, Math.max(THUMB_MIN_PX, wheelWidth * THUMB_FRACTION)) /
  2;
