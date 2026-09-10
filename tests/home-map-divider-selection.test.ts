import { describe, expect, test } from "bun:test";
import {
  chooseDividerArea,
  chooseDividerAreaFromDirection,
  dividerAreasAtPoint,
} from "../src/features/home-map/dividerSelection";

const areas = [
  {
    id: "room-left",
    ring: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ],
  },
  {
    id: "room-right",
    ring: [
      { x: 4, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 4, y: 4 },
    ],
  },
];

describe("divider room selection", () => {
  test("chooses the room on the pointer side of a shared wall", () => {
    expect(chooseDividerArea(areas, { x: 4, y: 2 }, { x: 3.9, y: 2 })).toBe(
      "room-left",
    );
    expect(chooseDividerArea(areas, { x: 4, y: 2 }, { x: 4.1, y: 2 })).toBe(
      "room-right",
    );
  });

  test("chooses the only room touching an outside wall", () => {
    expect(chooseDividerArea(areas, { x: 0, y: 2 }, { x: -0.1, y: 2 })).toBe(
      "room-left",
    );
  });

  test("uses the current room when the pointer is exactly on the wall", () => {
    expect(
      chooseDividerArea(areas, { x: 4, y: 2 }, { x: 4, y: 2 }, "room-right"),
    ).toBe("room-right");
  });

  test("changes an ambiguous shared-wall start to match divider direction", () => {
    const start = { x: 4, y: 2 };
    const candidates = dividerAreasAtPoint(areas, start);

    expect(
      chooseDividerAreaFromDirection(
        candidates,
        start,
        { x: 6, y: 3 },
        "room-left",
      ),
    ).toBe("room-right");
    expect(
      chooseDividerAreaFromDirection(
        candidates,
        start,
        { x: 2, y: 3 },
        "room-right",
      ),
    ).toBe("room-left");
  });
});
