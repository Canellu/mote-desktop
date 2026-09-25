import { getVersion } from "@tauri-apps/api/app";
import { create } from "zustand";
import { releaseNotesFor, type ReleaseNotes } from "./releaseNotes";

/** The last version whose notes were shown, or skipped on a fresh install. */
const LAST_SEEN_KEY = "whats-new-last-seen-version";

export const readLastSeen = (): string | null => {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
};

export const markSeen = (version: string) => {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // Unwritable storage repeats the notes on the next launch, which is harmless.
  }
};

interface WhatsNewStore {
  notes: ReleaseNotes | null;
  open: boolean;
  show: (notes: ReleaseNotes) => void;
  close: () => void;
}

export const useWhatsNewStore = create<WhatsNewStore>((set, get) => ({
  notes: null,
  open: false,
  show: (notes) => set({ notes, open: true }),
  close: () => {
    const notes = get().notes;
    if (notes) markSeen(notes.version);
    set({ open: false });
  },
}));

/** Opens this version's notes, from Settings. Resolves false when there are none. */
export const openWhatsNew = async (): Promise<boolean> => {
  const notes = releaseNotesFor(await getVersion());
  if (!notes) return false;
  useWhatsNewStore.getState().show(notes);
  return true;
};
