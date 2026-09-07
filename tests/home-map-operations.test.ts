import { expect, test } from "bun:test";
import {
  pointOnSegment,
  samePoint,
  signedArea,
} from "../src/features/home-map/geometry";
import {
  combineMapAreas,
  removeMapArea,
  renameMapArea,
  setMapAreaTarget,
  splitMapArea,
} from "../src/features/home-map/operations";
import type {
  MapControlTarget,
  MapFloor,
  MapPoint,
  MapResult,
} from "../src/features/home-map/types";
import { validateMapFloor } from "../src/features/home-map/validation";

const roomTarget: MapControlTarget = {
  resourceType: "room",
  resourceId: "00000000-0000-0000-0000-000000000001",
};
const zoneTarget: MapControlTarget = {
  resourceType: "zone",
  resourceId: "00000000-0000-0000-0000-000000000002",
};
const point = (x: number, y: number): MapPoint => ({ x, y });
const rectangle = (x = 0, y = 0, width = 4, height = 4) => [
  point(x, y),
  point(x + width, y),
  point(x + width, y + height),
  point(x, y + height),
];

function makeFloor(rings: MapPoint[][] = [rectangle()]): MapFloor {
  const floor: MapFloor = {
    id: "floor",
    name: "Ground floor",
    vertices: [],
    areas: [],
    dimensions: [],
    lights: [
      { lightId: "00000000-0000-0000-0000-000000000003", x: 1, y: 1 },
      { lightId: "00000000-0000-0000-0000-000000000004", x: 3, y: 2 },
    ],
  };
  for (const ring of rings)
    for (const position of ring)
      if (!floor.vertices.some((vertex) => samePoint(vertex, position)))
        floor.vertices.push({ id: `v${floor.vertices.length}`, ...position });
  floor.areas = rings.map((ring, index) => ({
    id: `area${index}`,
    name: `Room ${index + 1}`,
    target: { ...roomTarget },
    vertexIds: ring.flatMap((a, i) => {
      const b = ring[(i + 1) % ring.length];
      return floor.vertices
        .filter(
          (vertex) => !samePoint(vertex, b) && pointOnSegment(vertex, a, b),
        )
        .sort(
          (left, right) =>
            Math.hypot(left.x - a.x, left.y - a.y) -
            Math.hypot(right.x - a.x, right.y - a.y),
        )
        .map((vertex) => vertex.id);
    }),
  }));
  expect(validateMapFloor(floor)).toEqual([]);
  return floor;
}

function unwrap(result: MapResult<MapFloor>): MapFloor {
  if (!result.ok) throw new Error(result.error);
  expect(validateMapFloor(result.value)).toEqual([]);
  return result.value;
}

function split(floor: MapFloor, divider = [point(2, 0), point(2, 4)]) {
  let id = 0;
  return splitMapArea(
    floor,
    "area0",
    divider,
    { id: "split", name: "Dining" },
    () => `new${id++}`,
  );
}

function areaSize(floor: MapFloor): number {
  const vertices = new Map(floor.vertices.map((vertex) => [vertex.id, vertex]));
  return floor.areas.reduce(
    (sum, area) =>
      sum + Math.abs(signedArea(area.vertexIds.map((id) => vertices.get(id)!))),
    0,
  );
}

function vertexAt(floor: MapFloor, x: number, y: number): string {
  return floor.vertices.find((vertex) => samePoint(vertex, point(x, y)))!.id;
}

