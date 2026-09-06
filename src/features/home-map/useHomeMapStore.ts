import { useStore } from "zustand";
import { homeMapRepository } from "./native";
import { createHomeMapStore, type HomeMapStoreState } from "./store";

export const homeMapStore = createHomeMapStore(homeMapRepository);

export function useHomeMapStore<T>(
  selector: (state: HomeMapStoreState) => T,
): T {
  return useStore(homeMapStore, selector);
}
