import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "./types";

/**
 * The last app settings the backend reported. Settings mounts fresh every time
 * it opens, so without this it started from nothing and filled the gap with
 * defaults, which is why the close behavior showed "Close app" for a moment and
 * then jumped to the saved choice. The copy here outlives the screen, so it
 * opens straight onto the real values.
 */
let cached: AppSettings | null = null;

export const getCachedAppSettings = () => cached;

/** Records settings the backend just returned and passes them through. */
export const rememberAppSettings = (settings: AppSettings) => {
  cached = settings;
  return settings;
};

export const fetchAppSettings = async () =>
  rememberAppSettings(await invoke<AppSettings>("get-app-settings"));

/**
 * Fills the cache before the Settings route renders. It never throws: if the
 * fetch fails, the screen loads the settings itself and shows the error.
 */
export const preloadAppSettings = () =>
  fetchAppSettings().then(
    () => undefined,
    () => undefined,
  );
