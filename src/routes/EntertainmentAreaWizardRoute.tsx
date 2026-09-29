import { EntertainmentAreaWizard } from "@/features/settings-screen/components/EntertainmentAreaWizard";
import { createEntertainmentConfigurationBody } from "@/features/settings-screen/entertainment";
import { saveTvAspectRatio } from "@/features/entertainment-placement/tv-display";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueEntertainmentService } from "@/types/hue";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const EntertainmentAreaWizardRoute: React.FC = () => {
  const navigate = useNavigate();
  const { from } = useSearch({ from: "/settings/entertainment-wizard" });
  const lights = useHueResourcesStore((state) => state.lights);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const resourcesLoading = useHueResourcesStore((state) => state.isLoading);
  const [services, setServices] = useState<HueEntertainmentService[]>([]);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(true);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void invoke<HueEntertainmentService[]>("get-hue-resource", {
      resourceType: "entertainment",
      id: null,
    })
      .then((nextServices) => {
        if (active) setServices(nextServices);
      })
      .catch((error) => {
        if (active) {
          setCapabilityError(
            String(error) || "Unable to check entertainment capabilities.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingCapabilities(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <EntertainmentAreaWizard
      lights={lights}
      services={services}
      roomZones={roomZones}
      isLoadingCapabilities={isLoadingCapabilities || resourcesLoading}
      capabilityError={capabilityError}
      isCreating={isCreating}
      onCreate={({
        name,
        configurationType,
        capabilities,
        placements,
        tvAspectRatio,
      }) => {
        if (isCreating) return;
        setIsCreating(true);
        const body = createEntertainmentConfigurationBody({
          name,
          configurationType,
          capabilities,
          placements,
        });
        void invoke<string>("create-hue-resource", {
          resourceType: "entertainment_configuration",
          body,
        })
          .then((areaId) => {
            if (configurationType === "screen") {
              saveTvAspectRatio(areaId, tvAspectRatio);
            }
            toast.success("Entertainment area created");
            // Replace the finished wizard so Back doesn't reopen it.
            void navigate(
              from === "sync"
                ? { to: "/sync", search: { source: undefined }, replace: true }
                : {
                    to: "/settings",
                    search: { tab: "entertainment" },
                    replace: true,
                  },
            );
          })
          .catch((error) => {
            toast.error(
              String(error) || "Unable to create entertainment area.",
            );
            setIsCreating(false);
          });
      }}
    />
  );
};
