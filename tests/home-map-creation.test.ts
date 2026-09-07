import { expect, test } from "bun:test";
import {
  buildFloorRing,
  createHomeMapDocument,
  MIN_FLOOR_SIDE_METERS,
  type CreateHomeMapInput,
  type NotchCorner,
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

test("every L-shape corner keeps the outline valid and removes the cut-out", () => {
  const corners: NotchCorner[] = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];
  const seen = new Set<string>();
  for (const corner of corners) {
    const ring = buildFloorRing({
      kind: "l-shape",
      widthMeters: 8,
      depthMeters: 6,
      notchWidthMeters: 3,
      notchDepthMeters: 2,
      corner,
    });
    expect(ring.ok).toBe(true);
    if (!ring.ok) return;
    expect(ring.value).toHaveLength(6);
    expect(validateRing(ring.value)).toBeNull();
    expect(Math.abs(signedArea(ring.value))).toBeCloseTo(8 * 6 - 3 * 2, 6);
    seen.add(JSON.stringify(ring.value));
  }
  expect(seen.size).toBe(4);
});

test("outlines reject sizes and cut-outs that leave an unusable floor", () => {
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
  const notch = buildFloorRing({
    kind: "l-shape",
    widthMeters: 6,
    depthMeters: 4,
    notchWidthMeters: 5.8,
    notchDepthMeters: 2,
    corner: "top-right",
  });
  expect(notch).toEqual({
    ok: false,
    error: `The cut-out must leave at least ${MIN_FLOOR_SIDE_METERS} m of width.`,
  });
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

test("an L-shape measures its full-length walls, not the notched sides", () => {
  const result = createHomeMapDocument(
    input({
      shape: {
        kind: "l-shape",
        widthMeters: 8,
        depthMeters: 6,
        notchWidthMeters: 3,
        notchDepthMeters: 2,
        corner: "top-right",
      },
    }),
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const floor = result.value.floors[0];
  expect(validateHomeMap(result.value)).toEqual([]);
  const vertices = new Map(floor.vertices.map((v) => [v.id, v]));
  const spans = floor.dimensions.map((dimension) => ({
    length: dimension.lengthMeters,
    start: vertices.get(dimension.startVertexId)!,
    end: vertices.get(dimension.endVertexId)!,
  }));
  expect(spans.map((span) => span.length).sort((a, b) => a - b)).toEqual([
    6, 8,
  ]);
  // The notch sits along y = 0, so the width must be measured on the far wall.
  const width = spans.find((span) => span.length === 8)!;
  expect(width.start.y).toBeCloseTo(6, 6);
  expect(width.end.y).toBeCloseTo(6, 6);
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
