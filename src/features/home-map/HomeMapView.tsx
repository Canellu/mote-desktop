import { lazy, Suspense } from "react";
import { Map as MapIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HueRoomZone } from "@/types/hue";
import { HomeMapScreen } from "./HomeMapScreen";
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
  const map = entry?.draftState?.published;
  const loading = bridgeId !== null && (!entry || entry.status === "loading");
  if (preview && Preview)
    return (
      <Suspense fallback={<p role="status">Loading example map…</p>}>
        <Preview floorId={floorId} areaId={areaId} onSelect={onSelect} />
      </Suspense>
    );
  if (map && entry?.status === "ready")
    return (
      <HomeMapScreen
        key={map.id}
        map={map}
        selectedFloorId={floorId}
        selectedAreaId={areaId}
        roomZones={roomZones}
        lighting={lighting}
        onSelect={onSelect}
        onOpenSpace={onOpenSpace}
      />
    );

  const failed = entry?.status === "invalid" || entry?.status === "unavailable";
  const hasDraft = entry?.draftState?.draft != null;
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
            : hasDraft
              ? "Your map is saved as a draft"
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
            : hasDraft
              ? "Your draft is safe. A published floor plan will appear here."
              : "There is no saved floor plan for this bridge. Your rooms and lights are available in Dashboard."}
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
