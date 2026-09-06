import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  createHomeMapRepository,
  decodeHomeMapStorage,
  type HomeMapPersistencePort,
} from "./storage";

export type HomeMapInvoke = <T>(
  command: "read-home-map" | "write-home-map",
  args: { bridgeId: string; value?: string; expected?: string | null },
) => Promise<T>;

/** The native command compares the last-read bytes before replacing a file. */
export function createNativeHomeMapPort(
  call: HomeMapInvoke = invoke,
  available: () => boolean = isTauri,
): HomeMapPersistencePort {
  const baselines = new Map<
    string,
    { raw: string | null; writable: boolean }
  >();
  const readVersions = new Map<string, number>();
  const requireDesktop = () => {
    if (!available())
      throw new Error("Home Map storage requires the desktop app.");
  };
  return {
    async read(bridgeId) {
      requireDesktop();
      const version = (readVersions.get(bridgeId) ?? 0) + 1;
      readVersions.set(bridgeId, version);
      baselines.delete(bridgeId);
      const raw = await call<string | null>("read-home-map", { bridgeId });
      if (raw !== null && typeof raw !== "string")
        throw new Error(
          "The desktop returned an invalid map storage response.",
        );
      const loaded = decodeHomeMapStorage(raw, bridgeId);
      if (readVersions.get(bridgeId) === version) {
        baselines.set(bridgeId, {
          raw,
          writable: loaded.status === "ready" || loaded.status === "missing",
        });
      }
      return raw;
    },
    async write(bridgeId, value) {
      requireDesktop();
      const baseline = baselines.get(bridgeId);
      if (!baseline)
        throw new Error(
          "Reload this map before saving so existing data can be checked.",
        );
      if (!baseline.writable)
        throw new Error("This map needs recovery before it can be replaced.");
      const decoded = decodeHomeMapStorage(value, bridgeId);
      if (decoded.status !== "ready")
        throw new Error("Only a valid map for this bridge can be saved.");
      try {
        await call<void>("write-home-map", {
          bridgeId,
          value,
          expected: baseline.raw,
        });
        baselines.set(bridgeId, { raw: value, writable: true });
      } catch (error) {
        // The response might have failed after a successful disk replacement.
        // Re-read before retrying; never guess which bytes are now durable.
        baselines.delete(bridgeId);
        throw error;
      }
    },
  };
}

/** Share one ordered save queue throughout this webview. Native CAS also
 * protects against other windows writing from stale snapshots. */
export const homeMapRepository = createHomeMapRepository(
  createNativeHomeMapPort(),
);
