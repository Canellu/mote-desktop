import { createContext, useContext, useMemo, type RefObject } from "react";

/** Timing shared by the inspector pane and the content it pushes aside. */
export const INSPECTOR_TRANSITION = {
  duration: 0.3,
  ease: [0.4, 0, 0.2, 1] as const,
};

/**
 * An inspector pane move in progress. `delta` is how much wider (+) or narrower
 * (−) the content column ends up than it was when the move started; `id` tells
 * back-to-back moves apart. `null` while the pane is at rest.
 */
export interface InspectorSettle {
  id: number;
  delta: number;
}

export const InspectorSettleContext = createContext<InspectorSettle | null>(
  null,
);

/** The pane move in progress, if any. Re-renders the caller as one starts. */
export const useInspectorSettle = () => useContext(InspectorSettleContext);

/**
 * The width `ref`'s element settles at once the inspector pane stops moving, or
 * `null` while the pane is at rest.
 *
 * The pane pushes the content column continuously, so anything that picks its
 * column count from its width (auto-fill grids, the scene rail) would re-column
 * partway through the move and jump. Laying those out at the settled width for
 * the whole move re-columns them once, up front, where their layout animation
 * glides them into place alongside the pane.
 *
 * Measured on the render that starts the move, before the pane has shifted
 * anything, so `ref` must be an element that tracks the column's width — not
 * the one being pinned to the result.
 */
export function useInspectorSettleWidth(
  ref: RefObject<HTMLElement | null>,
): number | null {
  const settle = useInspectorSettle();
  return useMemo(() => {
    const element = ref.current;
    return settle && element ? element.offsetWidth + settle.delta : null;
  }, [settle, ref]);
}
