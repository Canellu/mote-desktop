import { useState } from "react";
import { Lightbulb, Sparkles, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { AutomationLightGroup } from "@/features/automations/components/AutomationLightPicker";
import {
  SettingsWizardContainedStep,
  SettingsWizardLayout,
  SettingsWizardViewport,
} from "@/features/settings-screen/components/SettingsWizardLayout";
import {
  newRitual,
  ritualHasLights,
  ritualLightsLabel,
  vibeInfo,
  type FocusLook,
  type FocusRitual,
} from "./model";
import { hueDisplayColorHex } from "@/features/space-screen/utils/color-state";
import { useFocusPreview } from "./hooks";
import {
  LightsFields,
  LookFields,
  PreviewRow,
  RhythmFields,
  SessionShape,
  VibeFields,
} from "./RitualFields";
import { VibeSample } from "./VibeSample";

const steps = ["Rhythm", "Lights", "Vibe", "Review"] as const;

/**
 * A new ritual one step at a time: its rhythm, the lights that keep time,
 * how those lights behave, and a last look before it is saved. Every step
 * stays reachable, so going back changes an earlier answer without losing
 * the later ones.
 */
export function RitualWizard({
  bridgeId,
  lightGroups,
  hasPro,
  onSave,
  onExit,
}: {
  bridgeId: string | null;
  lightGroups: AutomationLightGroup[];
  hasPro: boolean;
  onSave: (ritual: FocusRitual) => Promise<boolean>;
  onExit: () => void;
}) {
  const [ritual, setRitual] = useState(newRitual);
  const [look, setLook] = useState<FocusLook>("focus");
  const [preview, setPreview] = useState(false);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<FocusRitual>) =>
    setRitual((current) => ({ ...current, ...patch }));
  const named = !!ritual.name.trim();
  const hasLights = ritualHasLights(ritual, bridgeId);
  const canPreview = hasPro && hasLights;
  // The lights only answer on the step that edits their look.
  const { error: previewError } = useFocusPreview(
    preview && canPreview && step === 2 ? ritual : null,
    preview && canPreview && step === 2 ? look : null,
  );

  const changeStep = (next: number) => {
    if (next !== 2) setPreview(false);
    setStep(next);
    setMaxStep((current) => Math.max(current, next));
  };
  const save = async () => {
    if (saving || !named || !hasLights) return;
    setSaving(true);
    setPreview(false);
    try {
      if (await onSave({ ...ritual, name: ritual.name.trim() })) {
        toast.success(`${ritual.name.trim()} saved`);
        onExit();
      }
    } finally {
      setSaving(false);
    }
  };

  const content =
    step === 0 ? (
      <StepBody
        title="Rhythm"
        description="How long you focus and rest. Start from a preset, then change anything you like."
      >
        <RhythmFields ritual={ritual} isNew onChange={update} />
      </StepBody>
    ) : step === 1 ? (
      <StepBody
        id="focus-wizard-lights"
        title="Lights"
        description="The lights that keep time. They go back to how they were when the session ends."
        error={
          maxStep > 1 && !hasLights
            ? "Choose at least one light on this bridge to save the routine."
            : undefined
        }
      >
        <LightsFields
          ritual={ritual}
          bridgeId={bridgeId}
          lightGroups={lightGroups}
          labelledBy="focus-wizard-lights"
          onChange={update}
        />
      </StepBody>
    ) : step === 2 ? (
      <StepBody
        title="Vibe"
        description="How your lights show the time passing, and the colors behind each phase."
      >
        <VibeFields ritual={ritual} onChange={update} />
        <LookFields
          ritual={ritual}
          look={look}
          layoutId="focus-wizard-look-pill"
          onLookChange={setLook}
          onChange={update}
        />
        <PreviewRow
          hasPro={hasPro}
          canPreview={canPreview}
          preview={preview}
          look={look}
          error={previewError}
          layoutId="focus-wizard-preview-pill"
          onChange={setPreview}
        />
      </StepBody>
    ) : (
      <StepBody
        title={`Review ${ritual.name.trim() || "this routine"}`}
        description="Everything this routine will do, before it is saved."
      >
        <SessionShape ritual={ritual} />
        <div className="grid min-w-0 gap-3 @lg:grid-cols-2">
          <ReviewCard
            icon={Lightbulb}
            title={ritualLightsLabel(ritual, lightGroups, bridgeId)}
            note="They go back to how they were when the session ends."
          >
            <span className="flex min-w-0 flex-wrap gap-1.5">
              {ritual.targets.slice(0, 6).map((target) => (
                <span
                  key={`${target.kind}:${target.id}`}
                  className="truncate rounded-full bg-(--settings-surface-hover) px-2 py-0.5 text-xs"
                >
                  {target.name}
                </span>
              ))}
              {ritual.targets.length > 6 && (
                <span className="px-1 py-0.5 text-xs text-muted-foreground">
                  +{ritual.targets.length - 6} more
                </span>
              )}
            </span>
          </ReviewCard>
          <ReviewCard
            icon={Sparkles}
            title={vibeInfo[ritual.vibe].name}
            note={vibeInfo[ritual.vibe].blurb}
          >
            <span className="flex min-w-0 items-center gap-3">
              <VibeSample vibe={ritual.vibe} ritual={ritual} size="md" />
              <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <Swatch xy={ritual.focusXy} label="Focus" />
                <Swatch xy={ritual.warningXy} label="Near the end" />
                <Swatch xy={ritual.breakXy} label="Break" />
              </span>
            </span>
          </ReviewCard>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {ritual.notify
            ? "A notification marks each phase change."
            : "No notification between phases."}
        </p>
        {!hasLights && (
          <div
            role="alert"
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-(--warn-surface) px-4 py-3"
          >
            <span className="text-sm text-(--warn-text)">
              This routine has no lights yet, so it cannot be saved.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => changeStep(1)}
              className="shrink-0"
            >
              Choose lights
            </Button>
          </div>
        )}
      </StepBody>
    );

  return (
    <SettingsWizardLayout
      className="max-w-none"
      fixedChrome
      steps={steps}
      step={step}
      // Nothing here waits on anything else, so every step is open from the
      // start and the row shows which ones are settled.
      maxUnlockedStep={steps.length - 1}
      stepsDone={[named, hasLights, true, named && hasLights]}
      stepsClassName="max-w-xl"
      onStepChange={changeStep}
      canContinue
      onContinue={() => changeStep(step + 1)}
      onCancel={onExit}
      finalAction={{
        label: saving ? "Saving…" : "Create routine",
        disabled: saving || !named || !hasLights,
        onClick: () => void save(),
      }}
    >
      <SettingsWizardViewport stepKey={step} contained>
        {/* The scroller spans the page, so its bar sits at the window's edge
            rather than hugging the column of fields. */}
        <SettingsWizardContainedStep
          className="max-w-none"
          contentClassName="py-0"
        >
          <ScrollArea
            fade
            className="min-h-0 flex-1"
            scrollbarClassName="z-30"
            contentClassName="flex min-h-full flex-col"
          >
            {/* `my-auto` centers a step that fits the window, the way the
                other wizards center their short steps, and collapses to the
                top once the step is tall enough to scroll. The lights step
                keeps its top instead: its height changes as rooms open and
                as the view switches, and centering would slide the whole
                step under the cursor each time. */}
            <div
              className={cn(
                "@container mx-auto w-full max-w-2xl min-w-0 px-1 pt-28 pb-28",
                step === 1 ? "mb-auto" : "my-auto",
              )}
            >
              {content}
            </div>
          </ScrollArea>
        </SettingsWizardContainedStep>
      </SettingsWizardViewport>
    </SettingsWizardLayout>
  );
}

/** One half of the review: what was chosen, with the thing itself shown. */
function ReviewCard({
  icon: Icon,
  title,
  note,
  children,
}: {
  icon: LucideIcon;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-3 rounded-2xl border border-border/60 bg-(--settings-surface) p-4 dark:bg-card">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="text-xs leading-5 text-muted-foreground">
            {note}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

/** A look's colour as a dot with its name beside it. */
function Swatch({ xy, label }: { xy: [number, number]; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-full ring-1 ring-foreground/15"
        style={{ background: hueDisplayColorHex({ xy }) ?? undefined }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function StepBody({
  id,
  title,
  description,
  error,
  children,
}: {
  id?: string;
  title: string;
  description: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <div className="grid gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
      {error && (
        <p role="alert" className="text-sm text-(--destructive-text)">
          {error}
        </p>
      )}
    </div>
  );
}
