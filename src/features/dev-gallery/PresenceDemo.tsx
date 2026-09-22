import { useState } from "react";
import type {
  PresenceSettings,
  PresenceStatus,
} from "@/features/automations/presence";
import { PresenceEditor } from "@/features/automations/components/PresenceEditor";
import { demoLightGroups, demoScenes } from "./demoHome";

const initialSettings: PresenceSettings = {
  enabled: true,
  bridgeId: "demo",
  devices: [
    {
      id: "alex",
      name: "Alex's phone",
      ip: "192.168.1.42",
      mac: "aa:bb:cc:dd:ee:01",
      enabled: true,
    },
    {
      id: "sam",
      name: "Sam's phone",
      ip: "192.168.1.43",
      mac: null,
      enabled: true,
    },
  ],
  arrivalScene: { id: "demo-scene-3", name: "Relax" },
  departureTargets: [{ kind: "room", id: "demo-living", name: "Living room" }],
};

/**
 * Presence with two phones, one home and one not seen for a while. Editing
 * reaches for the backend and does nothing here.
 */
export function PresenceDemo() {
  const [settings, setSettings] = useState(initialSettings);
  const now = Date.now();
  const status: PresenceStatus = {
    running: true,
    occupancy: "home",
    devices: [
      {
        id: "alex",
        seen: true,
        evidence: "neighbor",
        lastSeenAt: now,
        conflict: false,
      },
      {
        id: "sam",
        seen: false,
        evidence: null,
        lastSeenAt: now - 25 * 60_000,
        conflict: false,
      },
    ],
    awayAt: null,
    network: true,
    lastAction: {
      kind: "arrival",
      at: now - 3 * 3_600_000,
      failed: 0,
      error: null,
    },
  };
  return (
    <PresenceEditor
      settings={settings}
      status={status}
      lightGroups={demoLightGroups}
      scenes={demoScenes}
      bridgeId="demo"
      hasPro
      onSettingsChange={setSettings}
    />
  );
}
