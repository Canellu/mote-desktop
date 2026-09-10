import { expect, test } from "bun:test";
import { createHomeMapStore } from "../src/features/home-map/store";
import {
  createHomeMapRepository,
  type HomeMapStorageEnvelope,
} from "../src/features/home-map/storage";
import type { HomeMapDocument } from "../src/features/home-map/types";

function document(name = "Home", bridgeId = "bridge-one"): HomeMapDocument {
  return {
    schemaVersion: 1,
    id: "map-one",
    bridgeId,
    name,
    drawingMode: "sketch",
    units: "metric",
    floors: [
      {
        id: "floor-one",
        name: "Ground floor",
        vertices: [
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 4, y: 0 },
          { id: "c", x: 4, y: 3 },
          { id: "d", x: 0, y: 3 },
        ],
        areas: [
          {
            id: "area-one",
            name: "Living room",
            vertexIds: ["a", "b", "c", "d"],
            target: null,
          },
        ],
        dimensions: [],
        lights: [],
      },
    ],
  };
}

function saved(
  published: HomeMapDocument | null,
  draft: HomeMapDocument | null = null,
): string {
  return JSON.stringify({
    schemaVersion: 1,
    bridgeId: published?.bridgeId ?? draft?.bridgeId ?? "bridge-one",
    published,
    draft,
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const disk = new Map<string, string>();
  const reads: string[] = [];
  const writes: HomeMapStorageEnvelope[] = [];
  const hooks: {
    beforeRead: (bridgeId: string) => Promise<void>;
    beforeWrite: (value: HomeMapStorageEnvelope) => Promise<void>;
  } = {
    beforeRead: async () => {},
    beforeWrite: async () => {},
  };
  const store = createHomeMapStore(
    createHomeMapRepository({
      async read(bridgeId) {
        reads.push(bridgeId);
        await hooks.beforeRead(bridgeId);
        return disk.get(bridgeId) ?? null;
      },
      async write(bridgeId, raw) {
        const value = JSON.parse(raw) as HomeMapStorageEnvelope;
        writes.push(value);
        await hooks.beforeWrite(value);
        disk.set(bridgeId, raw);
      },
    }),
  );
  const entry = (bridgeId = "bridge-one") => store.getState().entries[bridgeId];
  return { store, disk, reads, writes, hooks, entry };
}

test("bridge activation deduplicates loads and late results stay with their bridge", async () => {
  const { store, hooks, reads, entry } = harness();
  const started = deferred();
  const release = deferred();
  hooks.beforeRead = async (bridgeId) => {
    if (bridgeId === "bridge-one") {
      started.resolve();
      await release.promise;
    }
  };
  const first = store.getState().activateBridge("bridge-one");
  await started.promise;
  expect(store.getState().activateBridge("bridge-one")).toBe(first);
  expect(store.getState().retryLoad("bridge-one")).toBe(first);
  expect(entry().status).toBe("loading");
  expect((await store.getState().applyEdit("bridge-one", document())).ok).toBe(
    false,
  );
  await store.getState().activateBridge("bridge-two");
  await store
    .getState()
    .applyEdit("bridge-two", document("Second bridge", "bridge-two"));
  release.resolve();
  await first;
  expect(store.getState().activeBridgeId).toBe("bridge-two");
  expect(entry("bridge-two").draftState?.draft?.name).toBe("Second bridge");
  expect(entry().draftState?.draft).toBeNull();
  await store.getState().activateBridge("bridge-one");
  expect(reads).toEqual(["bridge-one", "bridge-two"]);
});

test("switching and clearing the active bridge retain loaded drafts and history", async () => {
  const { store, reads, entry } = harness();
  await store.getState().activateBridge("bridge-one");
  await store.getState().applyEdit("bridge-one", document("One"));
  await store.getState().applyEdit("bridge-one", document("Two"));
  const snapshot = entry().draftState;
  await store.getState().activateBridge("bridge-two");
  await store.getState().activateBridge(null);
  expect(store.getState().activeBridgeId).toBeNull();
  expect(entry().draftState).toBe(snapshot);
  await store.getState().activateBridge("bridge-one");
  expect(entry().draftState).toBe(snapshot);
  expect(reads).toEqual(["bridge-one", "bridge-two"]);
  await store.getState().undo("bridge-one");
  expect(entry().draftState?.draft?.name).toBe("One");
  await store.getState().redo("bridge-one");
  expect(entry().draftState?.draft?.name).toBe("Two");
});

test("older save success cannot mark a newer pending edit saved", async () => {
  const { store, hooks, writes, entry, disk } = harness();
  const startedFirst = deferred();
  const releaseFirst = deferred();
  const startedSecond = deferred();
  const releaseSecond = deferred();
  hooks.beforeWrite = async (value) => {
    if (value.draft?.name === "First") {
      startedFirst.resolve();
      await releaseFirst.promise;
    } else {
      startedSecond.resolve();
      await releaseSecond.promise;
    }
  };
  await store.getState().activateBridge("bridge-one");
  const first = store.getState().applyEdit("bridge-one", document("First"));
  await startedFirst.promise;
  const input = document("Second");
  const second = store.getState().applyEdit("bridge-one", input);
  input.name = "Caller mutation";
  expect(entry().draftState?.draft?.name).toBe("Second");
  expect(entry().dirty).toBe(true);
  expect(writes).toHaveLength(1);
  releaseFirst.resolve();
  await first;
  await startedSecond.promise;
  expect(entry()).toMatchObject({ saving: true, dirty: true });
  expect(entry().draftState?.draft?.name).toBe("Second");
  releaseSecond.resolve();
  await second;
  expect(entry()).toMatchObject({ saving: false, dirty: false, error: null });
  expect(JSON.parse(disk.get("bridge-one")!).draft.name).toBe("Second");
  expect(writes.map((value) => value.draft?.name)).toEqual(["First", "Second"]);
});

test("failed autosave keeps latest edits and history, stops queued writes, and safely retries", async () => {
  const { store, hooks, writes, reads, entry, disk } = harness();
  const started = deferred();
  const release = deferred();
  let fail = true;
  hooks.beforeWrite = async () => {
    if (fail) {
      started.resolve();
      await release.promise;
      throw new Error("Disk full");
    }
  };
  await store.getState().activateBridge("bridge-one");
  const first = store.getState().applyEdit("bridge-one", document("First"));
  await started.promise;
  const second = store.getState().applyEdit("bridge-one", document("Second"));
  release.resolve();
  expect((await first).ok).toBe(false);
  expect((await second).ok).toBe(false);
  expect(writes).toHaveLength(1);
  expect(entry()).toMatchObject({
    dirty: true,
    saving: false,
    error: "Disk full",
  });
  expect(entry().draftState?.draft?.name).toBe("Second");
  expect(entry().draftState?.past).toHaveLength(2);
  await store.getState().applyEdit("bridge-one", document("Third"));
  expect(entry().draftState?.draft?.name).toBe("Third");
  expect(writes).toHaveLength(1);
  expect((await store.getState().retryLoad("bridge-one")).ok).toBe(false);
  fail = false;
  expect((await store.getState().retrySave("bridge-one")).ok).toBe(true);
  expect(reads).toEqual(["bridge-one", "bridge-one"]);
  expect(JSON.parse(disk.get("bridge-one")!).draft.name).toBe("Third");
  expect(entry()).toMatchObject({ dirty: false, saving: false, error: null });
  expect(entry().draftState?.past).toHaveLength(3);
});

test("retry checks the disk baseline and preserves an external writer's changes", async () => {
  const { store, hooks, disk, writes, entry } = harness();
  disk.set("bridge-one", saved(document("Original")));
  await store.getState().activateBridge("bridge-one");
  hooks.beforeWrite = async () => {
    throw new Error("Concurrent write");
  };
  await store.getState().applyEdit("bridge-one", document("Local"));
  const external = saved(document("External"));
  disk.set("bridge-one", external);
  hooks.beforeWrite = async () => {};
  const result = await store.getState().retrySave("bridge-one");
  expect(result).toMatchObject({ ok: false });
  expect(entry().error).toContain("changed elsewhere");
  expect(entry().draftState?.draft?.name).toBe("Local");
  expect(entry().draftState?.published?.name).toBe("Original");
  expect(entry().dirty).toBe(true);
  expect(disk.get("bridge-one")).toBe(external);
  expect(writes).toHaveLength(1);
  await store.getState().applyEdit("bridge-one", document("More local"));
  await store.getState().retrySave("bridge-one");
  expect(writes).toHaveLength(1);
  expect(entry().draftState?.draft?.name).toBe("More local");
});

test("failed publish preserves the published map and saved draft until a durable retry", async () => {
  const { store, hooks, disk, entry } = harness();
  disk.set("bridge-one", saved(document("Published"), document("Draft")));
  await store.getState().activateBridge("bridge-one");
  const started = deferred();
  const release = deferred();
  hooks.beforeWrite = async () => {
    started.resolve();
    await release.promise;
    throw new Error("Write failed");
  };
  const publish = store.getState().publish("bridge-one");
  await started.promise;
  expect(entry().pendingAction).toBe("publish");
  expect(entry().draftState?.published?.name).toBe("Published");
  expect(entry().draftState?.draft?.name).toBe("Draft");
  expect(
    (await store.getState().applyEdit("bridge-one", document("Oops"))).ok,
  ).toBe(false);
  expect((await store.getState().undo("bridge-one")).ok).toBe(false);
  expect((await store.getState().discard("bridge-one")).ok).toBe(false);
  release.resolve();
  expect((await publish).ok).toBe(false);
  expect(entry()).toMatchObject({ pendingAction: null, error: "Write failed" });
  expect(entry().draftState?.published?.name).toBe("Published");
  expect(entry().draftState?.draft?.name).toBe("Draft");
  hooks.beforeWrite = async () => {};
  await store.getState().retrySave("bridge-one");
  expect((await store.getState().publish("bridge-one")).ok).toBe(true);
  expect(entry().draftState?.published?.name).toBe("Draft");
  expect(entry().draftState?.draft).toBeNull();
  expect(JSON.parse(disk.get("bridge-one")!).published.name).toBe("Draft");
});

test("publish waits behind autosave and only promotes after its own write succeeds", async () => {
  const { store, hooks, entry, writes } = harness();
  const started = deferred();
  const release = deferred();
  const publishStarted = deferred();
  const publishRelease = deferred();
  hooks.beforeWrite = async (value) => {
    if (value.draft) {
      started.resolve();
      await release.promise;
    } else {
      publishStarted.resolve();
      await publishRelease.promise;
    }
  };
  await store.getState().activateBridge("bridge-one");
  const edit = store.getState().applyEdit("bridge-one", document("Draft"));
  await started.promise;
  const publish = store.getState().publish("bridge-one");
  expect(entry().pendingAction).toBe("publish");
  expect(writes).toHaveLength(1);
  release.resolve();
  await edit;
  await publishStarted.promise;
  expect(entry().draftState?.published).toBeNull();
  expect(entry().draftState?.draft?.name).toBe("Draft");
  publishRelease.resolve();
  await publish;
  expect(entry().draftState?.published?.name).toBe("Draft");
  expect(entry().draftState?.draft).toBeNull();
  expect(entry()).toMatchObject({
    saving: false,
    dirty: false,
    pendingAction: null,
  });
});

test("discard retains draft and undo history on failure, then clears them after success", async () => {
  const { store, hooks, entry } = harness();
  await store.getState().activateBridge("bridge-one");
  await store.getState().applyEdit("bridge-one", document("Draft"));
  const original = entry().draftState;
  hooks.beforeWrite = async () => {
    throw new Error("Cannot discard");
  };
  expect((await store.getState().discard("bridge-one")).ok).toBe(false);
  expect(entry().draftState).toBe(original);
  hooks.beforeWrite = async () => {};
  await store.getState().retrySave("bridge-one");
  await store.getState().discard("bridge-one");
  expect(entry().draftState?.draft).toBeNull();
  expect(entry().draftState?.past).toHaveLength(0);
  expect(entry().draftState?.future).toHaveLength(0);
});

test("delete clears the published map and draft only after a durable save", async () => {
  const { store, hooks, disk, entry } = harness();
  disk.set("bridge-one", saved(document("Published"), document("Draft")));
  await store.getState().activateBridge("bridge-one");
  hooks.beforeWrite = async () => {
    throw new Error("Cannot delete");
  };
  expect((await store.getState().deleteMap("bridge-one")).ok).toBe(false);
  expect(entry().draftState?.published?.name).toBe("Published");
  expect(entry().draftState?.draft?.name).toBe("Draft");
  expect(entry()).toMatchObject({
    pendingAction: null,
    error: "Cannot delete",
  });

  hooks.beforeWrite = async () => {};
  expect((await store.getState().deleteMap("bridge-one")).ok).toBe(true);
  expect(entry().draftState?.published).toBeNull();
  expect(entry().draftState?.draft).toBeNull();
  expect(entry().draftState?.past).toHaveLength(0);
  expect(entry().draftState?.future).toHaveLength(0);
  expect(JSON.parse(disk.get("bridge-one")!)).toMatchObject({
    published: null,
    draft: null,
  });
});

test("invalid or unavailable initial storage blocks every write and needs an explicit reload", async () => {
  for (const mode of ["invalid", "unavailable"] as const) {
    const { store, disk, hooks, writes, reads, entry } = harness();
    if (mode === "invalid") disk.set("bridge-one", "{broken");
    hooks.beforeRead = async () => {
      if (mode === "unavailable") throw new Error("Cannot read");
    };
    expect((await store.getState().activateBridge("bridge-one")).ok).toBe(
      false,
    );
    expect(entry().status).toBe(mode);
    expect(entry().draftState).toBeNull();
    const actions = store.getState();
    for (const result of await Promise.all([
      actions.applyEdit("bridge-one", document()),
      actions.undo("bridge-one"),
      actions.redo("bridge-one"),
      actions.publish("bridge-one"),
      actions.discard("bridge-one"),
      actions.retrySave("bridge-one"),
    ])) {
      expect(result.ok).toBe(false);
    }
    expect(writes).toHaveLength(0);
    await actions.activateBridge("bridge-one");
    expect(reads).toHaveLength(1);
    disk.delete("bridge-one");
    hooks.beforeRead = async () => {};
    expect((await actions.retryLoad("bridge-one")).ok).toBe(true);
    expect(entry().status).toBe("ready");
    expect(reads).toHaveLength(2);
  }
});

test("invalid edits never change history or submit persistence", async () => {
  const { store, entry, writes } = harness();
  await store.getState().activateBridge("bridge-one");
  const original = entry().draftState;
  const invalid = document();
  invalid.floors[0].areas[0].vertexIds = ["a", "c", "b", "d"];
  expect((await store.getState().applyEdit("bridge-one", invalid)).ok).toBe(
    false,
  );
  expect(
    (
      await store
        .getState()
        .applyEdit("bridge-one", document("Wrong", "bridge-two"))
    ).ok,
  ).toBe(false);
  expect(entry().draftState).toBe(original);
  expect(writes).toHaveLength(0);
});

test("a pending save remains scoped to its bridge after switching and disconnecting", async () => {
  const { store, hooks, entry, disk } = harness();
  const started = deferred();
  const release = deferred();
  hooks.beforeWrite = async (value) => {
    if (value.bridgeId === "bridge-one") {
      started.resolve();
      await release.promise;
    }
  };
  await store.getState().activateBridge("bridge-one");
  const first = store.getState().applyEdit("bridge-one", document("One"));
  await started.promise;
  await store.getState().activateBridge("bridge-two");
  await store.getState().applyEdit("bridge-two", document("Two", "bridge-two"));
  await store.getState().activateBridge(null);
  release.resolve();
  await first;
  expect(store.getState().activeBridgeId).toBeNull();
  expect(entry().draftState?.draft?.name).toBe("One");
  expect(entry("bridge-two").draftState?.draft?.name).toBe("Two");
  expect(JSON.parse(disk.get("bridge-one")!).draft.bridgeId).toBe("bridge-one");
  expect(JSON.parse(disk.get("bridge-two")!).draft.bridgeId).toBe("bridge-two");
});

test("retry read errors preserve local changes without submitting another write", async () => {
  const { store, hooks, writes, entry } = harness();
  await store.getState().activateBridge("bridge-one");
  hooks.beforeWrite = async () => {
    throw new Error("Disk full");
  };
  await store.getState().applyEdit("bridge-one", document("Local"));
  hooks.beforeRead = async () => {
    throw new Error("Disk unavailable");
  };
  expect((await store.getState().retrySave("bridge-one")).ok).toBe(false);
  expect(entry()).toMatchObject({
    status: "ready",
    dirty: true,
    saving: false,
    error: "Disk unavailable",
  });
  expect(entry().draftState?.draft?.name).toBe("Local");
  expect(writes).toHaveLength(1);
});

test("explicit conflict recovery replaces local work only after a successful read", async () => {
  const { store, hooks, disk, entry, writes } = harness();
  await store.getState().activateBridge("bridge-one");
  hooks.beforeWrite = async () => {
    throw new Error("Concurrent write");
  };
  await store.getState().applyEdit("bridge-one", document("Local"));
  disk.set("bridge-one", saved(document("External")));
  await store.getState().retrySave("bridge-one");
  const original = entry().draftState;
  const started = deferred();
  const release = deferred();
  hooks.beforeRead = async () => {
    started.resolve();
    await release.promise;
  };
  const reload = store.getState().discardLocalAndReload("bridge-one");
  await started.promise;
  expect(entry().pendingAction).toBe("reload");
  expect(entry().draftState).toBe(original);
  expect(entry().dirty).toBe(true);
  expect(
    (await store.getState().applyEdit("bridge-one", document("Racing"))).ok,
  ).toBe(false);
  release.resolve();
  expect((await reload).ok).toBe(true);
  expect(entry().draftState?.published?.name).toBe("External");
  expect(entry().draftState?.draft).toBeNull();
  expect(entry()).toMatchObject({
    dirty: false,
    error: null,
    pendingAction: null,
  });
  expect(writes).toHaveLength(1);
  hooks.beforeWrite = async () => {};
  expect(
    (await store.getState().applyEdit("bridge-one", document("New edit"))).ok,
  ).toBe(true);
});

test("failed explicit recovery preserves local draft and history for another attempt", async () => {
  for (const mode of ["invalid", "unavailable"] as const) {
    const { store, hooks, disk, entry, writes } = harness();
    await store.getState().activateBridge("bridge-one");
    hooks.beforeWrite = async () => {
      throw new Error("Cannot write");
    };
    await store.getState().applyEdit("bridge-one", document("Local"));
    const original = entry().draftState;
    if (mode === "invalid") disk.set("bridge-one", "{broken");
    hooks.beforeRead = async () => {
      if (mode === "unavailable") throw new Error("Cannot read");
    };
    expect(
      (await store.getState().discardLocalAndReload("bridge-one")).ok,
    ).toBe(false);
    expect(entry().draftState).toBe(original);
    expect(entry()).toMatchObject({
      status: "ready",
      dirty: true,
      saving: false,
      pendingAction: null,
    });
    expect(writes).toHaveLength(1);
    disk.delete("bridge-one");
    hooks.beforeRead = async () => {};
    expect(
      (await store.getState().discardLocalAndReload("bridge-one")).ok,
    ).toBe(true);
    expect(entry().draftState?.draft).toBeNull();
    expect(entry().draftState?.published).toBeNull();
    expect(entry().dirty).toBe(false);
  }
});

test("explicit local discard cannot race an in-flight autosave", async () => {
  const { store, hooks, entry, reads } = harness();
  const started = deferred();
  const release = deferred();
  hooks.beforeWrite = async () => {
    started.resolve();
    await release.promise;
  };
  await store.getState().activateBridge("bridge-one");
  const save = store.getState().applyEdit("bridge-one", document("Local"));
  await started.promise;
  expect((await store.getState().discardLocalAndReload("bridge-one")).ok).toBe(
    false,
  );
  expect(entry().draftState?.draft?.name).toBe("Local");
  expect(reads).toHaveLength(1);
  release.resolve();
  await save;
});

test("retry reconciles an autosave that reached disk before its response failed", async () => {
  const { store, hooks, disk, entry, writes } = harness();
  await store.getState().activateBridge("bridge-one");
  hooks.beforeWrite = async (value) => {
    disk.set(value.bridgeId, JSON.stringify(value));
    throw new Error("Response lost");
  };
  await store
    .getState()
    .applyEdit("bridge-one", document("Saved despite error"));
  await store.getState().applyEdit("bridge-one", document("Newest local edit"));
  hooks.beforeWrite = async () => {};
  expect((await store.getState().retrySave("bridge-one")).ok).toBe(true);
  expect(writes).toHaveLength(2);
  expect(JSON.parse(disk.get("bridge-one")!).draft.name).toBe(
    "Newest local edit",
  );
  expect(entry()).toMatchObject({ dirty: false, error: null, saving: false });
  expect(entry().draftState?.past).toHaveLength(2);
});

test("ambiguous publish preserves local state until explicit durable recovery", async () => {
  const { store, hooks, disk, entry, writes } = harness();
  disk.set("bridge-one", saved(document("Original"), document("Draft")));
  await store.getState().activateBridge("bridge-one");
  hooks.beforeWrite = async (value) => {
    disk.set(value.bridgeId, JSON.stringify(value));
    throw new Error("Response lost");
  };
  expect((await store.getState().publish("bridge-one")).ok).toBe(false);
  expect((await store.getState().retrySave("bridge-one")).ok).toBe(false);
  expect(entry().draftState?.published?.name).toBe("Original");
  expect(entry().draftState?.draft?.name).toBe("Draft");
  expect((await store.getState().retryLoad("bridge-one")).ok).toBe(false);
  expect((await store.getState().discardLocalAndReload("bridge-one")).ok).toBe(
    true,
  );
  expect(entry().draftState?.published?.name).toBe("Draft");
  expect(entry().draftState?.draft).toBeNull();
  expect(writes).toHaveLength(1);
});
