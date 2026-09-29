import { create } from "zustand";

export type UiDensity = "roomy" | "comfortable" | "compact";

const STORAGE_KEY = "uiDensity";

const readStoredDensity = (): UiDensity => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "roomy" || stored === "compact" ? stored : "comfortable";
  } catch {
    return "comfortable";
  }
};

interface UiDensityState {
  density: UiDensity;
  setDensity: (density: UiDensity) => void;
}

export const useUiDensityStore = create<UiDensityState>((set) => ({
  density: readStoredDensity(),
  setDensity: (density) => set({ density }),
}));

// The spacing itself lives in App.css; comfortable is the attribute-free default.
const applyDensity = (density: UiDensity) => {
  if (density === "comfortable") {
    delete document.documentElement.dataset.density;
  } else {
    document.documentElement.dataset.density = density;
  }
};

/**
 * Applies the saved density before first paint and keeps it applied and
 * persisted as it changes. Main window only: widgets size themselves through
 * their own size mode.
 */
export const initializeUiDensity = () => {
  applyDensity(useUiDensityStore.getState().density);
  useUiDensityStore.subscribe((state, previous) => {
    if (state.density === previous.density) return;
    applyDensity(state.density);
    try {
      localStorage.setItem(STORAGE_KEY, state.density);
    } catch {
      // Not persisting only costs the choice on next launch.
    }
  });
};
