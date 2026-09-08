import type { HomeMapDocument, MapResult } from "./types";
import { validateHomeMap } from "./validation";

const DEFAULT_HISTORY_LIMIT = 100;

/** Completed edits only; transient pointer positions belong to the editor. */
export interface HomeMapDraftState {
  readonly bridgeId: string;
  readonly mapId: string | null;
  readonly published: HomeMapDocument | null;
  readonly draft: HomeMapDocument | null;
  readonly past: readonly (HomeMapDocument | null)[];
  readonly future: readonly (HomeMapDocument | null)[];
  readonly historyLimit: number;
}

function freezeSnapshot<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

/** Snapshots own their data and are frozen recursively, including history. */
function snapshot(state: HomeMapDraftState): HomeMapDraftState {
  return freezeSnapshot(structuredClone(state));
}

function documentError(
  document: HomeMapDocument,
  bridgeId: string,
): string | null {
  const issue = validateHomeMap(document)[0];
  if (issue) return `${issue.path}: ${issue.message}`;
  if (document.bridgeId !== bridgeId)
    return "The map belongs to another bridge.";
  return null;
}

export function createHomeMapDraftState(
  bridgeId: string,
  options: {
    published?: HomeMapDocument | null;
    draft?: HomeMapDocument | null;
    historyLimit?: number;
  } = {},
): MapResult<HomeMapDraftState> {
  const published = options.published ?? null;
  const draft = options.draft ?? null;
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  if (!bridgeId.trim()) return { ok: false, error: "A bridge ID is required." };
  if (
    !Number.isInteger(historyLimit) ||
    historyLimit < 1 ||
    historyLimit > 100
  ) {
    return {
      ok: false,
      error: "History limit must be an integer from 1 to 100.",
    };
  }
  for (const document of [published, draft]) {
    if (document) {
      const error = documentError(document, bridgeId);
      if (error) return { ok: false, error };
    }
  }
  if (published && draft && published.id !== draft.id) {
    return { ok: false, error: "The draft belongs to another map." };
  }
  return {
    ok: true,
    value: snapshot({
      bridgeId,
      mapId: published?.id ?? draft?.id ?? null,
      published,
      draft,
      past: [],
      future: [],
      historyLimit,
    }),
  };
}

/**
 * Starts a map from scratch. Creating is not an edit of the map that came
 * before it, so the identity, the history and any half-finished draft go with
 * it; the published map stays until the new one is published over it.
 */
export function replaceHomeMapDraft(
  state: HomeMapDraftState,
  document: HomeMapDocument,
): MapResult<HomeMapDraftState> {
  const error = documentError(document, state.bridgeId);
  if (error) return { ok: false, error };
  return {
    ok: true,
    value: snapshot({
      ...state,
      mapId: document.id,
      published: null,
      draft: document,
      past: [],
      future: [],
    }),
  };
}

export function applyHomeMapDraft(
  state: HomeMapDraftState,
  document: HomeMapDocument,
): MapResult<HomeMapDraftState> {
  const error = documentError(document, state.bridgeId);
  if (error) return { ok: false, error };
  if (state.mapId !== null && document.id !== state.mapId) {
    return { ok: false, error: "An edit cannot change the map ID." };
  }
  const current = state.draft ?? state.published;
  if (JSON.stringify(current) === JSON.stringify(document)) {
    return { ok: true, value: snapshot(state) };
  }
  return {
    ok: true,
    value: snapshot({
      ...state,
      mapId: document.id,
      draft: document,
      // Null records the state before the first draft of a new map.
      past: [...state.past, state.draft].slice(-state.historyLimit),
      future: [],
    }),
  };
}

export function undoHomeMapDraft(state: HomeMapDraftState): HomeMapDraftState {
  if (state.past.length === 0) return snapshot(state);
  return snapshot({
    ...state,
    draft: state.past[state.past.length - 1],
    past: state.past.slice(0, -1),
    future: [...state.future, state.draft].slice(-state.historyLimit),
  });
}

export function redoHomeMapDraft(state: HomeMapDraftState): HomeMapDraftState {
  if (state.future.length === 0) return snapshot(state);
  return snapshot({
    ...state,
    draft: state.future[state.future.length - 1],
    past: [...state.past, state.draft].slice(-state.historyLimit),
    future: state.future.slice(0, -1),
  });
}

/** Discard affects local map edits only and preserves the published map. */
export function discardHomeMapDraft(
  state: HomeMapDraftState,
): HomeMapDraftState {
  return snapshot({ ...state, draft: null, past: [], future: [] });
}

/** Publishing is local state; the caller persists it before exposing success. */
export function publishHomeMapDraft(
  state: HomeMapDraftState,
): MapResult<HomeMapDraftState> {
  if (state.draft === null)
    return { ok: false, error: "There is no draft to publish." };
  const error = documentError(state.draft, state.bridgeId);
  if (error) return { ok: false, error };
  if (state.draft.id !== state.mapId) {
    return { ok: false, error: "The draft belongs to another map." };
  }
  return {
    ok: true,
    value: snapshot({
      ...state,
      published: state.draft,
      draft: null,
      past: [],
      future: [],
    }),
  };
}
