import { PacedSlider } from "@/components/PacedSlider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  OptionTile,
  SegmentedOptions,
  SettingRow,
  SyncHero,
  SyncHeroChip,
  SyncToggleButton,
} from "@/components/sync/SyncControls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { boxesForBridge, useSyncBoxStore } from "@/stores/SyncBoxStore";
import type {
  SyncBoxExecutionUpdate,
  SyncBoxIntensity,
  SyncBoxMode,
  SyncBoxSession,
} from "@/types/sync-box";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Clapperboard,
  Gamepad2,
  HdmiPort,
  Lightbulb,
  Loader2,
  MonitorPlay,
  Music2,
  Plus,
  Power,
  TriangleAlert,
  Tv,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SyncBoxOnboardingWizard } from "./SyncBoxOnboardingWizard";
import { useSyncBoxPolling } from "./hooks/useSyncBoxPolling";

const formatContentSpecs = (specs: string): string =>
  specs.replace(
    /@\s*(\d+)/,
    (_match, fpks: string) =>
      `@ ${Number((Number(fpks) / 1000).toFixed(3))} fps`,
  );

const modeOptions: {
  mode: SyncBoxMode;
  label: string;
  description: string;
  icon: typeof Clapperboard;
}[] = [
  {
    mode: "video",
    label: "Video",
    description: "Movies & TV",
    icon: Clapperboard,
  },
  {
    mode: "game",
    label: "Game",
    description: "Fast reactions",
    icon: Gamepad2,
  },
  {
    mode: "music",
    label: "Music",
    description: "Follow the beat",
    icon: Music2,
  },
];

const sourceIcons: Record<string, typeof MonitorPlay> = {
  game: Gamepad2,
  xbox: Gamepad2,
  playstation: Gamepad2,
  nintendoswitch: Gamepad2,
  music: Music2,
  desktop: MonitorPlay,
  laptop: MonitorPlay,
};

export const SyncBoxScreen = ({
  areaId,
  setupOnly = false,
}: {
  areaId?: string;
  /** Opens straight on pairing, for adding a box from the hub or Settings. */
  setupOnly?: boolean;
}) => {
  const navigate = useNavigate();
  const session = useSyncBoxStore((store) => store.session);
  const sessionLoading = useSyncBoxStore((store) => store.sessionLoading);
  const loadSession = useSyncBoxStore((store) => store.loadSession);
  const setSession = useSyncBoxStore((store) => store.setSession);
  const [adding, setAdding] = useState(setupOnly);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  if (sessionLoading && !session) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const configured = session?.configured === true && session.syncBox != null;
  const leaveSetup = () => {
    if (setupOnly) {
      void navigate({
        to: "/sync",
        search: { source: undefined },
        replace: true,
      });
      return;
    }
    setAdding(false);
  };

  if (adding || !configured) {
    return (
      <>
        {configured ? (
          <div className="mx-auto flex w-full max-w-5xl">
            <Button variant="ghost" className="gap-2" onClick={leaveSetup}>
              <ArrowLeft size={16} />
              Back to {session.syncBox?.name ?? "Sync Box"}
            </Button>
          </div>
        ) : (
          session?.error && (
            <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>{session.error}</p>
            </div>
          )
        )}
        <SyncBoxOnboardingWizard
          onComplete={(nextSession) => {
            setSession(nextSession);
            leaveSetup();
          }}
        />
      </>
    );
  }

  return (
    <SyncBoxConnectedView
      session={session}
      areaId={areaId}
      onPair={() => setAdding(true)}
    />
  );
};

/** Pairing a box beyond the first is Mote Pro; re-pairing a saved one is not. */
const useAddSyncBox = (session: SyncBoxSession, onPair: () => void) => {
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  return () => {
    if (!hasPro && session.syncBoxes.length > 0) {
      requestPro("multiple_sync_boxes");
      return;
    }
    onPair();
  };
};

/**
 * Which box the screen controls, when there is more than one on this bridge,
 * and the way to pair another.
 */
