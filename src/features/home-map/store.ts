import { createStore } from "zustand/vanilla";
import {
  applyHomeMapDraft,
  createHomeMapDraftState,
  discardHomeMapDraft,
  replaceHomeMapDraft,
  publishHomeMapDraft,
  redoHomeMapDraft,
  undoHomeMapDraft,
  type HomeMapDraftState,
} from "./drafts";
import type {
  createHomeMapRepository,
  HomeMapLoadResult,
  HomeMapStorageEnvelope,
} from "./storage";
import {
  HOME_MAP_SCHEMA_VERSION,
  type HomeMapDocument,
  type MapResult,
} from "./types";

type ActionResult = MapResult<void>;

export interface HomeMapBridgeEntry {
  readonly status: "loading" | "ready" | "invalid" | "unavailable";
  readonly draftState: HomeMapDraftState | null;
  readonly saving: boolean;
  readonly dirty: boolean;
  readonly error: string | null;
  readonly pendingAction: "publish" | "discard" | "reload" | null;
  readonly loadResult: HomeMapLoadResult | null;
}

export interface HomeMapStoreState {
  activeBridgeId: string | null;
  entries: Readonly<Record<string, HomeMapBridgeEntry>>;
  activateBridge(bridgeId: string | null): Promise<ActionResult>;
  /** Reload never replaces unsaved local changes. */
  retryLoad(bridgeId: string): Promise<ActionResult>;
  applyEdit(bridgeId: string, document: HomeMapDocument): Promise<ActionResult>;
  /** Replaces this bridge's map with a newly created one. */
  createMap(bridgeId: string, document: HomeMapDocument): Promise<ActionResult>;
  undo(bridgeId: string): Promise<ActionResult>;
  redo(bridgeId: string): Promise<ActionResult>;
  publish(bridgeId: string): Promise<ActionResult>;
  discard(bridgeId: string): Promise<ActionResult>;
  retrySave(bridgeId: string): Promise<ActionResult>;
  /** Explicitly abandon local changes only after a successful storage read. */
  discardLocalAndReload(bridgeId: string): Promise<ActionResult>;
}

interface BridgeRuntime {
  load: Promise<ActionResult> | null;
  queue: Promise<void>;
  pendingWrites: number;
  lastKnownSaved: string | null;
  needsBaselineCheck: boolean;
  failedAutosave: string | null;
}

const success = (): ActionResult => ({ ok: true, value: undefined });
const failure = (error: string) => ({ ok: false as const, error });
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function envelope(state: HomeMapDraftState): HomeMapStorageEnvelope {
  return {
    schemaVersion: HOME_MAP_SCHEMA_VERSION,
    bridgeId: state.bridgeId,
    published: state.published,
    draft: state.draft,
  };
}

