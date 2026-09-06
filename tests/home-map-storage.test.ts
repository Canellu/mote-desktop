import { expect, test } from "bun:test";
import {
  createHomeMapRepository,
  decodeHomeMapStorage,
  encodeHomeMapStorage,
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

function envelope(
  name = "Draft",
  bridgeId = "bridge-one",
): HomeMapStorageEnvelope {
  return {
    schemaVersion: 1,
    bridgeId,
    published: document("Published", bridgeId),
    draft: document(name, bridgeId),
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("versioned storage preserves draft and published documents separately", () => {
  const input = envelope();
  const encoded = encodeHomeMapStorage(input, "bridge-one");
  if (!encoded.ok) throw new Error(encoded.error);
  input.draft!.name = "Changed later";
  const decoded = decodeHomeMapStorage(encoded.value, "bridge-one");
  expect(decoded.status).toBe("ready");
  if (decoded.status !== "ready") throw new Error("Expected ready storage");
  expect(decoded.value.published?.name).toBe("Published");
  expect(decoded.value.draft?.name).toBe("Draft");
  decoded.value.draft!.floors[0].vertices[0].x = 42;
  expect(decoded.value.published?.floors[0].vertices[0].x).toBe(0);
});

test("missing, malformed, unsupported, and future storage remain distinguishable", () => {
  expect(decodeHomeMapStorage(null, "bridge-one")).toEqual({
    status: "missing",
  });
  for (const [raw, code] of [
    ["{broken", "malformed"],
    ["null", "malformed"],
    [
      JSON.stringify({ ...envelope(), schemaVersion: 0 }),
      "unsupported-version",
    ],
    [JSON.stringify({ ...envelope(), schemaVersion: 2 }), "future-version"],
  ]) {
    expect(decodeHomeMapStorage(raw, "bridge-one")).toMatchObject({
      status: "invalid",
      code,
      raw,
    });
  }
  const empty: HomeMapStorageEnvelope = {
    schemaVersion: 1,
    bridgeId: "bridge-one",
    published: null,
    draft: null,
  };
  expect(decodeHomeMapStorage(JSON.stringify(empty), "bridge-one").status).toBe(
    "ready",
  );
});

test("codecs reject broken geometry, mismatched maps, and wrong bridge data", () => {
  const invalid = envelope();
  invalid.draft!.floors[0].areas[0].vertexIds = ["a", "c", "b", "d"];
  expect(
    decodeHomeMapStorage(JSON.stringify(invalid), "bridge-one"),
  ).toMatchObject({ status: "invalid", code: "invalid-document" });
  expect(encodeHomeMapStorage(invalid, "bridge-one").ok).toBe(false);
  expect(
    decodeHomeMapStorage(JSON.stringify(envelope()), "bridge-two"),
  ).toMatchObject({ status: "invalid", code: "bridge-mismatch" });
  const wrongBridge = envelope();
  wrongBridge.draft!.bridgeId = "bridge-two";
  expect(
    decodeHomeMapStorage(JSON.stringify(wrongBridge), "bridge-one"),
  ).toMatchObject({ status: "invalid", code: "bridge-mismatch" });
  const wrongMap = envelope();
  wrongMap.draft!.id = "map-two";
  expect(
    decodeHomeMapStorage(JSON.stringify(wrongMap), "bridge-one"),
  ).toMatchObject({ status: "invalid", code: "map-mismatch" });
});

test("read failures and corrupt storage never trigger an empty replacement write", async () => {
  let fail = true;
  let writes = 0;
  const raw = JSON.stringify({ ...envelope(), schemaVersion: 9 });
  const repository = createHomeMapRepository({
    async read() {
      if (fail) throw new Error("Disk unavailable");
      return raw;
    },
    async write() {
      writes += 1;
    },
  });
  expect(await repository.load("bridge-one")).toEqual({
    status: "unavailable",
    error: "Disk unavailable",
  });
  fail = false;
  expect(await repository.load("bridge-one")).toMatchObject({
    status: "invalid",
    code: "future-version",
    raw,
  });
  expect(writes).toBe(0);
});

test("serialized autosaves preserve submission order and snapshot queued inputs", async () => {
  const firstStarted = deferred();
  const releaseFirst = deferred();
  const writes: string[] = [];
  let stored: string | null = null;
  const repository = createHomeMapRepository({
    async read() {
      return stored;
    },
    async write(_bridgeId, raw) {
      writes.push(JSON.parse(raw).draft.name);
      if (writes.length === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      stored = raw;
    },
  });
  const first = repository.save("bridge-one", envelope("First"));
  await firstStarted.promise;
  const input = envelope("Second");
  const second = repository.save("bridge-one", input);
  input.draft!.name = "Caller mutation";
  const loaded = repository.load("bridge-one");
  expect(writes).toEqual(["First"]);
  releaseFirst.resolve();
  await Promise.all([first, second]);
  expect(writes).toEqual(["First", "Second"]);
  expect(await loaded).toMatchObject({
    status: "ready",
    value: { draft: { name: "Second" } },
  });
});

test("a failed write rejects its save and queued retry can recover", async () => {
  let attempts = 0;
  let stored: string | null = null;
  const repository = createHomeMapRepository({
    async read() {
      return stored;
    },
    async write(_bridgeId, raw) {
      attempts += 1;
      if (attempts === 1) throw new Error("Disk full");
      stored = raw;
    },
  });
  const first = repository.save("bridge-one", envelope("Failed"));
  const retry = repository.save("bridge-one", envelope("Retry"));
  await expect(first).rejects.toThrow("Disk full");
  await retry;
  expect(await repository.load("bridge-one")).toMatchObject({
    status: "ready",
    value: { draft: { name: "Retry" } },
  });
  const invalid = envelope();
  invalid.draft!.floors[0].vertices[0].x = Number.NaN;
  await expect(repository.save("bridge-one", invalid)).rejects.toThrow();
  expect(attempts).toBe(2);
});

test("one bridge's pending save neither blocks nor overwrites another bridge", async () => {
  const started = deferred();
  const release = deferred();
  const stored = new Map<string, string>();
  const repository = createHomeMapRepository({
    async read(bridgeId) {
      return stored.get(bridgeId) ?? null;
    },
    async write(bridgeId, raw) {
      if (bridgeId === "bridge-one") {
        started.resolve();
        await release.promise;
      }
      stored.set(bridgeId, raw);
    },
  });
  const first = repository.save("bridge-one", envelope("One"));
  await started.promise;
  await repository.save("bridge-two", envelope("Two", "bridge-two"));
  expect(await repository.load("bridge-two")).toMatchObject({
    status: "ready",
    value: { bridgeId: "bridge-two", draft: { name: "Two" } },
  });
  expect(stored.has("bridge-one")).toBe(false);
  release.resolve();
  await first;
  expect(await repository.load("bridge-one")).toMatchObject({
    status: "ready",
    value: { draft: { name: "One" } },
  });
});