test("rectangle split preserves geometry, original ID, shared control, dimensions and light coordinates", () => {
  const original = makeFloor();
  original.dimensions.push({
    id: "width",
    startVertexId: "v0",
    endVertexId: "v1",
    lengthMeters: 4,
    locked: true,
    verified: true,
  });
  const before = JSON.stringify(original);
  const result = unwrap(split(original));
  expect(result.areas.map((area) => area.id)).toEqual(["area0", "split"]);
  expect(result.areas.map((area) => area.target)).toEqual([
    roomTarget,
    roomTarget,
  ]);
  expect(result.areas[1].name).toBe("Dining");
  expect(result.lights).toEqual(original.lights);
  expect(result.dimensions).toEqual(original.dimensions);
  expect(areaSize(result)).toBe(16);
  const shared = result.areas[0].vertexIds.filter((id) =>
    result.areas[1].vertexIds.includes(id),
  );
  expect(shared).toHaveLength(2);
  expect(JSON.stringify(original)).toBe(before);
  result.areas[0].target!.resourceId = zoneTarget.resourceId;
  result.lights[0].x = 99;
  expect(JSON.stringify(original)).toBe(before);
});

test("bent divider splits an L-shaped room and preserves winding in both directions", () => {
  const ring = [
    point(0, 0),
    point(6, 0),
    point(6, 2),
    point(2, 2),
    point(2, 6),
    point(0, 6),
  ];
  for (const outline of [ring, [...ring].reverse()]) {
    const floor = makeFloor([outline]);
    const result = unwrap(
      split(floor, [point(4, 0), point(4, 1), point(1, 1), point(1, 6)]),
    );
    expect(result.areas).toHaveLength(2);
    expect(areaSize(result)).toBe(20);
    const vertices = new Map(
      result.vertices.map((vertex) => [vertex.id, vertex]),
    );
    expect(
      result.areas.every(
        (area) =>
          Math.sign(
            signedArea(area.vertexIds.map((id) => vertices.get(id)!)),
          ) === Math.sign(signedArea(outline)),
      ),
    ).toBe(true);
  }
});

test("a divider ending on a shared wall nodes the neighboring room with the same ID", () => {
  const floor = makeFloor([rectangle(), rectangle(4)]);
  const result = unwrap(split(floor, [point(0, 2), point(4, 2)]));
  const nodeId = vertexAt(result, 4, 2);
  expect(result.areas.every((area) => area.vertexIds.includes(nodeId))).toBe(
    true,
  );
  expect(
    result.areas.find((area) => area.id === "area1")!.vertexIds,
  ).toHaveLength(5);
  expect(areaSize(result)).toBe(32);
});

test("split rejects unfinished, outside, diagonal, boundary-running, self-crossing and sliver dividers", () => {
  const floor = makeFloor();
  const before = JSON.stringify(floor);
  for (const divider of [
    [point(0, 2)],
    [point(1, 2), point(4, 2)],
    [point(0, 2), point(0, 2)],
    [point(0, 2), point(4, 3)],
    [point(0, 2), point(-1, 2), point(-1, 4), point(2, 4)],
    [point(0, 0), point(4, 0)],
    [point(0, 2), point(2, 2), point(2, 0), point(4, 0)],
    [point(0, 1), point(3, 1), point(3, 3), point(1, 3), point(1, 0)],
    [point(0, 2), point(3, 2), point(1, 2), point(1, 4)],
    [point(0.005, 0), point(0.005, 4)],
    [point(0, 2), point(Number.NaN, 2), point(4, 2)],
  ])
    expect(split(floor, divider).ok).toBe(false);
  expect(JSON.stringify(floor)).toBe(before);
});

test("split rejects a concave-wall crossing even when segment midpoint is inside", () => {
  const floor = makeFloor([
    [
      point(0, 0),
      point(6, 0),
      point(6, 6),
      point(4, 6),
      point(4, 2),
      point(3, 2),
      point(3, 6),
      point(0, 6),
    ],
  ]);
  expect(split(floor, [point(0, 3), point(6, 3)]).ok).toBe(false);
});

test("split rejects duplicate generated IDs without mutating input", () => {
  const floor = makeFloor();
  const before = JSON.stringify(floor);
  const result = splitMapArea(
    floor,
    "area0",
    [point(2, 0), point(2, 4)],
    { id: "new", name: "New" },
    () => "v0",
  );
  expect(result.ok).toBe(false);
  expect(JSON.stringify(floor)).toBe(before);
});