export function createHomeMapStore(
  repository: ReturnType<typeof createHomeMapRepository>,
) {
  const runtimes = new Map<string, BridgeRuntime>();

  return createStore<HomeMapStoreState>((set, get) => {
    function runtime(bridgeId: string) {
      let value = runtimes.get(bridgeId);
      if (!value) {
        value = {
          load: null,
          queue: Promise.resolve(),
          pendingWrites: 0,
          lastKnownSaved: null,
          needsBaselineCheck: false,
          failedAutosave: null,
        };
        runtimes.set(bridgeId, value);
      }
      return value;
    }

    function update(bridgeId: string, changes: Partial<HomeMapBridgeEntry>) {
      set((state) => ({
        entries: {
          ...state.entries,
          [bridgeId]: { ...state.entries[bridgeId], ...changes },
        },
      }));
    }

    function isDirty(bridgeId: string, state: HomeMapDraftState) {
      const saved = runtime(bridgeId).lastKnownSaved;
      return saved === null
        ? state.draft !== null || state.published !== null
        : JSON.stringify(envelope(state)) !== saved;
    }

    function editable(bridgeId: string): MapResult<HomeMapDraftState> {
      const entry = get().entries[bridgeId];
      if (entry?.status !== "ready" || !entry.draftState)
        return failure("Load this bridge's map before editing.");
      if (entry.pendingAction)
        return failure("Wait for the current map action to finish.");
      return { ok: true, value: entry.draftState };
    }

    function enqueue(
      bridgeId: string,
      action: () => Promise<ActionResult>,
    ): Promise<ActionResult> {
      const state = runtime(bridgeId);
      state.pendingWrites += 1;
      update(bridgeId, { saving: true });
      const operation = state.queue.then(action).catch((error: unknown) => {
        update(bridgeId, { error: message(error) });
        return failure(message(error));
      });
      const settled = operation.then((result) => {
        state.pendingWrites -= 1;
        update(bridgeId, { saving: state.pendingWrites > 0 });
        return result;
      });
      state.queue = settled.then(() => undefined);
      return settled;
    }

    async function save(
      bridgeId: string,
      draftState: HomeMapDraftState,
      promote = false,
    ): Promise<ActionResult> {
      const state = runtime(bridgeId);
      if (state.needsBaselineCheck)
        return failure(
          get().entries[bridgeId].error ?? "Retry saving to check map storage.",
        );
      const value = envelope(draftState);
      try {
        await repository.save(bridgeId, value);
      } catch (error) {
        // A write may have reached disk before failing; reload before retrying.
        state.needsBaselineCheck = true;
        state.failedAutosave = promote ? null : JSON.stringify(value);
        update(bridgeId, { error: message(error) });
        return failure(message(error));
      }
      state.lastKnownSaved = JSON.stringify(value);
      state.failedAutosave = null;
      const current = promote
        ? draftState
        : get().entries[bridgeId].draftState!;
      update(bridgeId, {
        draftState: current,
        dirty: isDirty(bridgeId, current),
        error: null,
      });
      return success();
    }

    function load(bridgeId: string): Promise<ActionResult> {
      const state = runtime(bridgeId);
      if (state.load) return state.load;
      update(bridgeId, {
        status: "loading",
        draftState: get().entries[bridgeId]?.draftState ?? null,
        saving: false,
        dirty: false,
        error: null,
        pendingAction: null,
        loadResult: null,
      });
      state.load = (async () => {
        let result: HomeMapLoadResult;
        try {
          result = await repository.load(bridgeId);
        } catch (error) {
          result = { status: "unavailable", error: message(error) };
        }
        if (result.status === "invalid" || result.status === "unavailable") {
          update(bridgeId, {
            status: result.status,
            error: result.error,
            loadResult: result,
          });
          return failure(result.error);
        }
        const draft = createHomeMapDraftState(
          bridgeId,
          result.status === "ready" ? result.value : {},
        );
        if (!draft.ok) {
          update(bridgeId, { status: "invalid", error: draft.error });
          return draft;
        }
        state.lastKnownSaved =
          result.status === "ready" ? JSON.stringify(result.value) : null;
        state.needsBaselineCheck = false;
        state.failedAutosave = null;
        update(bridgeId, {
          status: "ready",
          draftState: draft.value,
          loadResult: result,
        });
        return success();
      })().finally(() => {
        state.load = null;
      });
      return state.load;
    }

    function edit(
      bridgeId: string,
      transform: (draft: HomeMapDraftState) => MapResult<HomeMapDraftState>,
    ): Promise<ActionResult> {
      const current = editable(bridgeId);
      if (!current.ok) return Promise.resolve(current);
      const result = transform(current.value);
      if (!result.ok) return Promise.resolve(result);
      if (JSON.stringify(result.value) === JSON.stringify(current.value))
        return Promise.resolve(success());
      update(bridgeId, {
        draftState: result.value,
        dirty: isDirty(bridgeId, result.value),
      });
      // Keep accepting local edits after failure, but do not blindly retry writes.
      if (runtime(bridgeId).needsBaselineCheck)
        return Promise.resolve(
          failure(get().entries[bridgeId].error ?? "Retry saving this map."),
        );
      return enqueue(bridgeId, () => save(bridgeId, result.value));
    }

    function commit(
      bridgeId: string,
      action: "publish" | "discard",
    ): Promise<ActionResult> {
      const current = editable(bridgeId);
      if (!current.ok) return Promise.resolve(current);
      const next =
        action === "publish"
          ? publishHomeMapDraft(current.value)
          : { ok: true as const, value: discardHomeMapDraft(current.value) };
      if (!next.ok) return Promise.resolve(next);
      // Lock immediately, including while earlier autosaves finish.
      update(bridgeId, { pendingAction: action });
      return enqueue(bridgeId, async () => {
        try {
          return await save(bridgeId, next.value, true);
        } finally {
          update(bridgeId, { pendingAction: null });
        }
      });
    }

    return {
      activeBridgeId: null,
      entries: {},
      activateBridge(bridgeId) {
        if (bridgeId !== null && !bridgeId.trim())
          return Promise.resolve(failure("A bridge ID is required."));
        set({ activeBridgeId: bridgeId });
        if (bridgeId === null) return Promise.resolve(success());
        const state = runtime(bridgeId);
        if (state.load) return state.load;
        if (get().entries[bridgeId]) return Promise.resolve(success());
        return load(bridgeId);
      },
      retryLoad(bridgeId) {
        if (!bridgeId.trim())
          return Promise.resolve(failure("A bridge ID is required."));
        const state = runtime(bridgeId);
        if (state.load) return state.load;
        const entry = get().entries[bridgeId];
        if (
          entry?.dirty ||
          entry?.saving ||
          entry?.pendingAction ||
          state.needsBaselineCheck
        )
          return Promise.resolve(
            failure("Save or resolve local changes before reloading this map."),
          );
        return load(bridgeId);
      },
      applyEdit: (bridgeId, document) =>
        edit(bridgeId, (state) => applyHomeMapDraft(state, document)),
      createMap: (bridgeId, document) =>
        edit(bridgeId, (state) => replaceHomeMapDraft(state, document)),
      undo: (bridgeId) =>
        edit(bridgeId, (state) => ({
          ok: true,
          value: undoHomeMapDraft(state),
        })),
      redo: (bridgeId) =>
        edit(bridgeId, (state) => ({
          ok: true,
          value: redoHomeMapDraft(state),
        })),
      publish: (bridgeId) => commit(bridgeId, "publish"),
      discard: (bridgeId) => commit(bridgeId, "discard"),
      retrySave(bridgeId) {
        const current = editable(bridgeId);
        if (!current.ok) return Promise.resolve(current);
        return enqueue(bridgeId, async () => {
          const state = runtime(bridgeId);
          if (state.needsBaselineCheck) {
            const loaded = await repository.load(bridgeId);
            if (
              loaded.status === "invalid" ||
              loaded.status === "unavailable"
            ) {
              update(bridgeId, { error: loaded.error });
              return failure(loaded.error);
            }
            const saved =
              loaded.status === "ready" ? JSON.stringify(loaded.value) : null;
            if (
              saved !== state.lastKnownSaved &&
              (state.failedAutosave === null || saved !== state.failedAutosave)
            ) {
              const error =
                "Map storage changed elsewhere. Your local draft has been kept.";
              update(bridgeId, { error });
              return failure(error);
            }
            // An autosave can commit successfully before its response fails.
            state.lastKnownSaved = saved;
            state.needsBaselineCheck = false;
            state.failedAutosave = null;
          }
          return save(bridgeId, get().entries[bridgeId].draftState!);
        });
      },
      discardLocalAndReload(bridgeId) {
        const current = editable(bridgeId);
        if (!current.ok) return Promise.resolve(current);
        if (get().entries[bridgeId].saving)
          return Promise.resolve(
            failure("Wait for map saves to finish before reloading."),
          );
        update(bridgeId, { pendingAction: "reload" });
        return enqueue(bridgeId, async () => {
          try {
            const result = await repository.load(bridgeId);
            if (
              result.status === "invalid" ||
              result.status === "unavailable"
            ) {
              update(bridgeId, { error: result.error });
              return failure(result.error);
            }
            const draft = createHomeMapDraftState(
              bridgeId,
              result.status === "ready" ? result.value : {},
            );
            if (!draft.ok) return draft;
            const state = runtime(bridgeId);
            state.lastKnownSaved =
              result.status === "ready" ? JSON.stringify(result.value) : null;
            state.needsBaselineCheck = false;
            state.failedAutosave = null;
            update(bridgeId, {
              status: "ready",
              draftState: draft.value,
              dirty: false,
              error: null,
              loadResult: result,
            });
            return success();
          } finally {
            update(bridgeId, { pendingAction: null });
          }
        });
      },
    };
  });
}
