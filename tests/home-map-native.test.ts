import { expect, test } from "bun:test";
import {
  createNativeHomeMapPort,
  type HomeMapInvoke,
} from "../src/features/home-map/native";
import { createHomeMapRepository } from "../src/features/home-map/storage";

const encoded = (bridgeId = "bridge-one", name = "Home") =>
  JSON.stringify({
    schemaVersion: 1,
    bridgeId,
    published: null,
    draft: {
      schemaVersion: 1,
      bridgeId,
      id: "map",
      name,
      drawingMode: "sketch",
      units: "metric",
      floors: [
        {
          id: "ground",
          name: "Ground floor",
          vertices: [],
          areas: [],
          dimensions: [],
          lights: [],
        },
      ],
    },
  });

function backend() {
  const files = new Map<string, string>();
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  let fail = false;
  const call: HomeMapInvoke = async <T>(
    command: "read-home-map" | "write-home-map",
    args: { bridgeId: string; value?: string; expected?: string | null },
  ) => {
    calls.push({ command, args });
    if (command === "read-home-map")
      return (files.get(args.bridgeId) ?? null) as T;
    if (fail) throw new Error("Disk unavailable");
    if ((files.get(args.bridgeId) ?? null) !== args.expected)
      throw new Error("Map changed in another window");
    files.set(args.bridgeId, args.value!);
    return undefined as T;
  };
  return {
    files,
    calls,
    call,
    setFailure: (value: boolean) => {
      fail = value;
    },
  };
}

test("native adapter uses explicit commands, bridge IDs and last successful bytes", async () => {
  const disk = backend();
  const port = createNativeHomeMapPort(disk.call, () => true);
  expect(await port.read("bridge-one")).toBeNull();
  await port.write("bridge-one", encoded());
  await port.write("bridge-one", encoded("bridge-one", "Changed"));
  expect(disk.calls[1]).toEqual({
    command: "write-home-map",
    args: { bridgeId: "bridge-one", value: encoded(), expected: null },
  });
  expect(disk.calls[2].args.expected).toBe(encoded());
});

test("desktop absence reports unavailable without browser fallback", async () => {
  const disk = backend();
  const repository = createHomeMapRepository(
    createNativeHomeMapPort(disk.call, () => false),
  );
  expect(await repository.load("bridge-one")).toMatchObject({
    status: "unavailable",
  });
  expect(disk.calls).toHaveLength(0);
});

test("unread, corrupt and future data cannot be silently replaced", async () => {
  const disk = backend();
  const port = createNativeHomeMapPort(disk.call, () => true);
  await expect(port.write("bridge-one", encoded())).rejects.toThrow("Reload");
  for (const raw of [
    "{broken",
    JSON.stringify({ schemaVersion: 2, bridgeId: "bridge-one" }),
  ]) {
    disk.files.set("bridge-one", raw);
    expect(await port.read("bridge-one")).toBe(raw);
    await expect(port.write("bridge-one", encoded())).rejects.toThrow(
      "recovery",
    );
    expect(disk.files.get("bridge-one")).toBe(raw);
  }
  expect(disk.calls.every((call) => call.command === "read-home-map")).toBe(
    true,
  );
});

test("write errors require a new read before retrying", async () => {
  const disk = backend();
  const port = createNativeHomeMapPort(disk.call, () => true);
  await port.read("bridge-one");
  disk.setFailure(true);
  await expect(port.write("bridge-one", encoded())).rejects.toThrow(
    "Disk unavailable",
  );
  disk.setFailure(false);
  await expect(port.write("bridge-one", encoded())).rejects.toThrow("Reload");
  await port.read("bridge-one");
  await port.write("bridge-one", encoded());
  expect(disk.files.get("bridge-one")).toBe(encoded());
});

test("another window's newer map is preserved and bridge baselines stay separate", async () => {
  const disk = backend();
  const first = createNativeHomeMapPort(disk.call, () => true);
  const second = createNativeHomeMapPort(disk.call, () => true);
  await first.read("bridge-one");
  await second.read("bridge-one");
  await second.write("bridge-one", encoded("bridge-one", "Newer"));
  await expect(first.write("bridge-one", encoded())).rejects.toThrow(
    "another window",
  );
  await first.read("bridge-two");
  await first.write("bridge-two", encoded("bridge-two"));
  expect(disk.files.get("bridge-one")).toBe(encoded("bridge-one", "Newer"));
  expect(disk.files.get("bridge-two")).toBe(encoded("bridge-two"));
});

test("invalid bridge payloads are rejected before native writes", async () => {
  const disk = backend();
  const port = createNativeHomeMapPort(disk.call, () => true);
  await port.read("bridge-one");
  await expect(port.write("bridge-one", encoded("bridge-two"))).rejects.toThrow(
    "valid map",
  );
  expect(disk.calls).toHaveLength(1);
});
