import { useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import { ProSetupBanner } from "@/features/settings-screen/components/ProSetupBanner";
import { cn } from "@/lib/utils";
import { loadCalendar, saveCalendar, useCalendarStore } from "./calendar";
import { AutomationEditPage } from "./components/AutomationEditPage";
import { AutomationOverview } from "./components/AutomationOverview";
import { CalendarAutomationEditPage } from "./components/CalendarAutomationEditPage";
import { PresenceAutomationEditPage } from "./components/PresenceAutomationEditPage";
import { loadPresence, savePresence, usePresenceStore } from "./presence";
import {
  loadAutomations,
  saveAutomationSettings,
  useAutomationStore,
} from "./store";
import { useLightGroups } from "./useLightGroups";
import { useOpenAutomation } from "./useOpenAutomation";

/**
 * Everything that changes the lights on its own: the configured automations,
 * and one page per automation. The app header carries the title, the back
 * button and "Add automation", so this is only the content under it.
 */
export function AutomationsScreen() {
  const navigate = useNavigate();
  const { hasPro } = useEntitlements();
  const { bridgeId } = useHue();
  const { automation, calendarRuleId, setAutomation } = useOpenAutomation();
  const { lightGroups, sceneOptions, resourcesLoading } = useLightGroups();
  const settings = useAutomationStore((s) => s.settings);
  const status = useAutomationStore((s) => s.status);
  const loadError = useAutomationStore((s) => s.loadError);
  const presenceSettings = usePresenceStore((s) => s.settings);
  const presenceStatus = usePresenceStore((s) => s.status);
  const presenceError = usePresenceStore((s) => s.loadError);
  const calendarSettings = useCalendarStore((s) => s.settings);
  const calendarStatus = useCalendarStore((s) => s.status);
  const calendarError = useCalendarStore((s) => s.loadError);
  useEffect(() => {
    void loadAutomations();
    void loadPresence();
    void loadCalendar();
  }, []);

  // Connections live in Settings now; an old link to them still gets there.
  useEffect(() => {
    if (automation === "calendar" && !calendarRuleId)
      void navigate({
        to: "/settings",
        search: { tab: "calendars" },
        replace: true,
      });
  }, [automation, calendarRuleId, navigate]);

  // Opening a page lands at its top, whatever the list was scrolled to.
  const top = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = top.current?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;
    viewport.scrollTo({ top: 0 });
    // A page only changes the search, so the router restores the list's
    // scroll position over this. Take the top back once it has, and again
    // after the first paint, when opening panels have settled.
    let frame = requestAnimationFrame(() => {
      viewport.scrollTo({ top: 0 });
      frame = requestAnimationFrame(() => viewport.scrollTo({ top: 0 }));
    });
    return () => cancelAnimationFrame(frame);
  }, [automation, calendarRuleId]);

  const close = () => setAutomation(null);
  const pending = (error: string | null, what: string) => (
    <p role="status" className="text-sm text-muted-foreground">
      {error ?? `Loading ${what}…`}
    </p>
  );

  const content = () => {
    if (loadError)
      return (
        <div className="grid justify-items-start gap-3" role="status">
          <p className="text-sm text-(--destructive-text)">{loadError}</p>
          <Button variant="outline" onClick={() => void loadAutomations()}>
            Retry
          </Button>
        </div>
      );
    if (!settings) return pending(null, "automations");
    switch (automation) {
      case "onAir":
      case "away":
        return (
          <AutomationEditPage
            kind={automation}
            settings={settings}
            status={status}
            lightGroups={lightGroups}
            scenes={sceneOptions}
            bridgeId={bridgeId}
            hasPro={hasPro}
            onDone={close}
          />
        );
      case "presence":
        return presenceSettings ? (
          <PresenceAutomationEditPage
            settings={presenceSettings}
            status={presenceStatus}
            lightGroups={lightGroups}
            scenes={sceneOptions}
            bridgeId={bridgeId}
            hasPro={hasPro}
            onDone={close}
          />
        ) : (
          pending(presenceError, "presence")
        );
      case "calendar": {
        if (!calendarSettings || !calendarRuleId)
          return pending(calendarError, "calendars");
        const rule = calendarSettings.rules.find(
          (candidate) => candidate.id === calendarRuleId,
        );
        return rule ? (
          <CalendarAutomationEditPage
            settings={calendarSettings}
            rule={rule}
            lightGroups={lightGroups}
            scenes={sceneOptions}
            bridgeId={bridgeId}
            hasPro={hasPro}
            onDone={close}
          />
        ) : (
          <div className="grid justify-items-start gap-3">
            <p className="text-sm text-muted-foreground">
              That calendar rule no longer exists.
            </p>
            <Button variant="outline" onClick={close}>
              Back to automations
            </Button>
          </div>
        );
      }
      default:
        return (
          <AutomationOverview
            settings={settings}
            status={status}
            presence={presenceSettings}
            presenceStatus={presenceStatus}
            calendar={calendarSettings}
            calendarStatus={calendarStatus}
            presenceError={presenceError}
            calendarError={calendarError}
            lightGroups={lightGroups}
            scenes={sceneOptions}
            bridgeId={bridgeId}
            hasPro={hasPro}
            resourcesLoading={resourcesLoading}
            auxiliaryLoading={
              (!presenceSettings && !presenceError) ||
              (!calendarSettings && !calendarError)
            }
            onAdd={() => void navigate({ to: "/automations/new" })}
            onEdit={(kind, ruleId) => setAutomation(kind, ruleId)}
            onToggleSingleton={(kind, enabled) =>
              void saveAutomationSettings((current) => ({
                ...current,
                [kind]: { ...current[kind], enabled },
              }))
            }
            onTogglePresence={(enabled) =>
              void savePresence((current) => ({ ...current, enabled }))
            }
            onToggleCalendar={(id, enabled) =>
              void saveCalendar((current) => ({
                ...current,
                rules: current.rules.map((rule) =>
                  rule.id === id ? { ...rule, enabled } : rule,
                ),
              }))
            }
            onReorder={(priority) =>
              void saveAutomationSettings((current) => ({
                ...current,
                priority,
              }))
            }
            onRetryPresence={() => void loadPresence()}
            onRetryCalendar={() => void loadCalendar()}
          />
        );
    }
  };

  return (
    <div
      ref={top}
      className={cn(
        // Panels that open as the page arrives change its height, and the
        // browser's scroll anchoring answers by nudging the page down — which
        // left the pinned summary out of line with the settings.
        "mx-auto grid w-full min-w-0 gap-6 pb-10 [overflow-anchor:none]",
        // An edit page puts its summary beside the settings, so it needs room.
        automation ? "max-w-5xl" : "max-w-3xl",
      )}
    >
      {!hasPro && (
        <ProSetupBanner feature="local_automation">
          Automations are part of Mote Pro. You can set them up now. They start
          working as soon as Pro is unlocked.
        </ProSetupBanner>
      )}
      {content()}
    </div>
  );
}
