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
import { Switch } from "@/components/ui/switch";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import type {
  SyncBoxExecutionUpdate,
  SyncBoxIntensity,
  SyncBoxMode,
  SyncBoxSession,
} from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { Navigate, useNavigate } from "@tanstack/react-router";
import {
  Cable,
  Clapperboard,
  Gamepad2,
  HdmiPort,
  Lightbulb,
  Loader2,
  MonitorPlay,
  Music2,
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
  setupOnly?: boolean;
}) => {
  const navigate = useNavigate();
  const [session, setSession] = useState<SyncBoxSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void invoke<SyncBoxSession>("get-sync-box-session")
      .then(setSession)
      .catch((error) => setLoadError(String(error)))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session?.configured || !session.syncBox) {
    return (
      <>
        {(loadError || session?.error) && (
          <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{loadError ?? session?.error}</p>
          </div>
        )}
        <SyncBoxOnboardingWizard
          onComplete={(nextSession) => {
            if (setupOnly) {
              void navigate({
                to: "/sync",
                search: { source: undefined },
                replace: true,
              });
              return;
            }
            setSession(nextSession);
          }}
        />
      </>
    );
  }

  if (setupOnly) {
    return <Navigate to="/sync" search={{ source: undefined }} replace />;
  }

  return (
    <SyncBoxConnectedView
      session={session}
      areaId={areaId}
      onReset={() => {
        void invoke("reset-sync-box-session").then(() =>
          setSession({
            configured: false,
            connected: false,
            syncBox: null,
            error: null,
          }),
        );
      }}
    />
  );
};

export const SyncBoxConnectedView = ({
  session,
  areaId,
  onReset,
}: {
  session: SyncBoxSession;
  areaId?: string;
  onReset: () => void;
}) => {
  const navigate = useNavigate();
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
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)">
        <span>
          {loadError ?? session.error ?? "Unable to read Sync Box state."}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              clear();
              onReset();
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
            ? "Lights are syncing with the Sync Box"
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

      <div className="flex flex-wrap items-center justify-between gap-4 px-1">
        <span className="text-sm text-muted-foreground">
          {state.hdmi.videoSyncSupported
            ? "Video ready"
            : "Video sync unavailable"}{" "}
          ·{" "}
          {state.hdmi.audioSyncSupported
            ? "Audio ready"
            : "Audio sync unavailable"}
        </span>
        <Button
          variant="ghost"
          className="gap-2"
          onClick={() => {
            clear();
            onReset();
          }}
        >
          <Cable size={16} />
          Set up another Sync Box
        </Button>
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
