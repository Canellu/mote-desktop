import { expect, test } from "bun:test";
import {
  applyHomeMapDraft,
  createHomeMapDraftState,
  discardHomeMapDraft,
  replaceHomeMapDraft,
  publishHomeMapDraft,
  redoHomeMapDraft,
  undoHomeMapDraft,
} from "../src/features/home-map/drafts";
import type {
  HomeMapDocument,
  MapResult,
} from "../src/features/home-map/types";

function document(name = "Home"): HomeMapDocument {
  return {
    schemaVersion: 1,
    id: "map-one",
    bridgeId: "bridge-one",
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

function value<T>(result: MapResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

test("published maps, drafts, and history own recursively frozen snapshots", () => {
  const source = document();
  const initial = value(
    createHomeMapDraftState(source.bridgeId, { published: source }),
  );
  source.floors[0].vertices[0].x = 999;
  expect(initial.published?.floors[0].vertices[0].x).toBe(0);

  const edit = document("Edited");
  const edited = value(applyHomeMapDraft(initial, edit));
  edit.floors[0].areas[0].name = "Mutated outside";
  expect(edited.draft?.floors[0].areas[0].name).toBe("Living room");
  expect(edited.published?.name).toBe("Home");
  expect(initial.draft).toBeNull();
  expect(edited.published).not.toBe(initial.published);
  expect(() => {
    edited.draft!.floors[0].vertices[0].x = 42;
  }).toThrow();

  const second = value(applyHomeMapDraft(edited, document("Second")));
  expect(second.past[1]).not.toBe(edited.draft);
  expect(() => {
    second.past[1]!.name = "Changed history";
  }).toThrow();
  expect(undoHomeMapDraft(second).draft?.name).toBe("Edited");
});

test("undo and redo are bounded and a new edit clears the redo branch", () => {
  let state = value(
    createHomeMapDraftState("bridge-one", {
      published: document("Initial"),
      historyLimit: 2,
    }),
  );
  for (const name of ["One", "Two", "Three"])
    state = value(applyHomeMapDraft(state, document(name)));
  expect(state.past).toHaveLength(2);
  state = undoHomeMapDraft(state);
  expect(state.draft?.name).toBe("Two");
  state = undoHomeMapDraft(state);
  expect(state.draft?.name).toBe("One");
  expect(undoHomeMapDraft(state).draft?.name).toBe("One");
  state = redoHomeMapDraft(state);
  expect(state.draft?.name).toBe("Two");
  state = value(applyHomeMapDraft(state, document("New branch")));
  expect(state.future).toHaveLength(0);
  expect(redoHomeMapDraft(state).draft?.name).toBe("New branch");
  expect(state.published?.name).toBe("Initial");
});

test("undoing the first edit restores the published map or an empty new map", () => {
  const saved = value(
    createHomeMapDraftState("bridge-one", { published: document() }),
  );
  const reverted = undoHomeMapDraft(
    value(applyHomeMapDraft(saved, document("Edit"))),
  );
  expect(reverted.draft).toBeNull();
  expect(reverted.published?.name).toBe("Home");
  expect(redoHomeMapDraft(reverted).draft?.name).toBe("Edit");

  const empty = value(createHomeMapDraftState("bridge-one"));
  const undone = undoHomeMapDraft(value(applyHomeMapDraft(empty, document())));
  expect(undone.draft).toBeNull();
  expect(undone.published).toBeNull();
  expect(undone.mapId).toBe("map-one");
  expect(redoHomeMapDraft(undone).draft?.name).toBe("Home");
});

test("discard preserves published data and publish promotes only the local draft", () => {
  const initial = value(
    createHomeMapDraftState("bridge-one", { published: document() }),
  );
  const edited = value(applyHomeMapDraft(initial, document("Edited")));
  const discarded = discardHomeMapDraft(edited);
  expect(discarded.published?.name).toBe("Home");
  expect(discarded.draft).toBeNull();
  expect(discarded.past).toHaveLength(0);
  expect(discarded.future).toHaveLength(0);

  const published = value(publishHomeMapDraft(edited));
  expect(published.published?.name).toBe("Edited");
  expect(published.published).not.toBe(edited.draft);
  expect(published.draft).toBeNull();
  expect(published.past).toHaveLength(0);
  expect(edited.published?.name).toBe("Home");
  expect(publishHomeMapDraft(published).ok).toBe(false);
});

test("invalid completed edits and identity changes leave state intact", () => {
  const state = value(
    createHomeMapDraftState("bridge-one", { published: document() }),
  );
  const crossed = document("Crossed");
  crossed.floors[0].areas[0].vertexIds = ["a", "c", "b", "d"];
  expect(applyHomeMapDraft(state, crossed).ok).toBe(false);
  expect(
    applyHomeMapDraft(state, { ...document(), bridgeId: "bridge-two" }).ok,
  ).toBe(false);
  expect(applyHomeMapDraft(state, { ...document(), id: "map-two" }).ok).toBe(
    false,
  );
  expect(
    createHomeMapDraftState("bridge-one", {
      published: document(),
      draft: { ...document(), id: "map-two" },
    }).ok,
  ).toBe(false);
  expect(state.draft).toBeNull();
  expect(state.past).toHaveLength(0);
  expect(value(applyHomeMapDraft(state, document())).past).toHaveLength(0);
  expect(createHomeMapDraftState("bridge-one", { historyLimit: 101 }).ok).toBe(
    false,
  );
});

test("creating a map replaces the one the bridge held", () => {
  // Discarding a draft leaves the map ID behind, so the next creation would
  // otherwise be refused as an edit that changes identity.
  const state = value(
    createHomeMapDraftState("bridge-one", { published: document() }),
  );
  const emptied = discardHomeMapDraft(
    value(applyHomeMapDraft(state, document("Edited"))),
  );
  const fresh = { ...document("Second home"), id: "map-two" };

  expect(applyHomeMapDraft(emptied, fresh).ok).toBe(false);

  const replaced = value(replaceHomeMapDraft(emptied, fresh));
  expect(replaced.mapId).toBe("map-two");
  expect(replaced.draft?.name).toBe("Second home");
  expect(replaced.published).toBeNull();
  expect(replaced.past).toEqual([]);
  expect(replaced.future).toEqual([]);
});

test("a created map still has to belong to this bridge", () => {
  const state = value(createHomeMapDraftState("bridge-one"));
  const other = { ...document(), bridgeId: "bridge-two" };
  expect(replaceHomeMapDraft(state, other)).toEqual({
    ok: false,
    error: "The map belongs to another bridge.",
  });
});
