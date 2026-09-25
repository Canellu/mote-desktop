import { invoke } from "@tauri-apps/api/core";

export interface StoreUpdateStatus {
  /** False outside a Microsoft Store install, such as a development build. */
  supported: boolean;
  available: boolean;
  /** Set per submission in Partner Center. */
  mandatory: boolean;
}

export type StoreUpdateOutcome =
  | "downloaded"
  | "installed"
  | "up_to_date"
  | "canceled"
  | "failed"
  /** The Store will not download silently, so only the install step can. */
  | "needs_consent";

export const checkStoreUpdate = () =>
  invoke<StoreUpdateStatus>("check-store-update");

/** Downloads the update silently, never with a dialog. Mote stays open. */
export const downloadStoreUpdate = () =>
  invoke<StoreUpdateOutcome>("download-store-update");

/**
 * Installs the update, downloading whatever is still missing first. Closes Mote
 * and reopens it, and may show Microsoft's dialog.
 */
export const installStoreUpdate = () =>
  invoke<StoreUpdateOutcome>("install-store-update");

/** Emitted by `download-store-update` while the package downloads. */
export const STORE_UPDATE_PROGRESS_EVENT = "store-update-progress";

export interface StoreUpdateProgress {
  /** Whole percent of the download. Never 0: nothing is sent until it moves. */
  percent: number;
}
