import { useMemo, useState } from "react";

export interface PickerFolding {
  /** Null while the rooms are as the picker opened them. */
  open: Set<string> | null;
  setOpen: (next: Set<string>) => void;
  setIds: (ids: string[]) => void;
}

/**
 * Folded rooms held outside the picker, so the section's title row can carry
 * a button that folds or unfolds all of them.
 */
export function usePickerFolding() {
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const folding = useMemo<PickerFolding>(
    () => ({ open, setOpen, setIds }),
    [open],
  );
  const allClosed =
    ids.length > 0 && !!open && ids.every((id) => !open.has(id));
  return {
    folding,
    /** One room has nothing to fold away from. */
    foldable: ids.length > 1,
    allClosed,
    toggleAll: () => setOpen(allClosed ? new Set(ids) : new Set<string>()),
  };
}
