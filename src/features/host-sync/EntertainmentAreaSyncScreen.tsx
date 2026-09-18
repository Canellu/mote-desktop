import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SyncBoxScreen } from "@/features/sync-box/SyncBoxScreen";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Monitor, Move3d, TriangleAlert, Tv } from "lucide-react";
import { useState } from "react";
import { ProTag } from "@/features/settings-screen/components/ProTag";
import { PcSyncScreen } from "./PcSyncScreen";

const SOURCE_STORAGE_KEY = "hue-sync-hub-source";

type SyncSource = "pc" | "box";

const storedSource = (): SyncSource =>
  localStorage.getItem(SOURCE_STORAGE_KEY) === "box" ? "box" : "pc";

/**
 * One entertainment-area workspace. Placement belongs to the area while the
 * selected tab determines which engine drives it.
 */
export const EntertainmentAreaSyncScreen = ({ areaId }: { areaId: string }) => {
  const navigate = useNavigate();
  const areas = useEntertainmentStore((store) => store.areas);
  const hasLoaded = useEntertainmentStore((store) => store.hasLoaded);
  const [source, setSource] = useState<SyncSource>(storedSource);
  const area = areas.find((candidate) => candidate.id === areaId);

  if (!hasLoaded) {
    return (
      <div
        role="status"
        aria-label="Loading entertainment area"
        className="flex min-h-64 items-center justify-center"
      >
        <Loader2
          aria-hidden
          className="size-8 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  if (!area) {
    return (
      <Card className="mx-auto max-w-xl border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <TriangleAlert className="mb-4 size-8 text-muted-foreground" />
          <p className="font-medium">Entertainment area not found</p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() =>
              void navigate({ to: "/sync", search: { source: undefined } })
            }
          >
            Back to entertainment areas
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs
      value={source}
      className="mx-auto grid w-full max-w-5xl gap-5 pb-8"
      onValueChange={(value) => {
        const next = value === "box" ? "box" : "pc";
        setSource(next);
        localStorage.setItem(SOURCE_STORAGE_KEY, next);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList size="xl">
          <TabsTrigger value="pc">
            <Monitor data-icon="inline-start" />
            This PC
            <ProTag />
          </TabsTrigger>
          <TabsTrigger value="box">
            <Tv data-icon="inline-start" />
            Sync Box
          </TabsTrigger>
        </TabsList>
        <Button
          variant="outline"
          size="lg"
          className="rounded-full"
          title={`Shared by this PC and the Sync Box · ${area.lightIds.length} ${area.lightIds.length === 1 ? "light" : "lights"}`}
          onClick={() =>
            void navigate({
              to: "/settings/entertainment-placement/$areaId",
              params: { areaId },
              search: { from: "sync" },
            })
          }
        >
          <Move3d data-icon="inline-start" />
          Light placement
        </Button>
      </div>

      <TabsContent value="pc">
        <PcSyncScreen areaId={areaId} />
      </TabsContent>
      <TabsContent value="box">
        <SyncBoxScreen areaId={areaId} />
      </TabsContent>
    </Tabs>
  );
};
