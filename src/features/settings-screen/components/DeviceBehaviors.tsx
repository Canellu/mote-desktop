import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonLabel } from "@/components/sensor-readings";
import {
  ACTION_LABELS,
  behaviorsFor,
  describeRawPress,
  parseButtonSetup,
  referencesIn,
  type BehaviorInstance,
  type BehaviorScript,
  type ButtonDraft,
  type Json,
} from "@/features/switch-editor/button-setup";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useLightGroups } from "@/features/automations/useLightGroups";
import { cn } from "@/lib/utils";
import {
  DAYLIGHT_CHOICES,
  parseMotionSetup,
  type MotionSetup,
} from "@/features/switch-editor/motion-setup";
import { formatClock } from "@/stores/FormatPreferencesStore";
import type { HueAccessoryService, HueRoomZone } from "@/types/hue";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { DetailsSection } from "./DetailsSheet";
import { humanize, isRecord } from "../utils/format";

/**
 * What a switch's buttons or a sensor's motion are set up to do on the bridge,
 * read from its behaviors. A switch's button setup opens in the switch editor.
 */
export const DeviceBehaviors = ({
  deviceId,
  services,
  roomZones,
}: {
  deviceId: string;
  services: HueAccessoryService[];
  roomZones: HueRoomZone[];
}) => {
  const [behaviors, setBehaviors] = useState<Array<{
    instance: BehaviorInstance;
    script?: BehaviorScript;
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const serviceKey = services.map((service) => service.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = new Set([deviceId, ...serviceKey.split(",").filter(Boolean)]);
    void Promise.all([
      invoke<BehaviorInstance[]>("get-hue-resource", {
        resourceType: "behavior_instance",
      }),
      invoke<BehaviorScript[]>("get-hue-resource", {
        resourceType: "behavior_script",
      }),
    ])
      .then(([instances, scripts]) => {
        if (cancelled) return;
        setBehaviors(
          behaviorsFor(instances, ids).map((instance) => ({
            instance,
            script: scripts.find((script) => script.id === instance.script_id),
          })),
        );
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error(loadError);
        setError(String(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, serviceKey]);

  return (
    <DetailsSection title="What it does">
      {error ? (
        <p className="text-sm text-muted-foreground">
          Couldn't read this from the bridge.
        </p>
      ) : behaviors == null ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : behaviors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing uses it yet. Set up what it does in the Hue app, and it shows
          here.
        </p>
      ) : (
        <div className="grid gap-4">
          {behaviors.map(({ instance, script }) => (
            <BehaviorCard
              key={instance.id}
              deviceId={deviceId}
              instance={instance}
              script={script}
              services={services}
              roomZones={roomZones}
            />
          ))}
        </div>
      )}
    </DetailsSection>
  );
};

const BehaviorCard = ({
  deviceId,
  instance,
  script,
  services,
  roomZones,
}: {
  deviceId: string;
  instance: BehaviorInstance;
  script?: BehaviorScript;
  services: HueAccessoryService[];
  roomZones: HueRoomZone[];
}) => {
  const navigate = useNavigate();
  const scenes = useHueResourcesStore((state) => state.scenes);

  const config = isRecord(instance.configuration) ? instance.configuration : {};
  const setup = parseButtonSetup(config);
  const motion = setup ? null : parseMotionSetup(config);
  const nameOf = (id: string) =>
    scenes.find((scene) => scene.id === id)?.name ??
    roomZones.find((space) => space.id === id)?.name ??
    roomZones.find((space) => space.groupedLightId === id)?.name;
  const places = setup
    ? [nameOf(setup.groupId)].filter(Boolean)
    : motion
      ? [nameOf(motion.groupId)].filter(Boolean)
      : [
          ...new Set(
            referencesIn(config)
              .filter((ref) =>
                ["room", "zone", "grouped_light"].includes(ref.rtype),
              )
              .map((ref) => nameOf(ref.rid))
              .filter(Boolean),
          ),
        ];
  const serviceOf = (rid: string) =>
    services.find((service) => service.id === rid);
  const ordered = (setup?.buttons ?? [])
    .slice()
    .sort(
      (a, b) =>
        (serviceOf(a.rid)?.controlId ?? Number.MAX_SAFE_INTEGER) -
        (serviceOf(b.rid)?.controlId ?? Number.MAX_SAFE_INTEGER),
    );

  return (
    <div className="grid gap-4 rounded-xl border border-border/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {instance.metadata?.name ?? script?.metadata?.name ?? "Behavior"}
          </p>
          {places.length > 0 && (
            <p className="truncate text-xs text-muted-foreground">
              Controls {places.join(", ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!instance.enabled && <Badge variant="secondary">Off</Badge>}
          {(setup || motion) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void navigate({
                  to: setup
                    ? "/settings/switch/$deviceId"
                    : "/settings/motion/$deviceId",
                  params: { deviceId },
                })
              }
            >
              <Pencil />
              Edit
            </Button>
          )}
        </div>
      </div>

      {ordered.length > 0 && (
        <div className="grid divide-y divide-border/60 border-t border-border/60">
          {ordered.map((button, index) => {
            const service = serviceOf(button.rid);
            return (
              <ButtonSummary
                key={button.rid}
                label={service ? buttonLabel(service) : `Button ${index + 1}`}
                button={button}
                nameOf={nameOf}
              />
            );
          })}
        </div>
      )}

      {motion && <MotionSummary setup={motion} nameOf={nameOf} />}
      {!setup && !motion && <GenericSummary config={config} />}
    </div>
  );
};

/** A scene's name after a dot in its own colours, as on the scene tiles. */
const SceneName = ({
  id,
  name,
  prefix,
}: {
  id: string;
  name: (id: string) => string;
  prefix?: string;
}) => {
  const { sceneOptions } = useLightGroups();
  const bubble = sceneOptions.find((scene) => scene.id === id)?.bubble;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "size-3 shrink-0 rounded-full ring-1 ring-foreground/15",
          !bubble && "bg-foreground/15",
        )}
        style={bubble ? { background: bubble } : undefined}
      />
      <span className="truncate">
        {prefix}
        {name(id)}
      </span>
    </span>
  );
};

/** One button's setup in words. */
const ButtonSummary = ({
  label,
  button,
  nameOf,
}: {
  label: string;
  button: ButtonDraft;
  nameOf: (id: string) => string | undefined;
}) => {
  const scene = (id: string) => nameOf(id) ?? "Unknown scene";
  const rows: Array<[string, React.ReactNode]> = [];
  if (button.press) {
    const press = button.press;
    rows.push([
      "Press",
      <div className="grid gap-1">
        {press.mode === "single" ? (
          <SceneName
            id={press.slots[0]?.sceneId ?? ""}
            name={scene}
            prefix="Turns on "
          />
        ) : press.mode === "time" ? (
          <>
            <span>Scene for the time of day</span>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-muted-foreground">
              {press.slots.map((slot) => (
                <div key={slot.time} className="contents">
                  <dt className="tabular-nums">
                    {formatClock(
                      ...(slot.time.split(":").map(Number) as [number, number]),
                    )}
                  </dt>
                  <dd className="min-w-0">
                    <SceneName id={slot.sceneId} name={scene} />
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <>
            <span>Cycles through scenes</span>
            <ol className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-muted-foreground">
              {press.slots.map((slot, index) => (
                <li key={index} className="contents">
                  <span className="tabular-nums">{index + 1}</span>
                  <SceneName id={slot.sceneId} name={scene} />
                </li>
              ))}
            </ol>
          </>
        )}
        {press.withOff && (
          <span className="text-muted-foreground">
            Pressing again turns the lights off
          </span>
        )}
      </div>,
    ]);
  }
  const rawPress = button.press
    ? null
    : describeRawPress(button.pressRaw, nameOf);
  if (rawPress) rows.push(["Press", rawPress]);
  if (button.hold && button.hold !== "do_nothing")
    rows.push(["Hold", ACTION_LABELS[button.hold] ?? humanize(button.hold)]);
  if (button.repeat)
    rows.push([
      "Hold",
      `${ACTION_LABELS[button.repeat] ?? humanize(button.repeat)} while held`,
    ]);

  return (
    <div className="grid gap-2 py-3 text-sm last:pb-0">
      <p className="font-medium">{label}</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Does nothing</p>
      ) : (
        <dl className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-2">
          {rows.map(([event, text], index) => (
            <div key={index} className="contents">
              <dt className="text-muted-foreground">{event}</dt>
              <dd className="min-w-0">{text}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

/** A motion setup in words: each time, its scene, and when lights go off. */
const MotionSummary = ({
  setup,
  nameOf,
}: {
  setup: MotionSetup;
  nameOf: (id: string) => string | undefined;
}) => {
  const daylight =
    setup.darkThreshold == null
      ? null
      : (DAYLIGHT_CHOICES.find(
          (choice) => choice.threshold === setup.darkThreshold,
        )?.label ?? "At a custom brightness");
  return (
    <div className="grid gap-3 text-sm">
      <dl className="grid gap-1.5">
        {setup.slots.map((slot, index) => {
          const [hour = 0, minute = 0] = slot.time.split(":").map(Number);
          return (
            <div
              key={index}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3"
            >
              <dt className="text-muted-foreground tabular-nums">
                From{" "}
                {slot.startType === "time"
                  ? formatClock(hour, minute)
                  : humanize(slot.startType)}
              </dt>
              <dd className="min-w-0">
                <SceneName
                  id={slot.sceneId}
                  name={(id) => nameOf(id) ?? "Something else"}
                />
                <span className="block pl-5 text-muted-foreground">
                  {slot.offAfter == null
                    ? "Stays on"
                    : `Off after ${slot.offAfter} min`}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      {daylight && (
        <p className="text-muted-foreground">When to turn on: {daylight}</p>
      )}
    </div>
  );
};

/** For a behavior this app can't describe yet. */
const GenericSummary = ({ config }: { config: Json }) => {
  const parts = Object.keys(config)
    .filter((key) => !["device", "model_id", "where"].includes(key))
    .map(humanize);
  return parts.length > 0 ? (
    <p className="text-sm text-muted-foreground">
      Uses {parts.join(", ").toLowerCase()}.
    </p>
  ) : null;
};
