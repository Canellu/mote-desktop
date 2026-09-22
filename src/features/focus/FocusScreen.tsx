import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Lightbulb, Pencil, Play, Plus, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import { useLightGroups } from "@/features/automations/useLightGroups";
import { ProSetupBanner } from "@/features/settings-screen/components/ProSetupBanner";
import { cn } from "@/lib/utils";
import {
  isSessionActive,
  rhythmSummary,
  ritualHasLights,
  ritualLightsLabel,
  vibeInfo,
  type FocusRitual,
} from "./model";
import { RitualEditor, RitualSwatches } from "./RitualEditor";
import { CompletionView, SessionView } from "./SessionView";
import {
  deleteRitual,
  loadFocus,
  saveRitual,
  startFocus,
  useFocusStore,
} from "./store";

/**
 * Focus sessions: pick a ritual and your lights keep time. While a session
 * runs this is its clock; otherwise it lists rituals to start or edit.
 */
export function FocusScreen() {
  const navigate = useNavigate();
  const { hasPro } = useEntitlements();
  const { bridgeId } = useHue();
  const { lightGroups } = useLightGroups();
  const rituals = useFocusStore((s) => s.rituals);
  const status = useFocusStore((s) => s.status);
  const loadError = useFocusStore((s) => s.loadError);
  const lastRitualId = useFocusStore((s) => s.lastRitualId);
  const [editing, setEditing] = useState<FocusRitual | null>(null);
  const createRitual = () => void navigate({ to: "/focus/new" });
  useEffect(() => {
    void loadFocus();
  }, []);

  const current = rituals?.find((ritual) => ritual.id === status.ritualId);

  if (editing)
    return (
      <RitualEditor
        key={editing.id}
        initial={editing}
        isNew={false}
        bridgeId={bridgeId}
        lightGroups={lightGroups}
        hasPro={hasPro}
        onSave={saveRitual}
        onCancel={() => setEditing(null)}
        onDelete={() => {
          void deleteRitual(editing.id);
          setEditing(null);
        }}
      />
    );
  if (isSessionActive(status))
    return <SessionView status={status} ritual={current} />;
  if (status.lifecycle === "completed")
    return <CompletionView status={status} ritual={current} />;
  if (!rituals)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {loadError ?? "Loading focus routines..."}
      </p>
    );

  // The ritual used last comes first: it is the one most often started again.
  const ordered = [...rituals].sort(
    (a, b) => Number(b.id === lastRitualId) - Number(a.id === lastRitualId),
  );
  const empty = ordered.length === 0;
  return (
    <div
      className={cn(
        "@container mx-auto w-full max-w-3xl min-w-0 gap-6 pb-10",
        // The empty state takes the whole page so it can centre in it; a list
        // keeps its own height and starts under the header as before.
        empty ? "flex flex-1 flex-col" : "grid",
      )}
    >
      {!hasPro && (
        <ProSetupBanner feature="local_automation">
          Focus sessions are part of Mote Pro. You can create routines now; they
          start as soon as Pro is unlocked.
        </ProSetupBanner>
      )}
      {loadError && (
        <p role="status" className="text-sm text-muted-foreground">
          {loadError}
        </p>
      )}
      {empty ? (
        // Nothing to list yet, so the invitation takes the space a list would
        // have had: centered in it, and a little above true center the way a
        // wizard's step sits above its footer.
        <div className="flex min-h-0 flex-1 flex-col justify-center pb-[8vh]">
          <div className="grid justify-items-center gap-4 rounded-2xl bg-(--settings-surface) px-6 py-12 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Timer size={26} />
            </span>
            <div className="grid max-w-sm gap-1.5">
              <h2 className="text-base font-semibold">
                Let your lights keep time
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                A routine pairs a focus rhythm with the lights around you. They
                shift as the minutes pass, change for your breaks, and go back
                to how they were when you are done.
              </p>
            </div>
            <Button size="lg" onClick={createRitual}>
              <Plus />
              Create a routine
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Routines</h2>
            <Button variant="outline" onClick={createRitual}>
              <Plus />
              New routine
            </Button>
          </div>
          <ul className="grid gap-3">
            {ordered.map((ritual) => {
              const ready = ritualHasLights(ritual, bridgeId);
              return (
                <li
                  key={ritual.id}
                  className="flex min-w-0 flex-wrap items-center gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/5"
                >
                  <RitualSwatches ritual={ritual} />
                  <div className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate text-base font-medium">
                      {ritual.name}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {rhythmSummary(ritual)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{vibeInfo[ritual.vibe].name}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Lightbulb aria-hidden size={12} />
                        <span className="truncate">
                          {ritualLightsLabel(ritual, lightGroups, bridgeId)}
                        </span>
                      </span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${ritual.name}`}
                      onClick={() => setEditing(ritual)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      disabled={!ready}
                      title={
                        ready
                          ? undefined
                          : "Choose lights for this routine first"
                      }
                      onClick={() => void startFocus(ritual.id)}
                    >
                      <Play />
                      Start
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
