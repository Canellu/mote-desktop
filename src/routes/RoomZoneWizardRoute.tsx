import { RoomZoneWizard } from "@/features/settings-screen/components/RoomZoneWizard";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueSettingsDevice, HueSettingsSummary } from "@/types/hue";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const RoomZoneWizardRoute: React.FC = () => {
  const navigate = useNavigate();
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const [devices, setDevices] = useState<HueSettingsDevice[]>([]);

  // Rooms group whole devices, so the wizard needs the bridge's device list.
  // (Lights are read from the resources store inside the wizard.) Filter out the
  // bridge itself — it isn't a placeable member.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const summary = await invoke<HueSettingsSummary>(
          "get-hue-settings-summary",
        );
        if (active) {
          setDevices(
            summary.devices.filter(
              (device) => !device.serviceTypes.includes("bridge"),
            ),
          );
        }
      } catch {
        // Non-fatal: the wizard still works for zones (lights come from the
        // store), and dev builds fall back to placeholder devices.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Back-out is handled by the global AppHeader's top-left back control
  // (RootLayout wires it to settings → Rooms & Zones tab).
  return (
    <RoomZoneWizard
      devices={devices}
      onCreate={({ resourceType, name, archetype, memberIds }) => {
        void (async () => {
          try {
            if (resourceType === "room") {
              await invoke("create-hue-room", {
                name,
                archetype,
                deviceIds: memberIds,
              });
            } else {
              await invoke("create-hue-zone", {
                name,
                archetype,
                lightIds: memberIds,
              });
            }
            await loadAll();
            toast.success(
              `${resourceType === "room" ? "Room" : "Zone"} created`,
            );
            void navigate({ to: "/settings", search: { tab: "spaces" } });
          } catch (error) {
            toast.error(String(error) || `Unable to create ${resourceType}.`);
          }
        })();
      }}
    />
  );
};
