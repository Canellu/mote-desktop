import { lazy, Suspense, useState } from "react";
import { Map as MapIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HueRoomZone } from "@/types/hue";
import { CreateMapWizard } from "./components/CreateMapWizard";
import { DraftReviewBar } from "./components/DraftReviewBar";
import {
  isUnresolved,
  reconcileOperations,
  removeOperation,
  runQueuedOperations,
  queueOperation,
  type QueuedHueOperation,
} from "./hueOperations";
import { createHueOperationRunner } from "./hueRunner";
import { HomeMapScreen } from "./HomeMapScreen";
import type { HomeMapDocument, MapFloor } from "./types";
import { useHomeMapStore, homeMapStore } from "./useHomeMapStore";
import { useMapLighting } from "./useMapLighting";

const Preview = import.meta.env.DEV
  ? lazy(() => import("./HomeMapPreview"))
  : null;

export function HomeMapView({
  bridgeId,
  floorId,
  areaId,
  preview,
  roomZones,
  onSelect,
  onOpenSpace,
  onPreview,
  onDashboard,
}: {
  bridgeId: string | null;
  floorId?: string;
  areaId?: string;
  preview: boolean;
  roomZones: HueRoomZone[];
  onSelect: (floorId: string, areaId: string | null) => void;
  onOpenSpace: (id: string) => void;
  onPreview: () => void;
  onDashboard: () => void;
}) {
  const lighting = useMapLighting(bridgeId);
  const entry = useHomeMapStore((state) =>
    bridgeId ? state.entries[bridgeId] : undefined,
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hueQueue, setHueQueue] = useState<QueuedHueOperation[]>([]);
  const [hueRunning, setHueRunning] = useState(false);
  const draft = entry?.draftState?.draft ?? null;
  const published = entry?.draftState?.published ?? null;
  // A draft is the working copy; it hides the published map until resolved.
  const map = draft ?? published;
  const loading = bridgeId !== null && (!entry || entry.status === "loading");
  const ready = entry?.status === "ready";

  async function create(document: HomeMapDocument) {
    if (!bridgeId) return;
    setSaving(true);
    setCreateError(null);
    const result = await homeMapStore.getState().applyEdit(bridgeId, document);
    setSaving(false);
    if (result.ok) {
      setCreating(false);
      onSelect(document.floors[0].id, document.floors[0].areas[0].id);
    } else setCreateError(result.error);
  }

  /**
   * Save is the commit point: reviewed Hue changes run first, their results
   * are folded into the draft, and the map publishes only once none remain.
   */
  async function saveMap() {
    if (!bridgeId || !map) return;
    if (hueQueue.some(isUnresolved)) {
      setHueRunning(true);
      const results = await runQueuedOperations(
        hueQueue,
        createHueOperationRunner(roomZones),
      );
      setHueQueue(results);
      setHueRunning(false);
      lighting.onRefresh?.();
      const reconciled = reconcileOperations(map, results);
      if (JSON.stringify(reconciled) !== JSON.stringify(map)) {
        const applied = await homeMapStore
          .getState()
          .applyEdit(bridgeId, reconciled);
        if (!applied.ok) return;
      }
      // Successful resources already exist in Hue and are kept either way.
      if (results.some(isUnresolved)) return;
    }
    await homeMapStore.getState().publish(bridgeId);
  }

  if (preview && Preview)
    return (
      <Suspense fallback={<p role="status">Loading example map…</p>}>
        <Preview floorId={floorId} areaId={areaId} onSelect={onSelect} />
      </Suspense>
    );
  if (creating && bridgeId && ready)
    return (
      <CreateMapWizard
        bridgeId={bridgeId}
        busy={saving}
        error={createError}
        onCreate={(document) => void create(document)}
        onCancel={() => {
          setCreateError(null);
          setCreating(false);
        }}
      />
    );
  function editFloor(next: MapFloor) {
    if (!bridgeId || !map) return;
    void homeMapStore.getState().applyEdit(bridgeId, {
      ...map,
      floors: map.floors.map((entry) => (entry.id === next.id ? next : entry)),
    });
  }

  if (map && ready && bridgeId)
    return (
      <>
        {draft && entry && (
          <DraftReviewBar
            entry={entry}
            hasPublished={published !== null}
            onSave={() => void saveMap()}
            hueChangeCount={hueQueue.filter(isUnresolved).length}
            hueRunning={hueRunning}
            onDiscard={() => {
              // Unsent changes refer to draft rooms; committed ones stay.
              setHueQueue((current) =>
                current.filter((entry) => entry.status.state === "done"),
              );
              void homeMapStore.getState().discard(bridgeId);
            }}
            onRetrySave={() => void homeMapStore.getState().retrySave(bridgeId)}
          />
        )}
        <HomeMapScreen
          key={map.id}
          map={map}
          selectedFloorId={floorId}
          selectedAreaId={areaId}
          roomZones={roomZones}
          lighting={lighting}
          onSelect={onSelect}
          onOpenSpace={onOpenSpace}
          onEditFloor={editFloor}
          onEditMap={(next) => {
            if (bridgeId)
              void homeMapStore.getState().applyEdit(bridgeId, next);
          }}
          onUndo={() => void homeMapStore.getState().undo(bridgeId)}
          hueQueue={hueQueue}
          hueRunning={hueRunning}
          onQueueHueOperation={(operation) => {
            const queued = queueOperation(hueQueue, operation);
            if (!queued.ok) return queued.error;
            setHueQueue(queued.value);
            return null;
          }}
          onRemoveHueOperation={(id) =>
            setHueQueue((current) => removeOperation(current, id))
          }
          canUndo={(entry?.draftState?.past.length ?? 0) > 0}
          busy={entry?.saving ?? false}
        />
      </>
    );

  const failed = entry?.status === "invalid" || entry?.status === "unavailable";
  return (
    <section
      className="flex min-h-[440px] flex-col items-center justify-center px-6 py-14 text-center"
      aria-label="Home map"
    >
      {loading ? (
        <Loader2 className="mb-6 size-9 animate-spin text-muted-foreground motion-reduce:animate-none" />
      ) : (
        <MapIcon
          className="mb-6 size-10 text-muted-foreground"
          strokeWidth={1.5}
        />
      )}
      <h2 className="text-2xl font-medium">
        {loading
          ? "Loading your map"
          : failed
            ? "Could not open this map"
            : "No home map yet"}
      </h2>
      <p
        role={failed ? "alert" : "status"}
        className="mt-3 max-w-lg break-words text-sm leading-relaxed text-muted-foreground"
      >
        {loading
          ? "Getting the saved floor plan for this bridge."
          : failed
            ? entry.error
            : "Draw the outline of one floor to start using Map. Your rooms and lights stay available in Dashboard."}
      </p>
      {!loading && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {failed && bridgeId && (
            <Button
              onClick={() => void homeMapStore.getState().retryLoad(bridgeId)}
            >
              Retry
            </Button>
          )}
          {!failed && bridgeId && ready && (
            <Button onClick={() => setCreating(true)}>Create map</Button>
          )}
          <Button variant="outline" onClick={onDashboard}>
            Back to dashboard
          </Button>
          {import.meta.env.DEV && (
            <Button variant="secondary" onClick={onPreview}>
              Preview example map
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