test("split reuses retained interior vertices along a new divider", () => {
  const floor = makeFloor();
  floor.vertices.push({ id: "retained", x: 2, y: 2 });
  const result = unwrap(split(floor));
  expect(
    result.areas.every((area) => area.vertexIds.includes("retained")),
  ).toBe(true);
  expect(
    result.vertices.filter((vertex) => samePoint(vertex, point(2, 2))),
  ).toHaveLength(1);
});

test("combining a split restores its footprint and preserves lights using the explicit target", () => {
  const floor = unwrap(split(makeFloor()));
  floor.areas[1].target = zoneTarget;
  const before = JSON.stringify(floor);
  const result = unwrap(
    combineMapAreas(floor, ["area0", "split"], {
      id: "area0",
      name: "Living and dining",
      target: zoneTarget,
    }),
  );
  expect(result.areas).toHaveLength(1);
  expect(result.areas[0].target).toEqual(zoneTarget);
  expect(result.areas[0].name).toBe("Living and dining");
  expect(result.areas[0].id).toBe("area0");
  expect(areaSize(result)).toBe(16);
  expect(result.lights).toEqual(floor.lights);
  expect(JSON.stringify(floor)).toBe(before);
  const noTarget = unwrap(
    combineMapAreas(floor, ["area0", "split"], {
      id: "area0",
      name: "Space",
      target: null,
    }),
  );
  expect(noTarget.areas[0].target).toBeNull();
});

test("combining an L-shaped footprint preserves nodes used by neighboring rooms", () => {
  const original = makeFloor([
    rectangle(0, 0, 2, 4),
    rectangle(2, 0, 2, 2),
    rectangle(2, 2, 2, 2),
  ]);
  const result = unwrap(
    combineMapAreas(original, ["area0", "area1"], {
      id: "joined",
      name: "L room",
      target: roomTarget,
    }),
  );
  expect(result.areas).toHaveLength(2);
  expect(result.areas[0].vertexIds).toContain(vertexAt(result, 2, 2));
  expect(result.areas[1]).toEqual(original.areas[2]);
  expect(areaSize(result)).toBe(16);
});

test("combining removes former divider bends so another divider can cross their old positions", () => {
  const divided = unwrap(
    split(makeFloor(), [point(0, 1), point(2, 1), point(2, 3), point(4, 3)]),
  );
  const combined = unwrap(
    combineMapAreas(divided, ["area0", "split"], {
      id: "area0",
      name: "Living room",
      target: roomTarget,
    }),
  );
  expect(
    combined.vertices.some(
      (vertex) =>
        samePoint(vertex, point(2, 1)) || samePoint(vertex, point(2, 3)),
    ),
  ).toBe(false);
  let nextId = 0;
  const redivided = unwrap(
    splitMapArea(
      combined,
      "area0",
      [point(2, 0), point(2, 4)],
      {
        id: "split",
        name: "Dining",
      },
      () => `again${nextId++}`,
    ),
  );
  expect(redivided.areas).toHaveLength(2);
  expect(areaSize(redivided)).toBe(16);
  expect(redivided.lights).toEqual(divided.lights);
});

test("combine refuses removed locked dimensions, drops unlocked divider dimensions, and retains outer dimensions", () => {
  const floor = unwrap(split(makeFloor()));
  floor.dimensions = [
    {
      id: "outer",
      startVertexId: "v0",
      endVertexId: "v1",
      lengthMeters: 4,
      locked: true,
      verified: true,
    },
    {
      id: "divider",
      startVertexId: vertexAt(floor, 2, 0),
      endVertexId: vertexAt(floor, 2, 4),
      lengthMeters: 4,
      locked: true,
      verified: true,
    },
  ];
  const combined = { id: "area0", name: "Room", target: roomTarget };
  const rejected = combineMapAreas(floor, ["area0", "split"], combined);
  expect(rejected.ok).toBe(false);
  if (!rejected.ok)
    expect(rejected.error).toContain("Release locked dimensions");
  expect(floor.dimensions).toHaveLength(2);
  floor.dimensions[1].locked = false;
  const result = unwrap(combineMapAreas(floor, ["area0", "split"], combined));
  expect(result.dimensions).toEqual([floor.dimensions[0]]);
});

