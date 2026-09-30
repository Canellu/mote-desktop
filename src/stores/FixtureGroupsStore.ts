import { create } from "zustand";
import type { FixtureGroup } from "@/lib/fixtures";

/**
 * Fixtures the person grouped by hand, per bridge, so the map and the Devices
 * list always show the same products. Lights in no group stand as the devices
 * the bridge reports.
 */
const STORAGE_KEY = "hue-fixtures";

type GroupsByBridge = Record<string, FixtureGroup[]>;

const isGroupList = (value: unknown): value is FixtureGroup[] =>
  Array.isArray(value) &&
  value.every(
    (group) =>
      typeof group?.id === "string" &&
      (group.name === undefined || typeof group.name === "string") &&
      Array.isArray(group.lightIds) &&
      group.lightIds.every((id: unknown) => typeof id === "string"),
  );

const readStored = (): GroupsByBridge => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, groups]) => isGroupList(groups)),
    ) as GroupsByBridge;
  } catch {
    return {};
  }
};

const writeStored = (value: GroupsByBridge) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Non-fatal: the grouping holds for this session.
  }
};

const EMPTY: FixtureGroup[] = [];

interface FixtureGroupsState {
  groupsByBridge: GroupsByBridge;
  setGroups: (bridgeId: string, groups: FixtureGroup[]) => void;
}

export const useFixtureGroupsStore = create<FixtureGroupsState>((set, get) => ({
  groupsByBridge: readStored(),
  setGroups: (bridgeId, groups) => {
    const next = {
      ...get().groupsByBridge,
      [bridgeId.toUpperCase()]: groups,
    };
    writeStored(next);
    set({ groupsByBridge: next });
  },
}));

/** The groups for one bridge; a stable empty list when there are none. */
export const useFixtureGroups = (bridgeId: string | null | undefined) =>
  useFixtureGroupsStore((state) =>
    bridgeId ? (state.groupsByBridge[bridgeId.toUpperCase()] ?? EMPTY) : EMPTY,
  );
