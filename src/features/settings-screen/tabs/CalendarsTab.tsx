import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/context/EntitlementContext";
import {
  loadCalendar,
  useCalendarStore,
} from "@/features/automations/calendar";
import { CalendarConnections } from "@/features/automations/components/CalendarEditor";
import { ProSetupBanner } from "../components/ProSetupBanner";

/**
 * The calendars Mote reads, beside the other connections. Calendar
 * automations pick from these; connecting one while making a rule lands here.
 */
export function CalendarsTab() {
  const { hasPro } = useEntitlements();
  const settings = useCalendarStore((state) => state.settings);
  const status = useCalendarStore((state) => state.status);
  const loadError = useCalendarStore((state) => state.loadError);
  useEffect(() => {
    void loadCalendar();
  }, []);
  return (
    <div className="grid min-w-0 gap-6">
      {!hasPro && (
        <ProSetupBanner feature="local_automation">
          Calendar automations are part of Mote Pro. You can connect calendars
          now; rules start working as soon as Pro is unlocked.
        </ProSetupBanner>
      )}
      {settings ? (
        <CalendarConnections settings={settings} status={status} />
      ) : loadError ? (
        <div className="grid justify-items-start gap-3" role="status">
          <p className="text-sm text-(--destructive-text)">{loadError}</p>
          <Button variant="outline" onClick={() => void loadCalendar()}>
            Retry
          </Button>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading calendars…
        </p>
      )}
    </div>
  );
}
