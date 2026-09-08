import { expect, test } from "bun:test";
import {
  buildFloorRing,
  createHomeMapDocument,
  MIN_FLOOR_SIDE_METERS,
  type CreateHomeMapInput,
} from "../src/features/home-map/creation";
import { signedArea, validateRing } from "../src/features/home-map/geometry";
import { validateHomeMap } from "../src/features/home-map/validation";

function ids() {
  let count = 0;
  return () => `id-${(count += 1)}`;
}

const input = (
  overrides: Partial<CreateHomeMapInput> = {},
): CreateHomeMapInput => ({
  bridgeId: "bridge-1",
  name: "My home",
  drawingMode: "measured",
  units: "metric",
  floorName: "Ground floor",
  roomName: "Whole floor",
  shape: { kind: "rectangle", widthMeters: 6, depthMeters: 4 },
  createId: ids(),
  ...overrides,
});

test("rectangle outline is a valid orthogonal ring of the entered size", () => {
  const ring = buildFloorRing({
    kind: "rectangle",
    widthMeters: 6,
    depthMeters: 4,
  });
  expect(ring.ok).toBe(true);
  if (!ring.ok) return;
  expect(ring.value).toHaveLength(4);
  expect(validateRing(ring.value)).toBeNull();
  expect(Math.abs(signedArea(ring.value))).toBeCloseTo(24, 6);
});

test("a drawn outline becomes the floor exactly as drawn", () => {
  const ring = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 5, y: 2 },
    { x: 8, y: 2 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ];
  const built = buildFloorRing({ kind: "drawn", ring });
  expect(built).toEqual({ ok: true, value: ring });

  const result = createHomeMapDocument(
    input({ shape: { kind: "drawn", ring } }),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(validateHomeMap(result.value)).toEqual([]);
  expect(result.value.floors[0].vertices).toHaveLength(6);
  // A drawn floor carries no typed sides, so it starts unmeasured.
  expect(result.value.floors[0].dimensions).toEqual([]);
});

test("a drawn outline that is not a room is refused", () => {
  expect(
    buildFloorRing({
      kind: "drawn",
      ring: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    }).ok,
  ).toBe(false);
  expect(
    buildFloorRing({
      kind: "drawn",
      ring: [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
        { x: 4, y: 0 },
        { x: 0, y: 4 },
      ],
    }).ok,
  ).toBe(false);
});

test("outlines reject sizes that leave an unusable floor", () => {
  expect(
    buildFloorRing({ kind: "rectangle", widthMeters: 0.2, depthMeters: 4 }),
  ).toEqual({
    ok: false,
    error: `Width must be at least ${MIN_FLOOR_SIDE_METERS} m.`,
  });
  expect(
    buildFloorRing({ kind: "rectangle", widthMeters: 6, depthMeters: 500 }),
  ).toEqual({ ok: false, error: "Depth must be at most 200 m." });
  expect(
    buildFloorRing({
      kind: "rectangle",
      widthMeters: Number.NaN,
      depthMeters: 4,
    }).ok,
  ).toBe(false);
});

test("a created map is a valid single-floor, single-room document", () => {
  const result = createHomeMapDocument(input());
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const map = result.value;
  expect(validateHomeMap(map)).toEqual([]);
  expect(map.bridgeId).toBe("bridge-1");
  expect(map.schemaVersion).toBe(1);
  expect(map.floors).toHaveLength(1);
  expect(map.floors[0].areas).toHaveLength(1);
  expect(map.floors[0].areas[0].name).toBe("Whole floor");
  expect(map.floors[0].areas[0].target).toBeNull();
  expect(map.floors[0].lights).toEqual([]);
});

test("measured maps lock the entered width and depth; sketches do not", () => {
  const measured = createHomeMapDocument(input());
  const sketch = createHomeMapDocument(input({ drawingMode: "sketch" }));
  expect(measured.ok && sketch.ok).toBe(true);
  if (!measured.ok || !sketch.ok) return;
  const lengths = measured.value.floors[0].dimensions
    .map((dimension) => dimension.lengthMeters)
    .sort((a, b) => a - b);
  expect(lengths).toEqual([4, 6]);
  expect(
    measured.value.floors[0].dimensions.every(
      (dimension) => dimension.locked && dimension.verified,
    ),
  ).toBe(true);
  expect(
    sketch.value.floors[0].dimensions.every(
      (dimension) => !dimension.locked && !dimension.verified,
    ),
  ).toBe(true);
});

test("creation rejects a missing bridge or blank names", () => {
  expect(createHomeMapDocument(input({ bridgeId: " " })).ok).toBe(false);
  expect(createHomeMapDocument(input({ name: "  " }))).toEqual({
    ok: false,
    error: "Name your map.",
  });
  expect(createHomeMapDocument(input({ floorName: "" }))).toEqual({
    ok: false,
    error: "Name this floor.",
  });
  expect(createHomeMapDocument(input({ roomName: "" }))).toEqual({
    ok: false,
    error: "Name this room.",
  });
});

test("names are trimmed and invalid geometry never becomes a document", () => {
  const trimmed = createHomeMapDocument(
    input({ name: "  Home  ", floorName: " Attic ", roomName: " Loft " }),
  );
  expect(trimmed.ok).toBe(true);
  if (!trimmed.ok) return;
  expect(trimmed.value.name).toBe("Home");
  expect(trimmed.value.floors[0].name).toBe("Attic");
  expect(trimmed.value.floors[0].areas[0].name).toBe("Loft");
  expect(
    createHomeMapDocument(
      input({
        shape: { kind: "rectangle", widthMeters: 6, depthMeters: 0 },
      }),
    ).ok,
  ).toBe(false);
});

test("each created map uses distinct identities", () => {
  const first = createHomeMapDocument(input({ createId: undefined }));
  const second = createHomeMapDocument(input({ createId: undefined }));
  expect(first.ok && second.ok).toBe(true);
  if (!first.ok || !second.ok) return;
  expect(first.value.id).not.toBe(second.value.id);
  expect(first.value.floors[0].id).not.toBe(second.value.floors[0].id);
  const ids = [
    first.value.id,
    first.value.floors[0].id,
    first.value.floors[0].areas[0].id,
    ...first.value.floors[0].vertices.map((vertex) => vertex.id),
    ...first.value.floors[0].dimensions.map((dimension) => dimension.id),
  ];
  expect(new Set(ids).size).toBe(ids.length);
});
