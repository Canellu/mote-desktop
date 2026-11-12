import { useEffect } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import type { AutomationKind } from "@/features/automations/editor-model";
import {
  isAwayConfigured,
  isOnAirConfigured,
  isPresenceConfigured,
} from "@/features/automations/presentation";
import {
  loadAutomations,
  useAutomationStore,
} from "@/features/automations/store";
import {
  loadPresence,
  usePresenceStore,
} from "@/features/automations/presence";
import {
  loadCalendar,
  useCalendarStore,
} from "@/features/automations/calendar";
import { useLightGroups } from "@/features/automations/useLightGroups";
import { AutomationWizard } from "@/features/automations/components/AutomationWizard";

export function AutomationWizardRoute() {
  const navigate = useNavigate();
  const router = useRouter();
  const { hasPro } = useEntitlements();
  const { bridgeId } = useHue();
  const { lightGroups, sceneOptions } = useLightGroups();
  const settings = useAutomationStore((state) => state.settings);
  const status = useAutomationStore((state) => state.status);
  const loadError = useAutomationStore((state) => state.loadError);
  const presence = usePresenceStore((state) => state.settings);
  const presenceStatus = usePresenceStore((state) => state.status);
  const calendar = useCalendarStore((state) => state.settings);
  const calendarStatus = useCalendarStore((state) => state.status);
  useEffect(() => {
    void loadAutomations();
    void loadPresence();
    void loadCalendar();
  }, []);
  if (!settings)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {loadError ?? "Loading automations…"}
      </p>
    );
  const configured = new Set<AutomationKind>();
  if (isOnAirConfigured(settings.onAir)) configured.add("onAir");
  if (isAwayConfigured(settings.away)) configured.add("away");
  if (presence && isPresenceConfigured(presence)) configured.add("presence");
  if (calendar?.rules.length) configured.add("calendar");
  // Step back to the list that opened the wizard. Pushing it instead would
  // leave the wizard as the list's previous entry, so Back would reopen it.
  const overview = () =>
    router.history.canGoBack()
      ? router.history.back()
      : navigate({ to: "/automations", replace: true });
  return (
    <AutomationWizard
      settings={settings}
      status={status}
      lightGroups={lightGroups}
      scenes={sceneOptions}
      bridgeId={bridgeId}
      hasPro={hasPro}
      configured={configured}
      presenceSettings={presence}
      presenceStatus={presenceStatus}
      calendarSettings={calendar}
      calendarStatus={calendarStatus}
      onExit={() => void overview()}
      onEditExisting={(kind) =>
        void navigate({ to: "/automations", search: { automation: kind } })
      }
    />
  );
}
