import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { releaseNotesFor, type ReleaseNotes } from "./releaseNotes";

interface LaunchVersions {
  previous: string | null;
  current: string;
}

interface WhatsNewStore {
  notes: ReleaseNotes | null;
  open: boolean;
  /** This launch's notes when it is the first launch after an update. */
  justUpdated: ReleaseNotes | null;
  show: (notes: ReleaseNotes) => void;
  close: () => void;
}

export const useWhatsNewStore = create<WhatsNewStore>((set) => ({
  notes: null,
  open: false,
  justUpdated: null,
  show: (notes) => set({ notes, open: true }),
  close: () => set({ open: false }),
}));

let detected = false;

/**
 * Decides once per page load whether this launch is the first after an
 * update. The backend settles the versions once per launch, so a reload keeps
 * the title-bar entry and a restart drops it. With no recorded version, an
 * app that already has a bridge counts as updated and a fresh install does not.
 */
export const detectUpdate = async (configured: boolean) => {
  if (detected) return;
  detected = true;
  const { previous, current } = await invoke<LaunchVersions>(
    "get-launch-versions",
  );
  const updated = previous === null ? configured : previous !== current;
  if (!updated) return;
  const notes = releaseNotesFor(current);
  // Opens once on its own; the title-bar entry reopens it for the rest of the launch.
  if (notes)
    useWhatsNewStore.setState({ justUpdated: notes, notes, open: true });
};

/** Opens this version's notes, from Settings. Resolves false when there are none. */
export const openWhatsNew = async (): Promise<boolean> => {
  const notes = releaseNotesFor(await getVersion());
  if (!notes) return false;
  useWhatsNewStore.getState().show(notes);
  return true;
};
