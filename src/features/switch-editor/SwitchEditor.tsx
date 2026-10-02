import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TimeField } from "@/components/TimeField";
import { formatClock } from "@/stores/FormatPreferencesStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { buttonLabel } from "@/components/sensor-readings";
import { PICKER_TILE_ROW } from "@/features/automations/components/AutomationPickerGroups";
import { SceneOptionTile } from "@/features/automations/components/AutomationScenePicker";
import { useLightGroups } from "@/features/automations/useLightGroups";
import { humanize, isRecord } from "@/features/settings-screen/utils/format";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useRouter } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import {
  Clock,
  Loader2,
  Palette,
  Plus,
  Lightbulb,
  Repeat,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ACTION_LABELS,
  DEFAULT_TIMES,
  HOLD_ACTIONS,
  behaviorsFor,
  buildConfig,
  describeRawPress,
  parseButtonSetup,
  problemWith,
  type BehaviorInstance,
  type ButtonDraft,
  type ButtonSetup,
  type PressDraft,
} from "./button-setup";
import { DimmerModel3D, type DimmerButton } from "./DimmerModel3D";

/** "HH:MM" in the app's time format. */
const clock = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return formatClock(hour, minute);
};

const PRESS_MODES = [
  {
    value: "time",
    label: "Scene for the time of day",
    description: "Turns on the scene set for the time of day it is now",
    icon: Clock,
  },
  {
    value: "cycle",
    label: "Cycle through scenes",
    description: "Each press moves to the next scene",
    icon: Repeat,
  },
  {
    value: "single",
    label: "One scene",
    description: "Every press turns on the same scene",
    icon: Lightbulb,
  },
] as const;

/**
 * Full-screen editor for a Hue dimmer switch's buttons: the switch in 3D on
 * the left, and the chosen button's press and hold on the right.
 */
