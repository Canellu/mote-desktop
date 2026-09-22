import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  defaultPriority,
  type AutomationRule,
  type AutomationSettings,
} from "@/features/automations/model";
import {
  automationNavVariants,
  automationRuleInfo,
} from "@/features/automations/useOpenAutomation";
import { AutomationOverview } from "@/features/automations/components/AutomationOverview";
import { AutomationTypePicker } from "@/features/automations/components/AutomationTypePicker";
import { AutomationEditorLayout } from "@/features/automations/components/AutomationEditorLayout";
import { awaySummary, onAirSummary } from "@/features/automations/summaries";
import { validateAway, validateOnAir } from "@/features/automations/validation";
import {
  FieldSection,
  OnAirLookFields,
  OnAirWhenFields,
  PcLockActionFields,
  PcLockReturnFields,
} from "@/features/automations/components/SingletonAutomationFields";
import {
  demoLightGroups as lightGroups,
  demoScenes as scenes,
} from "./demoHome";

export function AutomationsDemo() {
  const [settings, setSettings] = useState<AutomationSettings>({
    onAir: {
      enabled: false,
      bridgeId: "demo",
      target: null,
      targets: [{ id: "demo-light-0", kind: "light", name: "Office light 1" }],
      mode: "color",
      xy: null,
      mirek: 366,
      scene: null,
      trigger: "microphone_or_camera",
      color: "red",
      brightness: 80,
      ignoredApps: [],
    },
    away: {
      enabled: false,
      bridgeId: "demo",
      target: null,
      targets: [],
      scene: null,
      action: "off",
      dimBrightness: 20,
      includeSleep: true,
      restoreOnReturn: true,
    },
    priority: [...defaultPriority],
  });
  // The app header owns the title, blurb and back button around a page, so the
  // gallery stands in for them — otherwise an open automation shows no name.
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [adding, setAdding] = useState(false);
  const reduceMotion = useReducedMotion();
  const direction = reduceMotion ? 0 : editing ? 1 : -1;
  // Scrolls like Settings does, so opening an automation from far down the
  // list can be checked here.
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [editing]);
  return (
    <ScrollArea
      fade
      className="h-[36rem] min-w-0 rounded-2xl border border-border"
      viewportClassName="px-4 py-6"
      viewportRef={viewportRef}
    >
      <div className="@container grid min-w-0 gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          Example bridge · Edits stay in this demo. No real lights are changed.
        </p>
        <div className="flex min-w-0 items-center gap-2 pb-2">
          {editing && (
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 shrink-0"
              aria-label="Back to automations"
              onClick={() => setEditing(null)}
            >
              <ArrowLeft />
            </Button>
          )}
          <div className="grid min-w-0 flex-1">
            <AnimatePresence initial={false} mode="sync" custom={direction}>
              <motion.div
                key={editing ?? "tab"}
                className="col-start-1 row-start-1 min-w-0 space-y-2"
                custom={direction}
                variants={automationNavVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <h2 className="font-heading text-2xl font-semibold tracking-tight">
                  {editing ? automationRuleInfo[editing].title : "Automations"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {editing
                    ? automationRuleInfo[editing].description
                    : "Let your lights respond to your day"}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        {!editing && adding ? (
          <AutomationTypePicker
            configured={new Set(["onAir"])}
            onCancel={() => setAdding(false)}
            onChoose={(kind) => {
              setAdding(false);
              if (kind === "onAir" || kind === "away") setEditing(kind);
            }}
          />
        ) : !editing ? (
          <AutomationOverview
            settings={settings}
            status={null}
            presence={null}
            presenceStatus={null}
            calendar={null}
            calendarStatus={null}
            presenceError={null}
            calendarError={null}
            lightGroups={lightGroups}
            scenes={scenes}
            bridgeId="demo"
            hasPro
            resourcesLoading={false}
            auxiliaryLoading={false}
            onAdd={() => setAdding(true)}
            onEdit={(kind) =>
              (kind === "onAir" || kind === "away") && setEditing(kind)
            }
            onToggleSingleton={(kind, enabled) =>
              setSettings((current) => ({
                ...current,
                [kind]: { ...current[kind], enabled },
              }))
            }
            onTogglePresence={() => undefined}
            onToggleCalendar={() => undefined}
            onReorder={(priority) =>
              setSettings((current) => ({ ...current, priority }))
            }
            onRetryPresence={() => undefined}
            onRetryCalendar={() => undefined}
          />
        ) : (
          <DemoEditor
            kind={editing}
            settings={settings}
            onChange={setSettings}
            onDone={() => setEditing(null)}
          />
        )}
      </div>
    </ScrollArea>
  );
}

/**
 * The on-air and lock edit page as the app lays it out, on a draft kept here.
 * Saving copies the draft into the demo's settings; nothing reaches a bridge.
 */
function DemoEditor({
  kind,
  settings,
  onChange,
  onDone,
}: {
  kind: AutomationRule;
  settings: AutomationSettings;
  onChange: (next: AutomationSettings) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [preview, setPreview] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const summary =
    kind === "onAir" ? onAirSummary(draft.onAir) : awaySummary(draft.away);
  const value = draft[kind];
  const issues =
    kind === "onAir"
      ? validateOnAir(draft.onAir, { bridgeId: "demo" })
      : validateAway(draft.away, { bridgeId: "demo" });
  return (
    <AutomationEditorLayout
      issues={issues.map((issue) => ({
        message: issue.message,
        section: kind === "onAir" ? "demo-look" : "demo-action",
      }))}
      summary={summary.sentence}
      status={{
        text: value.enabled ? "Waiting (demo)" : "Off",
        tone: "neutral",
      }}
      enabled={{
        checked: value.enabled,
        label: "Turn this automation on or off",
        onChange: (enabled) =>
          setDraft((current) => ({
            ...current,
            [kind]: { ...current[kind], enabled },
          })),
      }}
      sections={
        kind === "onAir"
          ? [
              { id: "demo-when", title: "When", value: summary.sections.when },
              {
                id: "demo-look",
                title: "Lights & look",
                value: summary.sections.look,
              },
            ]
          : [
              {
                id: "demo-action",
                title: "Lights & action",
                value: summary.sections.action,
              },
              {
                id: "demo-back",
                title: "Coming back",
                value: summary.sections.back,
              },
            ]
      }
      preview={{
        checked: preview,
        hint: preview ? "Showing now (demo)." : "Try it before you save.",
        onChange: setPreview,
      }}
      dirty={dirty}
      pending={false}
      canSave={dirty}
      onSave={() => {
        onChange(draft);
        onDone();
      }}
      onCancel={onDone}
    >
      {kind === "onAir" ? (
        <>
          <FieldSection
            id="demo-when"
            title="When"
            description="What switches the light on."
          >
            <OnAirWhenFields
              value={draft.onAir}
              status={null}
              onChange={(onAir) => setDraft({ ...draft, onAir })}
            />
          </FieldSection>
          <FieldSection
            id="demo-look"
            title="Lights & look"
            description="The lights and appearance used while you are on air."
          >
            <OnAirLookFields
              value={draft.onAir}
              lightGroups={lightGroups}
              scenes={scenes}
              bridgeId="demo"
              onChange={(onAir) => setDraft({ ...draft, onAir })}
            />
          </FieldSection>
        </>
      ) : (
        <>
          <FieldSection
            id="demo-action"
            title="Lights & action"
            description="What happens when this PC locks."
          >
            <PcLockActionFields
              value={draft.away}
              lightGroups={lightGroups}
              scenes={scenes}
              bridgeId="demo"
              onChange={(away) => setDraft({ ...draft, away })}
            />
          </FieldSection>
          <FieldSection
            id="demo-back"
            title="Coming back"
            description="What happens after you unlock this PC."
          >
            <PcLockReturnFields
              value={draft.away}
              onChange={(away) => setDraft({ ...draft, away })}
            />
          </FieldSection>
        </>
      )}
    </AutomationEditorLayout>
  );
}
