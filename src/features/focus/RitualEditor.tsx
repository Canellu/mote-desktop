import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { hueDisplayColorHex } from "@/features/space-screen/utils/color-state";
import type { AutomationLightGroup } from "@/features/automations/components/AutomationLightPicker";
import { useFocusPreview } from "./hooks";
import { ritualHasLights, type FocusLook, type FocusRitual } from "./model";
import {
  LightsFields,
  LookFields,
  PreviewRow,
  RhythmFields,
  VibeFields,
} from "./RitualFields";

/**
 * One saved ritual, every setting on one page in the order a session runs:
 * its rhythm, the lights it uses, and how those lights behave. New rituals
 * go through the wizard instead.
 */
export function RitualEditor({
  initial,
  isNew,
  bridgeId,
  lightGroups,
  hasPro,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: FocusRitual;
  isNew: boolean;
  bridgeId: string | null;
  lightGroups: AutomationLightGroup[];
  hasPro: boolean;
  onSave: (ritual: FocusRitual) => Promise<boolean>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [ritual, setRitual] = useState(initial);
  const [look, setLook] = useState<FocusLook>("focus");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<FocusRitual>) =>
    setRitual((current) => ({ ...current, ...patch }));
  const canPreview = hasPro && ritualHasLights(ritual, bridgeId);
  const { error: previewError } = useFocusPreview(
    preview && canPreview ? ritual : null,
    preview && canPreview ? look : null,
  );

  const save = async () => {
    setSaving(true);
    try {
      if (await onSave({ ...ritual, name: ritual.name.trim() })) onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="@container mx-auto grid w-full max-w-3xl min-w-0 gap-8 pb-10">
      <Section
        number={1}
        id="rhythm"
        title="Rhythm"
        hint="Choose a starting point, then change anything you like."
      >
        <RhythmFields ritual={ritual} isNew={isNew} onChange={update} />
      </Section>

      <Section
        number={2}
        id="lights"
        title="Lights"
        hint="The lights that keep time. They go back to how they were when the session ends."
      >
        <LightsFields
          ritual={ritual}
          bridgeId={bridgeId}
          lightGroups={lightGroups}
          labelledBy="focus-step-lights"
          onChange={update}
        />
      </Section>

      <Section
        number={3}
        id="vibe"
        title="Vibe"
        hint="How your lights show the time passing."
      >
        <div className="grid min-w-0 gap-6">
          <VibeFields ritual={ritual} onChange={update} />
          <LookFields
            ritual={ritual}
            look={look}
            layoutId="focus-look-pill"
            onLookChange={setLook}
            onChange={update}
          />
          <PreviewRow
            hasPro={hasPro}
            canPreview={canPreview}
            preview={preview}
            look={look}
            error={previewError}
            layoutId="focus-preview-pill"
            onChange={setPreview}
          />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
        <Button
          size="lg"
          disabled={saving || !ritual.name.trim()}
          onClick={() => void save()}
        >
          {isNew ? "Create routine" : "Save routine"}
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {onDelete && (
          <Button
            size="lg"
            variant="ghost"
            className="ml-auto text-(--destructive-text)"
            onClick={onDelete}
          >
            Delete routine
          </Button>
        )}
      </div>
    </div>
  );
}

function Section({
  number,
  id,
  title,
  hint,
  children,
}: {
  number: number;
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-4">
      <div className="flex min-w-0 items-baseline gap-3">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
        >
          {number}
        </span>
        <div className="grid min-w-0 gap-0.5">
          <h2 id={`focus-step-${id}`} className="text-sm font-semibold">
            {title}
          </h2>
          <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="min-w-0 rounded-2xl bg-(--settings-surface) p-4 @3xl:p-5">
        {children}
      </div>
    </section>
  );
}

/** A ritual's three looks as small swatches. */
export function RitualSwatches({ ritual }: { ritual: FocusRitual }) {
  return (
    <span className="flex items-center -space-x-1.5" aria-hidden="true">
      {[ritual.focusXy, ritual.warningXy, ritual.breakXy].map((xy, index) => (
        <span
          key={index}
          className="size-4 rounded-full ring-2 ring-card"
          style={{ background: hueDisplayColorHex({ xy }) ?? undefined }}
        />
      ))}
    </span>
  );
}
