import { Button } from "@/components/ui/button";
import type {
  HueEntertainmentConfiguration,
  HueEntertainmentService,
  HueLight,
} from "@/types/hue";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Move3d, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EditableResourceRow } from "../components/EditableResourceRow";
import { EmptyText } from "../components/EmptyText";
import { Panel } from "../components/Panel";
import {
  entertainmentAreaLightIds,
  entertainmentCapabilities,
} from "../entertainment";
import type { DeleteResource, RenameResource } from "../types";

export const EntertainmentAreasTab = ({ lights }: { lights: HueLight[] }) => {
  const navigate = useNavigate();
  const [areas, setAreas] = useState<HueEntertainmentConfiguration[]>([]);
  const [services, setServices] = useState<HueEntertainmentService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextAreas, nextServices] = await Promise.all([
        invoke<HueEntertainmentConfiguration[]>("get-hue-resource", {
          resourceType: "entertainment_configuration",
          id: null,
        }),
        invoke<HueEntertainmentService[]>("get-hue-resource", {
          resourceType: "entertainment",
          id: null,
        }),
      ]);
      setAreas(nextAreas);
      setServices(nextServices);
    } catch (loadError) {
      setError(String(loadError) || "Unable to load entertainment areas.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const capabilities = useMemo(
    () => entertainmentCapabilities(lights, services),
    [lights, services],
  );

  const rename: RenameResource = async (
    _resourceType,
    id: string,
    name: string,
  ) => {
    await invoke("update-hue-resource", {
      resourceType: "entertainment_configuration",
      id,
      body: { metadata: { name } },
    });
    await load();
    toast.success("Name updated");
  };

  const remove: DeleteResource = async (_resourceType, id: string) => {
    await invoke("delete-hue-resource", {
      resourceType: "entertainment_configuration",
      id,
    });
    await load();
    toast.success("Entertainment area deleted");
  };

  return (
    <Panel
      title="Entertainment Areas"
      contentClassName="min-w-0 overflow-hidden"
      action={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh entertainment areas"
          disabled={isLoading}
          onClick={() => void load()}
        >
          <RefreshCw className={isLoading ? "animate-spin" : undefined} />
        </Button>
      }
    >
      {isLoading && areas.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading entertainment areas
        </div>
      ) : error ? (
        <div className="space-y-3 py-4 text-center">
          <p className="text-sm text-(--destructive-text)">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
          >
            Try again
          </Button>
        </div>
      ) : areas.length === 0 ? (
        <EmptyText>No entertainment areas yet.</EmptyText>
      ) : (
        <div className="grid min-w-0 gap-3">
          {areas.map((area) => {
            const lightCount = entertainmentAreaLightIds(
              area,
              capabilities,
            ).length;
            return (
              <EditableResourceRow
                key={area.id}
                id={area.id}
                resourceType="entertainment_configuration"
                name={area.metadata.name}
                eyebrow="Entertainment area"
                meta={[
                  formatConfigurationType(area.configuration_type),
                  `${lightCount} ${lightCount === 1 ? "light" : "lights"}`,
                  area.status === "active" ? "Syncing" : "Inactive",
                ]}
                onRename={rename}
                onDelete={remove}
                deleteDescription={`Delete entertainment area "${area.metadata.name}" from the bridge.`}
                actions={
                  <Button
                    type="button"
                    size="default"
                    variant="outline"
                    className="gap-2"
                    aria-label={`Edit light placement for ${area.metadata.name}`}
                    title="Edit light placement"
                    onClick={() =>
                      void navigate({
                        to: "/settings/entertainment-placement/$areaId",
                        params: { areaId: area.id },
                        search: { from: undefined },
                      })
                    }
                  >
                    <Move3d />
                    Edit placement
                  </Button>
                }
              />
            );
          })}
        </div>
      )}
    </Panel>
  );
};

const formatConfigurationType = (
  type: HueEntertainmentConfiguration["configuration_type"],
) => {
  switch (type) {
    case "screen":
      return "TV";
    case "monitor":
      return "Monitor";
    case "music":
      return "Music";
    case "3dspace":
      return "3D space";
    default:
      return "Other";
  }
};