export const SwitchEditor = ({ deviceId }: { deviceId: string }) => {
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
  const [base, setBase] = useState<ButtonSetup | null>(null);
  const [draft, setDraft] = useState<ButtonSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DimmerButton>(1);
  const [activeStep, setActiveStep] = useState(0);
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
        const found = behaviorsFor(instances, ids).find((candidate) =>
          parseButtonSetup(
            isRecord(candidate.configuration) ? candidate.configuration : {},
          ),
        );
        if (!found) {
          setLoadError("This switch has no button setup on the bridge.");
          return;
        }
        const setup = parseButtonSetup(found.configuration as never)!;
        setInstance(found);
        setBase(setup);
        setDraft(structuredClone(setup));
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
  const deviceName = services[0]?.deviceName ?? "Switch";
  const serviceFor = (button: DimmerButton) =>
    services.find(
      (service) =>
        service.resourceType === "button" && service.controlId === button,
    );
  const buttonDraft = (button: DimmerButton) => {
    const rid = serviceFor(button)?.id;
    return draft?.buttons.find((entry) => entry.rid === rid) ?? null;
  };
  const current = buttonDraft(selected);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const nameOf = (id: string) =>
    scenes.find((scene) => scene.id === id)?.name ??
    roomZones.find((space) => space.id === id)?.name;
  const roomScenes = sceneOptions.filter(
    (scene) => scene.groupId === draft?.groupId,
  );
  const problem =
    draft &&
    problemWith(
      draft,
      scenes.filter((scene) => scene.group === draft.groupId),
    );

  const updateButton = (patch: Partial<ButtonDraft>) =>
    setDraft(
      (setup) =>
        setup && {
          ...setup,
          buttons: setup.buttons.map((entry) =>
            entry.rid === current?.rid ? { ...entry, ...patch } : entry,
          ),
        },
    );
  const setPress = (patch: Partial<PressDraft>) =>
    current?.press && updateButton({ press: { ...current.press, ...patch } });

  const save = async () => {
    if (!instance || !draft || problem) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await invoke("update-hue-resource", {
        resourceType: "behavior_instance",
        id: instance.id,
        body: {
          configuration: buildConfig(
            instance.configuration as never,
            base!,
            draft,
            roomZones.find((space) => space.id === draft.groupId)
              ?.resourceType ?? "room",
          ),
        },
      });
      toast.success(`${deviceName} updated`);
      back();
    } catch (error) {
      setSaveError(String(error) || "Unable to save the button setup.");
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

  const label = serviceFor(selected)
    ? buttonLabel(serviceFor(selected)!)
    : "Button";
  const slots = current?.press?.slots ?? [];
  const step = Math.min(activeStep, Math.max(slots.length - 1, 0));

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[radial-gradient(circle_at_center,var(--border)_1px,transparent_1px)] bg-size-[24px_24px]">
      <div className="absolute inset-y-0 left-0 right-100 2xl:right-108">
        <DimmerModel3D
          className="h-full w-full"
          selected={selected}
          configurable={(button) => buttonDraft(button) != null}
          onSelect={(button) => {
            setSelected(button);
            setActiveStep(0);
          }}
        />
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-muted-foreground">
          Click a button to set it up. Drag to turn, scroll to zoom,
          double-click to reset.
        </p>
      </div>

      <aside className="absolute inset-y-6 right-6 z-10 flex w-94 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-xl 2xl:w-102">
        <div className="grid shrink-0 gap-2 p-5 pb-4">
          <Label>Controls</Label>
          <Select
            items={Object.fromEntries(
              roomZones.map((space) => [space.id, space.name]),
            )}
            value={draft.groupId}
            onValueChange={(value) =>
              value && setDraft({ ...draft, groupId: value })
            }
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
            Every button acts on this room or zone.
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
            <h2 className="font-heading text-base font-semibold">{label}</h2>

            {!current ? (
              <p className="text-sm text-muted-foreground">
                This button isn't part of the switch's setup.
              </p>
            ) : !current.press && current.pressRaw != null ? (
              <section className="grid gap-1">
                <p className="text-sm font-medium">Press</p>
                <p className="text-sm">
                  {describeRawPress(current.pressRaw, nameOf)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Set up in a way Mote can't change yet. It stays as it is when
                  you save.
                </p>
              </section>
            ) : !current.press && !current.hold ? (
              <p className="text-sm text-muted-foreground">
                {current.repeat
                  ? `${ACTION_LABELS[current.repeat] ?? humanize(current.repeat)} the lights while it's held. This can't be changed.`
                  : "It does nothing."}
              </p>
            ) : null}

            {current?.press && (
              <section className="grid gap-3">
                <p className="text-sm font-medium">Press</p>
                <div className="grid gap-1.5">
                  {PRESS_MODES.map(
                    ({ value, label: modeLabel, description, icon: Icon }) => {
                      const active = current.press!.mode === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={active}
                          data-selected={active ? "" : undefined}
                          disabled={isSaving}
                          onClick={() => {
                            setPress({
                              mode: value,
                              // One scene keeps the first step only.
                              ...(value === "single"
                                ? {
                                    slots: [
                                      slots[0] ?? {
                                        time: DEFAULT_TIMES[0],
                                        sceneId: "",
                                      },
                                    ],
                                  }
                                : null),
                            });
                            setActiveStep(0);
                          }}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2 text-left",
                            selectableVariants(),
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              active
                                ? "text-foreground"
                                : "text-muted-foreground",
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {modeLabel}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {description}
                            </span>
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>

                {current.press.mode !== "single" && (
                  <div className="grid gap-1.5">
                    {slots.map((slot, index) => {
                      const scene = roomScenes.find(
                        (option) => option.id === slot.sceneId,
                      );
                      const active = index === step;
                      return (
                        <div
                          key={index}
                          data-selected={active ? "" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-xl px-2 py-1.5",
                            selectableVariants(),
                          )}
                        >
                          {current.press!.mode === "time" ? (
                            <TimeField
                              ariaLabel={`Step ${index + 1} starts at`}
                              className="h-8"
                              value={slot.time}
                              disabled={isSaving}
                              onChange={(time) => {
                                setActiveStep(index);
                                setPress({
                                  slots: slots.map((entry, i) =>
                                    i === index ? { ...entry, time } : entry,
                                  ),
                                });
                              }}
                            />
                          ) : (
                            <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">
                              {index + 1}
                            </span>
                          )}
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            onClick={() => setActiveStep(index)}
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
                            aria-label={`Remove step ${index + 1}`}
                            disabled={isSaving || slots.length <= 1}
                            onClick={() => {
                              setPress({
                                slots: slots.filter((_, i) => i !== index),
                              });
                              setActiveStep(Math.max(0, index - 1));
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
                        setPress({
                          slots: [
                            ...slots,
                            {
                              time: DEFAULT_TIMES[slots.length] ?? "12:00",
                              sceneId: "",
                            },
                          ],
                        });
                        setActiveStep(slots.length);
                      }}
                    >
                      <Plus />
                      {current.press.mode === "time" ? "Add time" : "Add scene"}
                    </Button>
                  </div>
                )}

                {slots.length > 0 && (
                  <div className="grid gap-2">
                    <p className="text-xs text-muted-foreground">
                      {current.press.mode === "single"
                        ? "Scene"
                        : `Scene for step ${step + 1}`}
                      {current.press.mode === "time"
                        ? `, from ${clock(slots[step].time)}`
                        : ""}
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
                            selected={slots[step].sceneId === scene.id}
                            onSelect={() =>
                              setPress({
                                slots: slots.map((entry, i) =>
                                  i === step
                                    ? { ...entry, sceneId: scene.id }
                                    : entry,
                                ),
                              })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="with-off">
                    Pressing again turns the lights off
                  </Label>
                  <Switch
                    id="with-off"
                    checked={current.press.withOff}
                    disabled={isSaving}
                    onCheckedChange={(withOff) => setPress({ withOff })}
                  />
                </div>
              </section>
            )}

            {current?.hold && (
              <section className="grid gap-3">
                <p className="text-sm font-medium">Hold</p>
                <div className="grid gap-1.5">
                  {[
                    ...HOLD_ACTIONS,
                    ...(HOLD_ACTIONS.includes(current.hold)
                      ? []
                      : [current.hold]),
                  ].map((action) => {
                    const active = current.hold === action;
                    return (
                      <button
                        key={action}
                        type="button"
                        aria-pressed={active}
                        data-selected={active ? "" : undefined}
                        disabled={isSaving}
                        onClick={() => updateButton({ hold: action })}
                        className={cn(
                          "rounded-xl px-3 py-2 text-left text-sm font-medium",
                          selectableVariants(),
                        )}
                      >
                        {ACTION_LABELS[action] ?? humanize(action)}
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
