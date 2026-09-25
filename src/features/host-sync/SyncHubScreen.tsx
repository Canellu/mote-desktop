import { SyncIndicator } from "@/components/SyncIndicator";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SyncBoxScreen } from "@/features/sync-box/SyncBoxScreen";
import { cn } from "@/lib/utils";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Cuboid,
  LampDesk,
  Loader2,
  Monitor,
  MonitorPlay,
  Music2,
  Tv,
} from "lucide-react";

const AREA_TYPE_DETAILS = {
  screen: { label: "TV", Icon: Tv },
  monitor: { label: "Monitor", Icon: Monitor },
  music: { label: "Music", Icon: Music2 },
  "3dspace": { label: "3D space", Icon: Cuboid },
  other: { label: "Entertainment", Icon: MonitorPlay },
} as const;

/** One area picker shared by every entertainment sync source. */
export const SyncHubScreen = ({ source }: { source?: "box" }) => {
  const navigate = useNavigate();
  const areas = useEntertainmentStore((store) => store.areas);
  const hasLoaded = useEntertainmentStore((store) => store.hasLoaded);
  const pcStatus = useEntertainmentStore((store) => store.pcStatus);
  const loadAreas = useEntertainmentStore((store) => store.load);
  const boxState = useSyncBoxStore((store) => store.state);

  if (source === "box") {
    return <SyncBoxScreen setupOnly />;
  }

  if (!hasLoaded) {
    return (
      <div
        role="status"
        aria-label="Loading entertainment areas"
        className="flex min-h-64 items-center justify-center"
      >
        <Loader2
          aria-hidden
          className="size-8 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 pb-8">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Entertainment areas
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose an area, then decide whether this PC or the HDMI Sync Box
          drives its lights.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => {
          const active = area.status === "active";
          const areaType =
            AREA_TYPE_DETAILS[area.configurationType] ??
            AREA_TYPE_DETAILS.other;
          const AreaIcon = areaType.Icon;
          const ownedByPc =
            pcStatus.areaId === area.id &&
            (pcStatus.state === "running" || pcStatus.state === "starting");
          const boxGroup = boxState
            ? Object.entries(boxState.hue.groups).find(
                ([id, group]) =>
                  (id === area.id ||
                    group.name.trim().toLocaleLowerCase() ===
                      area.name.trim().toLocaleLowerCase()) &&
                  boxState.execution.syncActive &&
                  boxState.execution.hueTarget === id,
              )
            : undefined;
          const externalOwner = boxState
            ? Object.values(boxState.hue.groups).find(
                (group) =>
                  group.active &&
                  group.name.trim().toLocaleLowerCase() ===
                    area.name.trim().toLocaleLowerCase(),
              )?.owner
            : undefined;
          const owner = ownedByPc
            ? "this PC"
            : boxGroup
              ? boxState?.device.name || "the Sync Box"
              : (externalOwner ?? "another app");

          return (
            <Card
              key={area.id}
              size="sm"
              role="button"
              tabIndex={0}
              onClick={() =>
                void navigate({
                  to: "/sync/$areaId",
                  params: { areaId: area.id },
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void navigate({
                    to: "/sync/$areaId",
                    params: { areaId: area.id },
                  });
                }
              }}
              aria-label={`Open ${area.name}, ${areaType.label}, ${area.lightIds.length} ${
                area.lightIds.length === 1 ? "light" : "lights"
              }${active ? `, syncing with ${owner}` : ""}`}
              className="group relative min-h-60 cursor-pointer items-center justify-center gap-0 border border-tile-border bg-tile-off px-5 py-6 text-center outline-none transition-[transform,background-color,border-color,box-shadow] hover:-translate-y-0.5 hover:border-foreground/15 hover:bg-accent/70 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring"
            >
              {active && (
                <div className="absolute right-4 top-4">
                  <SyncIndicator
                    syncedCount={area.lightIds.length}
                    totalCount={area.lightIds.length}
                  />
                </div>
              )}

              <div
                className={cn(
                  "mb-4 flex size-14 items-center justify-center rounded-2xl bg-background/70 text-muted-foreground ring-1 ring-border/60 transition-transform group-hover:scale-105",
                  active && "bg-primary/12 text-primary ring-primary/20",
                )}
              >
                <AreaIcon size={27} strokeWidth={2.2} />
              </div>

              <p className="max-w-full truncate text-lg font-semibold">
                {area.name}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                <span>{areaType.label}</span>
                <span aria-hidden className="size-1 rounded-full bg-border" />
                <span>
                  {area.lightIds.length}{" "}
                  {area.lightIds.length === 1 ? "light" : "lights"}
                </span>
              </div>

              <p
                className={cn(
                  "mt-4 rounded-full bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/60",
                  active && "bg-primary/10 text-primary ring-primary/20",
                )}
              >
                {active ? `Syncing with ${owner}` : "Ready to sync"}
              </p>

              <div className="mt-5 flex w-full items-center justify-center gap-1 border-t border-border/60 pt-4 text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                <span>Choose sync source</span>
                <ChevronRight
                  aria-hidden
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </div>
            </Card>
          );
        })}
      </div>

      {areas.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
            <LampDesk className="mb-4 size-8 text-muted-foreground" />
            <p className="font-medium">No entertainment areas found</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create an entertainment area to choose its lights and placement.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <Button
                onClick={() =>
                  void navigate({
                    to: "/settings/entertainment-wizard",
                    search: { from: "sync" },
                  })
                }
              >
                Create area
              </Button>
              <Button variant="outline" onClick={() => void loadAreas()}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
