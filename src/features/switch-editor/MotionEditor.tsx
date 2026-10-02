import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeField } from "@/components/TimeField";
import { PICKER_TILE_ROW } from "@/features/automations/components/AutomationPickerGroups";
import {
  SceneOptionTile,
  type AutomationSceneOption,
} from "@/features/automations/components/AutomationScenePicker";
import { useLightGroups } from "@/features/automations/useLightGroups";
import { humanize, isRecord } from "@/features/settings-screen/utils/format";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { formatClock } from "@/stores/FormatPreferencesStore";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useRouter } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Palette, Plus, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { behaviorsFor, type BehaviorInstance } from "./button-setup";
import {
  DAYLIGHT_CHOICES,
  buildMotionConfig,
  motionProblem,
  parseMotionSetup,
  type MotionSetup,
  type MotionSlot,
} from "./motion-setup";

const OFF_AFTER_CHOICES = [1, 2, 5, 10, 15, 20, 30, 45, 60];

const minutesOfDay = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

const clock = (slot: MotionSlot) => {
  if (slot.startType !== "time") return humanize(slot.startType);
  const [hour = 0, minute = 0] = slot.time.split(":").map(Number);
  return formatClock(hour, minute);
};

const offAfterLabel = (minutes: number | null) =>
  minutes == null
    ? "Stay on"
    : minutes === 1
      ? "After 1 minute"
      : minutes % 60 === 0
        ? `After ${minutes / 60} hour${minutes === 60 ? "" : "s"}`
        : `After ${minutes} minutes`;

interface Draft {
  setup: MotionSetup;
  /** Which original slot each slot came from, or null for a new one. */
  origins: Array<number | null>;
}

/**
 * The day as a ring, midnight at the top: each time slot is an arc in its
 * scene's colour, running until the next slot starts. Click an arc to edit it;
 * drag the handle at its start to move the time.
 */
