import { describe, expect, test } from "bun:test";
import { sampleHomeMap } from "../src/features/home-map/sampleMap";
import { validateHomeMap } from "../src/features/home-map/validation";
import {
  homeSearchMatchesBridge,
  readMapSelection,
  writeMapSelection,
  resolveHomeView,
  validateHomeViewSearch,
} from "../src/features/home-map/homeView";

describe("Home Map view", () => {
  test("development preview satisfies the persisted geometry contract", () => {
    expect(validateHomeMap(sampleHomeMap)).toEqual([]);
  });

  test("changing bridges drops another bridge's view and selection scope", () => {
    const search = {
      view: "map" as const,
      viewBridge: "bridge-a",
      floorId: "ground",
    };
    expect(homeSearchMatchesBridge(search, "bridge-a")).toBe(true);
    expect(homeSearchMatchesBridge(search, "bridge-b")).toBe(false);
    expect(resolveHomeView(search, "bridge-a")).toBe("map");
    expect(resolveHomeView(search, "bridge-b")).toBe("dashboard");
    expect(homeSearchMatchesBridge({ viewBridge: "preview" }, null)).toBe(true);
  });

  test("rejects malformed navigation values and bounds map identifiers", () => {
    const search = validateHomeViewSearch({
      view: "editor",
      floorId: {},
      areaId: "x".repeat(129),
      viewBridge: ["bridge-a"],
    });
    expect(search.view).toBeUndefined();
    expect(search.floorId).toBeUndefined();
    expect(search.areaId).toBeUndefined();
    expect(search.viewBridge).toBeUndefined();
  });

  test("remembers selection per bridge and tolerates damaged preferences", () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    try {
      writeMapSelection("bridge-a", "upstairs", "office");
      expect(readMapSelection("bridge-a")).toEqual({
        floorId: "upstairs",
        areaId: "office",
      });
      expect(readMapSelection("bridge-b")).toEqual({});
      writeMapSelection("bridge-a", "ground", null);
      expect(readMapSelection("bridge-a").areaId).toBeUndefined();
      values.set("mote-map-selection:bridge-a", "{invalid");
      expect(readMapSelection("bridge-a")).toEqual({});
      writeMapSelection(null, "preview", null);
      expect(values.size).toBe(1);
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
