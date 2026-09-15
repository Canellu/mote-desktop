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
  | "failed";

export const checkStoreUpdate = () =>
  invoke<StoreUpdateStatus>("check-store-update");

/** Downloads the update only. Mote stays open. */
export const downloadStoreUpdate = () =>
  invoke<StoreUpdateOutcome>("download-store-update");

/** Installs the downloaded update, which closes Mote and reopens it. */
export const installStoreUpdate = () =>
  invoke<StoreUpdateOutcome>("install-store-update");

/** Emitted by `download-store-update` while the package downloads. */
export const STORE_UPDATE_PROGRESS_EVENT = "store-update-progress";

export interface StoreUpdateProgress {
  /** Whole percent of the download. */
  percent: number;
}
