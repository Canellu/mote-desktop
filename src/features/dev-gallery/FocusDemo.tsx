import { useState } from "react";
import { Eye, Pencil, Play, Plus, Sparkles } from "lucide-react";
import { SegmentedControl } from "@/features/settings-screen/components/SegmentedControl";
import {
  idleFocusStatus,
  newRitual,
  type FocusRitual,
  type FocusStatus,
} from "@/features/focus/model";
import { RitualEditor } from "@/features/focus/RitualEditor";
import { RitualWizard } from "@/features/focus/RitualWizard";
import { CompletionView, SessionView } from "@/features/focus/SessionView";
import { demoLightGroups } from "./demoHome";

const views = [
  { value: "wizard", label: "Wizard", icon: Plus },
  { value: "editor", label: "Editor", icon: Pencil },
  { value: "running", label: "Running", icon: Play },
  { value: "between", label: "Between", icon: Eye },
  { value: "done", label: "Done", icon: Sparkles },
] as const;
type View = (typeof views)[number]["value"];

const ritual: FocusRitual = {
  ...newRitual(),
  id: "demo-ritual",
  bridgeId: "demo",
  targets: [{ kind: "room", id: "demo-office", name: "Office" }],
};

/**
 * The Focus screens with an example ritual and a fake clock. Controls reach
 * for the backend and fail quietly here; nothing real changes.
 */
export function FocusDemo() {
  const [view, setView] = useState<View>("wizard");
  // Fixed when the view opens, so the countdown runs from a stable point.
  const [now] = useState(() => Date.now());
  const running: FocusStatus = {
    ...idleFocusStatus,
    lifecycle: "running",
    ritualId: ritual.id,
    ritualName: ritual.name,
    phase: "focus",
    nextPhase: "break",
    round: 2,
    rounds: 4,
    stageMs: 25 * 60_000,
    remainingMs: 4 * 60_000,
    endsAt: now + 4 * 60_000,
    completedRounds: 1,
  };
  return (
    <div className="grid min-w-0 gap-6">
      <SegmentedControl
        value={view}
        ariaLabel="Focus screen to show"
        layoutId="focus-demo-pill"
        options={views}
        onValueChange={setView}
      />
      {view === "wizard" && (
        // The wizard fills the route's height in the app; the gallery lends it
        // a window of its own so its footer sits where it really does.
        <div className="h-[44rem]">
          <RitualWizard
            bridgeId="demo"
            lightGroups={demoLightGroups}
            hasPro
            onSave={async () => true}
            onExit={() => setView("editor")}
          />
        </div>
      )}
      {view === "editor" && (
        <RitualEditor
          initial={ritual}
          isNew={false}
          bridgeId="demo"
          lightGroups={demoLightGroups}
          hasPro
          onSave={async () => true}
          onCancel={() => setView("running")}
          onDelete={() => undefined}
        />
      )}
      {view === "running" && <SessionView status={running} ritual={ritual} />}
      {view === "between" && (
        <SessionView
          status={{
            ...running,
            lifecycle: "intermission",
            intermission: true,
            stageMs: 10_000,
            remainingMs: 7_000,
            endsAt: now + 7_000,
            completedRounds: 2,
          }}
          ritual={ritual}
        />
      )}
      {view === "done" && (
        <CompletionView
          status={{
            ...running,
            lifecycle: "completed",
            completedRounds: 4,
            focusedMs: 100 * 60_000,
            endsAt: null,
          }}
          ritual={ritual}
        />
      )}
    </div>
  );
}
