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