const SyncBoxPicker = ({
  session,
  onAdd,
}: {
  session: SyncBoxSession;
  onAdd: () => void;
}) => {
  const { bridgeId } = useHue();
  const selectBox = useSyncBoxStore((store) => store.selectBox);
  const boxes = boxesForBridge(session, bridgeId);
  const active = session.syncBox;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {boxes.length > 1 ? (
        <Select
          value={active?.uniqueId ?? ""}
          onValueChange={(uniqueId) => uniqueId && void selectBox(uniqueId)}
        >
          <SelectTrigger aria-label="Sync Box" className="w-64">
            <Tv className="size-4 text-muted-foreground" />
            <SelectValue>{active?.name ?? "Sync Box"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {boxes.map((syncBox) => (
              <SelectItem key={syncBox.uniqueId} value={syncBox.uniqueId}>
                {syncBox.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span />
      )}
      <Button variant="outline" className="gap-2" onClick={onAdd}>
        <Plus size={16} />
        Add Sync Box
      </Button>
    </div>
  );
};

export const SyncBoxConnectedView = ({
  session,
  areaId,
  onPair,
}: {
  session: SyncBoxSession;
  areaId?: string;
  /** Opens pairing, to add another box or to pair this one again. */
  onPair: () => void;
}) => {
  const navigate = useNavigate();
  const addSyncBox = useAddSyncBox(session, onPair);
  const entertainmentAreas = useEntertainmentStore((store) => store.areas);
  const syncBox = session.syncBox;
  const {
    state,
    error,
    loadError,
    isLoading,
    isUpdating,
    refresh,
    updateExecution,
    updateMode,
    startSync,
    clear,
  } = useSyncBoxStore();
  useSyncBoxPolling();
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [isTogglingSync, setIsTogglingSync] = useState(false);
  const [effectBrightness, setEffectBrightness] = useState<number | null>(null);

  if (isLoading && !state) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <SyncBoxPicker session={session} onAdd={addSyncBox} />
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)">
          <span>
            {loadError ?? session.error ?? "Unable to read Sync Box state."}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                clear();
                onPair();
              }}
            >
              Pair again
            </Button>
            <Button
              variant="outline"
              disabled={isLoading}
              onClick={() => void refresh()}
            >
              {isLoading && <Loader2 className="animate-spin" />}
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const execution = state.execution;
  // "busy" means the box is paired and reachable — another app just owns the
  // bridge's entertainment stream right now, so starting sync is a takeover,
  // not a connection problem.
  const hueConnected =
    state.hue.connectionState === "connected" ||
    state.hue.connectionState === "streaming" ||
    state.hue.connectionState === "busy";
  // An active stream on the bridge that isn't this box's own sync session.
  const conflictingStream =
    Object.entries(state.hue.groups).find(
      ([id, group]) =>
        group.active && !(execution.syncActive && execution.hueTarget === id),
    ) ?? null;
  const streamConflict =
    !execution.syncActive &&
    (conflictingStream != null || state.hue.connectionState === "busy");
  const conflictOwner = conflictingStream?.[1].owner ?? "another app";
  const sources = ["input1", "input2", "input3", "input4"] as const;
  const selectedSource = sources.find(
    (source) => source === execution.hdmiSource,
  );
  const displayedMode =
    modeOptions.find(({ mode }) => mode === execution.mode)?.mode ??
    modeOptions.find(
      ({ mode }) =>
        mode ===
        (selectedSource
          ? state.hdmi[selectedSource].lastSyncMode
          : execution.lastSyncMode),
    )?.mode ??
    "video";
  const currentIntensity = state.execution[displayedMode]?.intensity;
  const selectedSourceUnplugged =
    selectedSource != null && state.hdmi[selectedSource].status === "unplugged";
  const requestedArea = areaId
    ? entertainmentAreas.find((area) => area.id === areaId)
    : undefined;
  const resolvedGroupEntry = areaId
    ? Object.entries(state.hue.groups).find(
        ([id, group]) =>
          id === areaId ||
          (requestedArea != null &&
            group.name.trim().toLocaleLowerCase() ===
              requestedArea.name.trim().toLocaleLowerCase()),
      )
    : undefined;
  const resolvedAreaId = resolvedGroupEntry?.[0] ?? areaId;
  const selectedGroup = areaId
    ? resolvedGroupEntry?.[1]
    : execution.hueTarget
      ? state.hue.groups[execution.hueTarget]
      : undefined;
  const syncingHere =
    execution.syncActive && execution.hueTarget === resolvedAreaId;
  const syncingElsewhere = execution.syncActive && !syncingHere;
  const syncingElsewhereName = syncingElsewhere
    ? ((execution.hueTarget
        ? state.hue.groups[execution.hueTarget]?.name
        : null) ?? "another area")
    : null;
  const brightnessPercent = Math.round(execution.brightness / 2);

  if (!selectedGroup) {
    return (
      <Card className="mx-auto max-w-xl border-dashed">
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <TriangleAlert className="mb-4 size-8 text-muted-foreground" />
          <p className="font-medium">Entertainment area not found</p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={() =>
              void navigate({ to: "/sync", search: { source: undefined } })
            }
          >
            Back to entertainment areas
          </Button>
        </CardContent>
      </Card>
    );
  }

  const toggleSync = async () => {
    if (isTogglingSync) return;
    setIsTogglingSync(true);
    try {
      if (syncingHere) {
        await updateExecution({ syncActive: false });
        return;
      }
      if (resolvedAreaId) await startSync(resolvedAreaId);
    } finally {
      setIsTogglingSync(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5 pb-8">
      <SyncBoxPicker session={session} onAdd={addSyncBox} />
      {(state.device.overheating || state.device.undervolt) && (
        <div className="flex items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            {state.device.overheating
              ? "The Sync Box is overheating. Turn it off and check its ventilation."
              : "The Sync Box reports insufficient power. Check its power supply."}
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)">
          {error}
        </div>
      )}

      <SyncHero
        icon={Tv}
        title={`Sync with ${syncBox?.name ?? state.device.name}`}
        active={syncingHere}
        statusLabel={
          syncingHere
            ? `Lights are syncing with ${syncBox?.name ?? "the Sync Box"}`
            : syncingElsewhere
              ? `Syncing with ${syncingElsewhereName}`
              : "Ready to sync"
        }
        meta={
          state.hdmi.contentSpecs && !selectedSourceUnplugged
            ? formatContentSpecs(state.hdmi.contentSpecs)
            : "Waiting for an HDMI signal"
        }
        aside={
          <>
            <SyncHeroChip
              icon={Power}
              label="Power"
              caption={execution.hdmiActive ? "On" : "Standby"}
              active={execution.hdmiActive}
              control={
                <Switch
                  size="lg"
                  aria-label="Toggle Sync Box power"
                  checked={execution.hdmiActive}
                  disabled={isUpdating}
                  dimWhenDisabled={false}
                  onCheckedChange={(checked) =>
                    void updateExecution({ hdmiActive: checked })
                  }
                />
              }
            />
            <SyncToggleButton
              active={syncingHere}
              busy={isTogglingSync}
              locked={isUpdating}
              disabled={
                syncingElsewhere ||
                (!syncingHere && (!hueConnected || !resolvedAreaId))
              }
              onClick={() => {
                if (streamConflict) setTakeoverOpen(true);
                else void toggleSync();
              }}
            />
          </>
        }
        notice={
          syncingElsewhere ? (
            <p className="text-sm text-muted-foreground">
              Stop the Sync Box in {syncingElsewhereName} before starting it
              here.
            </p>
          ) : !hueConnected ? (
            <p className="text-sm text-(--destructive-text)">
              Connect the Sync Box to its Hue Bridge to start syncing.
            </p>
          ) : streamConflict ? (
            <p className="flex items-start gap-2 text-sm text-(--warn-text)">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {conflictingStream
                  ? `${conflictingStream[1].name} is syncing with ${conflictOwner}.`
                  : "Another app is syncing with the Hue Bridge."}
              </span>
            </p>
          ) : null
        }
      >
        <p className="mb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Source
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {sources.map((source) => {
            const input = state.hdmi[source];
            const SourceIcon = sourceIcons[input.type ?? ""] ?? HdmiPort;
            return (
              <OptionTile
                key={source}
                icon={SourceIcon}
                label={input.name}
                caption={
                  <span className="capitalize">
                    {input.status ?? `HDMI ${source.slice(-1)}`}
                  </span>
                }
                selected={execution.hdmiSource === source}
                locked={isUpdating}
                onSelect={() => void updateExecution({ hdmiSource: source })}
              />
            );
          })}
        </div>
      </SyncHero>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sync style</CardTitle>
            <CardDescription>
              How the lights interpret your content.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid grid-cols-3 gap-2.5">
              {modeOptions.map(({ mode, label, description, icon: Icon }) => (
                <OptionTile
                  key={mode}
                  vertical
                  icon={Icon}
                  label={label}
                  caption={description}
                  selected={displayedMode === mode}
                  locked={isUpdating}
                  onSelect={() => void updateMode(mode)}
                />
              ))}
            </div>
            {currentIntensity && (
              <SettingRow
                title="Intensity"
                description="How quickly and dramatically colors change."
                className="border-t border-border pt-4"
              >
                <SegmentedOptions
                  ariaLabel="Sync intensity"
                  value={currentIntensity}
                  locked={isUpdating}
                  options={(
                    ["subtle", "moderate", "high", "intense"] as const
                  ).map((intensity) => ({
                    value: intensity,
                    label:
                      intensity.charAt(0).toUpperCase() + intensity.slice(1),
                  }))}
                  onValueChange={(intensity) => {
                    const value = intensity as SyncBoxIntensity;
                    const update: SyncBoxExecutionUpdate =
                      displayedMode === "video"
                        ? { video: { intensity: value } }
                        : displayedMode === "game"
                          ? { game: { intensity: value } }
                          : { music: { intensity: value } };
                    void updateExecution(update);
                  }}
                />
              </SettingRow>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Light response</CardTitle>
            <CardDescription>
              Fine-tune how strongly the entertainment lights react.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <SettingRow
              icon={Lightbulb}
              title="Effect brightness"
              description="50% is neutral; higher values boost the effect."
            >
              <span className="rounded-lg bg-muted px-2.5 py-1 font-mono text-sm">
                {effectBrightness ?? brightnessPercent}%
              </span>
            </SettingRow>
            <PacedSlider
              ariaLabel="Effect brightness"
              min={0}
              max={100}
              step={1}
              value={brightnessPercent}
              disabled={isUpdating}
              dimWhenDisabled={false}
              isGroup={false}
              onInput={setEffectBrightness}
              onCommit={(value, phase) => {
                setEffectBrightness(value);
                if (phase === "final") {
                  void updateExecution({ brightness: value * 2 }).finally(() =>
                    setEffectBrightness(null),
                  );
                }
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Dimmer</span>
              <span>Neutral</span>
              <span>Boost</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-1">
        <span className="text-sm text-muted-foreground">
          {state.hdmi.videoSyncSupported
            ? "Video ready"
            : "Video sync unavailable"}{" "}
          ·{" "}
          {state.hdmi.audioSyncSupported
            ? "Audio ready"
            : "Audio sync unavailable"}
        </span>
      </div>

      <AlertDialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take over light sync?</AlertDialogTitle>
            <AlertDialogDescription>
              Lights will stop syncing with{" "}
              <span className="font-medium text-foreground">
                {conflictOwner}
              </span>{" "}
              if you start light sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              size="xl"
              onClick={() => {
                setTakeoverOpen(false);
                void toggleSync();
              }}
            >
              Start anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
