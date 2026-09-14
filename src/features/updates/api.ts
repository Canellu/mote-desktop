import { invoke } from "@tauri-apps/api/core";

export interface StoreUpdateStatus {
  /** False outside a Microsoft Store install, such as a development build. */
  supported: boolean;
  available: boolean;
  /** Set per submission in Partner Center. */
  mandatory: boolean;
}

export type StoreUpdateOutcome =
  | "installed"
  | "up_to_date"
  | "canceled"
  | "failed";

export const checkStoreUpdate = () =>
  invoke<StoreUpdateStatus>("check-store-update");

export const installStoreUpdate = () =>
  invoke<StoreUpdateOutcome>("install-store-update");

/** Emitted by `install-store-update` once the download starts. */
export const STORE_UPDATE_PROGRESS_EVENT = "store-update-progress";

export interface StoreUpdateProgress {
  phase: "downloading" | "installing";
  /** Whole percent across both phases; the Store puts installing at 80 to 100. */
  percent: number;
}
