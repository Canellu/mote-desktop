import {
  HOME_MAP_SCHEMA_VERSION,
  type HomeMapDocument,
  type MapResult,
} from "./types";
import { validateHomeMap } from "./validation";

export interface HomeMapStorageEnvelope {
  schemaVersion: typeof HOME_MAP_SCHEMA_VERSION;
  bridgeId: string;
  published: HomeMapDocument | null;
  draft: HomeMapDocument | null;
}

export type HomeMapStorageErrorCode =
  | "malformed"
  | "future-version"
  | "unsupported-version"
  | "bridge-mismatch"
  | "map-mismatch"
  | "invalid-document";

type EnvelopeResult =
  | { ok: true; value: HomeMapStorageEnvelope }
  | { ok: false; code: HomeMapStorageErrorCode; error: string };

export type HomeMapLoadResult =
  | { status: "missing" }
  | { status: "ready"; value: HomeMapStorageEnvelope }
  | {
      status: "invalid";
      code: HomeMapStorageErrorCode;
      error: string;
      /** Retain the original bytes for recovery or a future migration. */
      raw: string;
    }
  | { status: "unavailable"; error: string };

function inspectEnvelope(value: unknown, bridgeId: string): EnvelopeResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      code: "malformed",
      error: "Map storage must be an object.",
    };
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== HOME_MAP_SCHEMA_VERSION) {
    const future =
      typeof record.schemaVersion === "number" &&
      record.schemaVersion > HOME_MAP_SCHEMA_VERSION;
    return {
      ok: false,
      code: future ? "future-version" : "unsupported-version",
      error: future
        ? "This map was saved by a newer version of the app."
        : "Map storage has an unsupported schema version.",
    };
  }
  if (!bridgeId.trim() || record.bridgeId !== bridgeId) {
    return {
      ok: false,
      code: "bridge-mismatch",
      error: "Map storage belongs to another bridge.",
    };
  }
  for (const key of ["published", "draft"] as const) {
    if (record[key] === null) continue;
    const issue = validateHomeMap(record[key])[0];
    if (issue) {
      return {
        ok: false,
        code: "invalid-document",
        error: `${key}.${issue.path}: ${issue.message}`,
      };
    }
    if ((record[key] as HomeMapDocument).bridgeId !== bridgeId) {
      return {
        ok: false,
        code: "bridge-mismatch",
        error: `The ${key} map belongs to another bridge.`,
      };
    }
  }
  const published = record.published as HomeMapDocument | null;
  const draft = record.draft as HomeMapDocument | null;
  if (published && draft && published.id !== draft.id) {
    return {
      ok: false,
      code: "map-mismatch",
      error: "The draft and published map IDs differ.",
    };
  }
  return {
    ok: true,
    value: structuredClone({
      schemaVersion: HOME_MAP_SCHEMA_VERSION,
      bridgeId,
      published,
      draft,
    }),
  };
}

export function decodeHomeMapStorage(
  raw: string | null,
  bridgeId: string,
): HomeMapLoadResult {
  if (raw === null) return { status: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      status: "invalid",
      code: "malformed",
      error: "Map storage is not valid JSON.",
      raw,
    };
  }
  const result = inspectEnvelope(parsed, bridgeId);
  return result.ok
    ? { status: "ready", value: result.value }
    : { status: "invalid", code: result.code, error: result.error, raw };
}

export function encodeHomeMapStorage(
  value: HomeMapStorageEnvelope,
  bridgeId: string,
): MapResult<string> {
  const result = inspectEnvelope(value, bridgeId);
  return result.ok
    ? { ok: true, value: JSON.stringify(result.value) }
    : { ok: false, error: result.error };
}

/**
 * Inject a durable desktop storage adapter at the application boundary.
 * No localStorage fallback: an unavailable store must remain distinguishable
 * from a missing map. The adapter owns atomic replacement of each string.
 */
export interface HomeMapPersistencePort {
  read(bridgeId: string): Promise<string | null>;
  write(bridgeId: string, value: string): Promise<void>;
}

export function createHomeMapRepository(port: HomeMapPersistencePort) {
  const pending = new Map<string, Promise<void>>();
  return {
    async load(bridgeId: string): Promise<HomeMapLoadResult> {
      // Reads observe all saves already submitted on this repository instance.
      await pending.get(bridgeId);
      try {
        return decodeHomeMapStorage(await port.read(bridgeId), bridgeId);
      } catch (error) {
        return {
          status: "unavailable",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    save(bridgeId: string, value: HomeMapStorageEnvelope): Promise<void> {
      // Capture and validate now so caller mutations cannot alter queued writes.
      const encoded = encodeHomeMapStorage(value, bridgeId);
      if (!encoded.ok) return Promise.reject(new Error(encoded.error));
      const operation = (pending.get(bridgeId) ?? Promise.resolve()).then(() =>
        port.write(bridgeId, encoded.value),
      );
      // A failed write rejects its caller but does not poison subsequent saves.
      const settled = operation.then(
        () => undefined,
        () => undefined,
      );
      pending.set(bridgeId, settled);
      void settled.then(() => {
        if (pending.get(bridgeId) === settled) pending.delete(bridgeId);
      });
      return operation;
    },
  };
}