const DayDial = ({
  slots,
  scenes,
  selected,
  onSelect,
  onMove,
}: {
  slots: MotionSlot[];
  scenes: AutomationSceneOption[];
  selected: number;
  onSelect: (index: number) => void;
  /** A handle was dragged to a new start time ("HH:MM"). */
  onMove: (index: number, time: string) => void;
}) => {
  const svg = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const size = 360;
  const center = size / 2;
  const radius = 130;
  const timed = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.startType === "time")
    .sort((a, b) => minutesOfDay(a.slot.time) - minutesOfDay(b.slot.time));
  // The time under the pointer, snapped to five minutes.
  const timeAt = (event: React.PointerEvent) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const angle = Math.atan2(local.y - center, local.x - center) + Math.PI / 2;
    const turn = (angle / (Math.PI * 2) + 1) % 1;
    const minutes = (Math.round((turn * 1440) / 5) * 5) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  const point = (minutes: number, r: number) => {
    const angle = (minutes / 1440) * Math.PI * 2 - Math.PI / 2;
    return [center + Math.cos(angle) * r, center + Math.sin(angle) * r];
  };
  const now = new Date();
  const [nowX, nowY] = point(
    now.getHours() * 60 + now.getMinutes(),
    radius + 26,
  );
  const active = timed.find(({ index }) => index === selected) ?? timed[0];
  const activeScene = scenes.find((scene) => scene.id === active?.slot.sceneId);

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${size} ${size}`}
      className="h-full max-h-[min(70vh,34rem)] w-full max-w-[34rem]"
      role="group"
      aria-label="Time slots through the day"
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        className="stroke-foreground/8"
        strokeWidth={30}
      />
      {timed.map(({ slot, index }, order) => {
        const start = minutesOfDay(slot.time);
        const next = timed[(order + 1) % timed.length];
        let end = next ? minutesOfDay(next.slot.time) : start + 1440;
        if (end <= start) end += 1440;
        const [x1, y1] = point(start, radius);
        const [x2, y2] = point(end - 0.5, radius);
        const large = end - start > 720 ? 1 : 0;
        const scene = scenes.find((option) => option.id === slot.sceneId);
        const isSelected = index === selected;
        return (
          <path
            key={index}
            d={
              timed.length === 1
                ? `M ${center} ${center - radius} a ${radius} ${radius} 0 1 1 -0.01 0`
                : `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`
            }
            fill="none"
            stroke={scene?.tint ?? "currentColor"}
            strokeOpacity={isSelected ? 1 : 0.55}
            strokeWidth={isSelected ? 38 : 28}
            className={cn(
              "cursor-pointer transition-[stroke-width,stroke-opacity] text-muted-foreground",
            )}
            role="button"
            aria-label={`${clock(slot)}, ${scene?.name ?? "no scene"}`}
            onClick={() => onSelect(index)}
          />
        );
      })}
      {timed.map(({ slot, index }) => {
        const [x, y] = point(minutesOfDay(slot.time), radius);
        const active = dragging === index;
        return (
          <circle
            key={`mark-${index}`}
            cx={x}
            cy={y}
            r={active ? 13 : 10}
            role="slider"
            aria-label={`Start of ${clock(slot)}`}
            aria-valuetext={clock(slot)}
            className={cn(
              "fill-background stroke-foreground/60 transition-[r]",
              active ? "cursor-grabbing" : "cursor-grab",
            )}
            strokeWidth={3}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(index);
              onSelect(index);
            }}
            onPointerMove={(event) => {
              if (dragging !== index) return;
              const time = timeAt(event);
              if (time && time !== slot.time) onMove(index, time);
            }}
            onPointerUp={() => setDragging(null)}
            onPointerCancel={() => setDragging(null)}
          />
        );
      })}
      {[0, 6, 12, 18].map((hour) => {
        const [x, y] = point(hour * 60, radius - 36);
        return (
          <text
            key={hour}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-[11px]"
          >
            {formatClock(hour, 0)}
          </text>
        );
      })}
      <circle cx={nowX} cy={nowY} r={4} className="fill-foreground" />
      <text
        x={nowX}
        y={nowY - 12}
        textAnchor="middle"
        className="fill-muted-foreground text-[10px]"
      >
        Now
      </text>
      {active && (
        <>
          <text
            x={center}
            y={center - 10}
            textAnchor="middle"
            className="fill-foreground text-[22px] font-semibold"
          >
            {clock(active.slot)}
          </text>
          <text
            x={center}
            y={center + 16}
            textAnchor="middle"
            className="fill-muted-foreground text-[13px]"
          >
            {activeScene?.name ?? "Choose a scene"}
          </text>
        </>
      )}
    </svg>
  );
};

/**
 * Full-screen editor for what a motion sensor does: the day as a dial on the
 * left, and the chosen time slot, room and daylight check on the right.
 */
export const MotionEditor = ({ deviceId }: { deviceId: string }) => {
  const router = useRouter();
  const allServices = useHueResourcesStore((state) => state.accessoryServices);
  const services = useMemo(
    () => allServices.filter((service) => service.deviceId === deviceId),
    [allServices, deviceId],
  );
  const scenes = useHueResourcesStore((state) => state.scenes);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const { sceneOptions } = useLightGroups();
  const [instance, setInstance] = useState<BehaviorInstance | null>(null);
  const [base, setBase] = useState<MotionSetup | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const serviceKey = services.map((service) => service.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = new Set([deviceId, ...serviceKey.split(",").filter(Boolean)]);
    invoke<BehaviorInstance[]>("get-hue-resource", {
      resourceType: "behavior_instance",
    })
      .then((instances) => {
        if (cancelled) return;
        const found = behaviorsFor(instances, ids).find(
          (candidate) =>
            isRecord(candidate.configuration) &&
            parseMotionSetup(candidate.configuration),
        );
        if (!found) {
          setLoadError("This sensor has no motion setup on the bridge.");
          return;
        }
        const setup = parseMotionSetup(found.configuration as never)!;
        setInstance(found);
        setBase(setup);
        setDraft({
          setup: structuredClone(setup),
          origins: setup.slots.map((_, index) => index),
        });
      })
      .catch((error) => {
        if (!cancelled) setLoadError(String(error));
      });
    return () => {
      cancelled = true;
    };
    // Services arrive after the first render on a cold start; load once.
  }, [deviceId, serviceKey === ""]);

  const back = () => router.history.back();
  const deviceName = services[0]?.deviceName ?? "Motion sensor";
  const roomScenes = sceneOptions.filter(
    (scene) => scene.groupId === draft?.setup.groupId,
  );
  const problem =
    draft &&
    motionProblem(
      draft.setup,
      scenes.filter((scene) => scene.group === draft.setup.groupId),
    );
  const dirty = JSON.stringify(draft?.setup) !== JSON.stringify(base);

  const update = (patch: Partial<MotionSetup>) =>
    setDraft((current) =>
      current ? { ...current, setup: { ...current.setup, ...patch } } : current,
    );
  const updateSlot = (index: number, patch: Partial<MotionSlot>) =>
    draft &&
    update({
      slots: draft.setup.slots.map((slot, i) =>
        i === index ? { ...slot, ...patch } : slot,
      ),
    });

  const save = async () => {
    if (!instance || !base || !draft || problem) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await invoke("update-hue-resource", {
        resourceType: "behavior_instance",
        id: instance.id,
        body: {
          configuration: buildMotionConfig(
            instance.configuration as never,
            base,
            draft.setup,
            roomZones.find((space) => space.id === draft.setup.groupId)
              ?.resourceType ?? "room",
            draft.origins,
          ),
        },
      });
      toast.success(`${deviceName} updated`);
      back();
    } catch (error) {
      setSaveError(String(error) || "Unable to save the motion setup.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loadError)
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)">
        <TriangleAlert className="size-4 shrink-0" />
        <span>{loadError}</span>
      </div>
    );

  if (!draft)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );

  const { setup } = draft;
  const slot = setup.slots[Math.min(selected, setup.slots.length - 1)];
  const index = Math.min(selected, setup.slots.length - 1);
  const daylightKnown = DAYLIGHT_CHOICES.some(
    (choice) => choice.threshold === setup.darkThreshold,
  );
  const offChoices = [
    ...new Set([
      ...OFF_AFTER_CHOICES,
      ...(slot?.offAfter != null ? [slot.offAfter] : []),
    ]),
  ].sort((a, b) => a - b);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[radial-gradient(circle_at_center,var(--border)_1px,transparent_1px)] bg-size-[24px_24px]">
      <div className="absolute inset-y-0 left-0 right-100 flex items-center justify-center p-8 2xl:right-108">
        <DayDial
          slots={setup.slots}
          scenes={sceneOptions}
          selected={index}
          onSelect={setSelected}
          onMove={(i, time) => updateSlot(i, { time })}
        />
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-muted-foreground">
          Each colour is the scene motion turns on, from that time until the
          next. Click one to change it, or drag its handle to move the time.
        </p>
      </div>

      <aside className="absolute inset-y-6 right-6 z-10 flex w-94 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-xl 2xl:w-102">
        <div className="grid shrink-0 gap-2 p-5 pb-4">
          <Label>Lights</Label>
          <Select
            items={Object.fromEntries(
              roomZones.map((space) => [space.id, space.name]),
            )}
            value={setup.groupId}
            onValueChange={(value) => value && update({ groupId: value })}
            disabled={isSaving}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roomZones.map((space) => (
                <SelectItem key={space.id} value={space.id}>
                  {space.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Motion turns on this room or zone.
          </p>
        </div>

        <ScrollArea
          fade
          hideScrollbar
          className="min-h-0 flex-1 border-t border-border"
          viewportClassName="px-5 pb-5"
          contentClassName="min-w-0!"
        >
          <div className="grid gap-6 pt-4">
            <section className="grid gap-3">
              <p className="text-sm font-medium">Times</p>
              <div className="grid gap-1.5">
                {setup.slots.map((entry, i) => {
                  const scene = roomScenes.find(
                    (option) => option.id === entry.sceneId,
                  );
                  return (
                    <div
                      key={i}
                      data-selected={i === index ? "" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-2 py-1.5",
                        selectableVariants(),
                      )}
                    >
                      {entry.startType === "time" ? (
                        <TimeField
                          ariaLabel={`Time ${i + 1} starts at`}
                          className="h-8"
                          value={entry.time}
                          disabled={isSaving}
                          onChange={(time) => {
                            setSelected(i);
                            updateSlot(i, { time });
                          }}
                        />
                      ) : (
                        <span className="px-2 text-sm font-medium">
                          {clock(entry)}
                        </span>
                      )}
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => setSelected(i)}
                      >
                        {scene?.bubble ? (
                          <span
                            className="size-6 shrink-0 rounded-full ring-1 ring-foreground/15"
                            style={{ background: scene.bubble }}
                          />
                        ) : (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                            <Palette className="size-3.5" />
                          </span>
                        )}
                        <span
                          className={cn(
                            "truncate text-sm",
                            scene ? "font-medium" : "text-muted-foreground",
                          )}
                        >
                          {scene?.name ?? "Choose a scene"}
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove time ${i + 1}`}
                        disabled={isSaving || setup.slots.length <= 1}
                        onClick={() => {
                          setDraft({
                            setup: {
                              ...setup,
                              slots: setup.slots.filter((_, j) => j !== i),
                            },
                            origins: draft.origins.filter((_, j) => j !== i),
                          });
                          setSelected(Math.max(0, i - 1));
                        }}
                      >
                        <X />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-self-start text-muted-foreground"
                  disabled={isSaving}
                  onClick={() => {
                    setDraft({
                      setup: {
                        ...setup,
                        slots: [
                          ...setup.slots,
                          {
                            time: "18:00",
                            startType: "time",
                            sceneId: "",
                            offAfter: 10,
                          },
                        ],
                      },
                      origins: [...draft.origins, null],
                    });
                    setSelected(setup.slots.length);
                  }}
                >
                  <Plus />
                  Add time
                </Button>
              </div>
            </section>

            {slot && (
              <section className="grid gap-3">
                <p className="text-sm font-medium">
                  From {clock(slot)}, motion turns on
                </p>
                {roomScenes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    This room has no scenes yet.
                  </p>
                ) : (
                  <div className={PICKER_TILE_ROW}>
                    {roomScenes.map((scene) => (
                      <SceneOptionTile
                        key={scene.id}
                        scene={scene}
                        selected={slot.sceneId === scene.id}
                        onSelect={() =>
                          updateSlot(index, { sceneId: scene.id })
                        }
                      />
                    ))}
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Turn off when there's no motion</Label>
                  <Select
                    items={{
                      never: "Stay on",
                      ...Object.fromEntries(
                        offChoices.map((minutes) => [
                          String(minutes),
                          offAfterLabel(minutes),
                        ]),
                      ),
                    }}
                    value={
                      slot.offAfter == null ? "never" : String(slot.offAfter)
                    }
                    onValueChange={(value) =>
                      value &&
                      updateSlot(index, {
                        offAfter: value === "never" ? null : Number(value),
                      })
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {offChoices.map((minutes) => (
                        <SelectItem key={minutes} value={String(minutes)}>
                          {offAfterLabel(minutes)}
                        </SelectItem>
                      ))}
                      <SelectItem value="never">Stay on</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </section>
            )}

            {setup.darkThreshold != null && (
              <section className="grid gap-3">
                <p className="text-sm font-medium">When to turn on</p>
                <div className="grid gap-1.5">
                  {[
                    ...DAYLIGHT_CHOICES,
                    ...(daylightKnown
                      ? []
                      : [
                          {
                            threshold: setup.darkThreshold,
                            label: "Custom",
                            detail: "A brightness level set in the Hue app",
                          },
                        ]),
                  ].map((choice) => {
                    const active = choice.threshold === setup.darkThreshold;
                    return (
                      <button
                        key={choice.threshold}
                        type="button"
                        aria-pressed={active}
                        data-selected={active ? "" : undefined}
                        disabled={isSaving}
                        onClick={() =>
                          update({ darkThreshold: choice.threshold })
                        }
                        className={cn(
                          "rounded-xl px-3 py-2 text-left",
                          selectableVariants(),
                        )}
                      >
                        <span className="block text-sm font-medium">
                          {choice.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {choice.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        </ScrollArea>

        <div className="grid shrink-0 gap-2 border-t border-border p-5 pt-4">
          {(saveError || (dirty && problem)) && (
            <p className="text-sm text-(--destructive-text)">
              {saveError ?? problem}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isSaving}
              onClick={back}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!dirty || isSaving || problem != null}
              onClick={() => void save()}
            >
              {isSaving && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
};
