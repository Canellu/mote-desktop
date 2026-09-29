import { getCurrentWebview } from "@tauri-apps/api/webview";
import { create } from "zustand";

/** Zoom steps offered in Settings and walked by Ctrl +/−. */
export const UI_SCALE_STEPS = [0.8, 0.9, 1, 1.1, 1.25] as const;
export const DEFAULT_UI_SCALE = 1;

const STORAGE_KEY = "uiScale";

const readStoredScale = (): number => {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return UI_SCALE_STEPS.includes(stored as (typeof UI_SCALE_STEPS)[number])
      ? stored
      : DEFAULT_UI_SCALE;
  } catch {
    return DEFAULT_UI_SCALE;
  }
};

interface UiScaleState {
  scale: number;
  setScale: (scale: number) => void;
  /** Moves one step up (1) or down (-1), stopping at either end. */
  stepScale: (direction: 1 | -1) => void;
}

export const useUiScaleStore = create<UiScaleState>((set, get) => ({
  scale: readStoredScale(),
  setScale: (scale) => set({ scale }),
  stepScale: (direction) => {
    const index = UI_SCALE_STEPS.findIndex((step) => step === get().scale);
    const next =
      UI_SCALE_STEPS[
        Math.min(Math.max(index + direction, 0), UI_SCALE_STEPS.length - 1)
      ];
    set({ scale: next });
  },
}));

const applyScale = (scale: number) => {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void getCurrentWebview()
    .setZoom(scale)
    .catch((error: unknown) => console.warn("Unable to set UI scale", error));
};

const onKeyDown = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const { stepScale, setScale } = useUiScaleStore.getState();
  // "=" is the unshifted plus key on US layouts; "+" covers others and numpad.
  if (event.key === "=" || event.key === "+") stepScale(1);
  else if (event.key === "-") stepScale(-1);
  else if (event.key === "0") setScale(DEFAULT_UI_SCALE);
  else return;
  event.preventDefault();
};

/**
 * Applies the saved UI scale to the main window's webview, keeps it applied and
 * persisted as it changes, and wires Ctrl +/−/0. Main window only: widgets size
 * themselves through their own size mode.
 */
export const initializeUiScale = () => {
  applyScale(useUiScaleStore.getState().scale);
  useUiScaleStore.subscribe((state, previous) => {
    if (state.scale === previous.scale) return;
    applyScale(state.scale);
    try {
      localStorage.setItem(STORAGE_KEY, String(state.scale));
    } catch {
      // Not persisting only costs the choice on next launch.
    }
  });
  window.addEventListener("keydown", onKeyDown);
};