test("combine refuses disjoint rooms, corner-only joins, and unions with holes", () => {
  for (const floor of [
    makeFloor([rectangle(), rectangle(5)]),
    makeFloor([rectangle(), rectangle(4, 4)]),
    makeFloor(
      Array.from({ length: 9 }, (_, index) => index)
        .filter((index) => index !== 4)
        .map((index) => rectangle(index % 3, Math.floor(index / 3), 1, 1)),
    ),
  ]) {
    const before = JSON.stringify(floor);
    const result = combineMapAreas(
      floor,
      floor.areas.map((area) => area.id),
      { id: "joined", name: "Joined", target: null },
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(floor)).toBe(before);
  }
});

test("combine accepts mixed winding and rejects stale selections or target IDs", () => {
  const floor = makeFloor([rectangle(), rectangle(4).reverse()]);
  expect(
    combineMapAreas(floor, ["area0", "area1"], {
      id: "joined",
      name: "Joined",
      target: null,
    }).ok,
  ).toBe(true);
  for (const ids of [["area0"], ["area0", "area0"], ["area0", "missing"]])
    expect(
      combineMapAreas(floor, ids, {
        id: "joined",
        name: "Joined",
        target: null,
      }).ok,
    ).toBe(false);
  expect(
    combineMapAreas(floor, ["area0", "area1"], {
      id: "joined",
      name: "Joined",
      target: { resourceType: "room", resourceId: "legacy-id" },
    }).ok,
  ).toBe(false);
});

test("renaming changes the map label and leaves Hue links alone", () => {
  const floor = makeFloor();
  const result = renameMapArea(floor, "area0", "  Snug  ");
  const renamed = unwrap(result);
  expect(renamed.areas[0].name).toBe("Snug");
  expect(renamed.areas[0].target).toEqual(roomTarget);
  expect(floor.areas[0].name).toBe("Room 1");
  expect(renameMapArea(floor, "area0", "  ")).toEqual({
    ok: false,
    error: "Rooms need a name.",
  });
  expect(renameMapArea(floor, "missing", "Snug")).toEqual({
    ok: false,
    error: "Choose a room to rename.",
  });
  expect(renameMapArea(floor, "area0", "x".repeat(201)).ok).toBe(false);
});

test("linking points an area at an existing room or zone, or clears it", () => {
  const floor = makeFloor();
  const linked = unwrap(setMapAreaTarget(floor, "area0", zoneTarget));
  expect(linked.areas[0].target).toEqual(zoneTarget);
  const cleared = unwrap(setMapAreaTarget(linked, "area0", null));
  expect(cleared.areas[0].target).toBeNull();
  expect(
    setMapAreaTarget(floor, "area0", {
      resourceType: "room",
      resourceId: "not-a-uuid",
    }),
  ).toEqual({ ok: false, error: "Choose an existing Hue room or zone." });
  expect(setMapAreaTarget(floor, "missing", zoneTarget).ok).toBe(false);
});

test("removing an area drops its geometry but never a Hue resource", () => {
  const floor = makeFloor([rectangle(), rectangle(4, 0, 3, 4)]);
  const result = unwrap(removeMapArea(floor, "area1"));
  expect(result.areas.map((area) => area.id)).toEqual(["area0"]);
  // The corners that only belonged to the removed room are gone.
  expect(result.vertices).toHaveLength(4);
  expect(result.lights).toEqual(floor.lights);
  expect(removeMapArea(makeFloor(), "area0")).toEqual({
    ok: false,
    error: "A floor keeps at least one room.",
  });
  expect(removeMapArea(floor, "missing").ok).toBe(false);
});
