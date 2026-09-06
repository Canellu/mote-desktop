import { distance, pointOnSegment, samePoint } from "./geometry";
import type { HomeMapDocument, MapFloor, MapPoint } from "./types";

/** Synthetic geometry for the explicit development preview. Never persisted. */
function sampleFloor(
  id: string,
  name: string,
  rooms: [string, number, number, number, number][],
): MapFloor {
  const rings = rooms.map(([, x, y, w, h]) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]);
  const points: MapPoint[] = [];
  rings.flat().forEach((point) => {
    if (!points.some((other) => samePoint(point, other))) points.push(point);
  });
  const vertices = points.map((point, index) => ({
    ...point,
    id: `${id}-v${index}`,
  }));
  return {
    id,
    name,
    vertices,
    areas: rooms.map(([roomName], index) => ({
      id: `${id}-room-${index}`,
      name: roomName,
      target: null,
      vertexIds: rings[index].flatMap((point, i, ring) =>
        vertices
          .filter(
            (vertex) =>
              !samePoint(vertex, ring[(i + 1) % ring.length]) &&
              pointOnSegment(vertex, point, ring[(i + 1) % ring.length]),
          )
          .sort((a, b) => distance(point, a) - distance(point, b))
          .map((vertex) => vertex.id),
      ),
    })),
    dimensions: [
      {
        id: `${id}-width`,
        startVertexId: vertices[0].id,
        endVertexId: vertices[1].id,
        lengthMeters: rooms[0][3],
        locked: false,
        verified: false,
      },
    ],
    lights: rooms.flatMap(([, x, y, w, h], index) => [
      {
        lightId: `00000000-0000-0000-${id === "ground" ? "0001" : "0002"}-${String(index * 2 + 1).padStart(12, "0")}`,
        x: x + w * 0.25,
        y: y + h * 0.25,
      },
      {
        lightId: `00000000-0000-0000-${id === "ground" ? "0001" : "0002"}-${String(index * 2 + 2).padStart(12, "0")}`,
        x: x + w * 0.75,
        y: y + h * 0.75,
      },
    ]),
  };
}

export const sampleHomeMap: HomeMapDocument = {
  schemaVersion: 1,
  id: "sample-home-map",
  bridgeId: "sample-bridge",
  name: "Example home",
  drawingMode: "sketch",
  units: "metric",
  floors: [
    sampleFloor("ground", "Ground floor", [
      ["Living room", 0, 0, 6, 5],
      ["Kitchen", 6, 0, 4, 3],
      ["Dining", 6, 3, 4, 2],
      ["Hallway", 0, 5, 10, 2],
      ["Bedroom", 0, 7, 6, 4],
      ["Bathroom", 6, 7, 4, 4],
    ]),
    sampleFloor("upstairs", "Upstairs", [
      ["Office", 0, 0, 5, 4],
      ["Guest room", 5, 0, 5, 4],
      ["Landing", 0, 4, 10, 2],
    ]),
  ],
};
