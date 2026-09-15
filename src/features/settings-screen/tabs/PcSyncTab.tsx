import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  builtinPalettes,
  channelCounts,
  paletteToSelectValue,
  selectValueToPalette,
  stopBehaviors,
} from "@/features/host-sync/constants";
import { useHostSync } from "@/features/host-sync/useHostSync";
import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HostSyncDisplay } from "@/types/host-sync";
import {
  BadgeCheck,
  Loader2,
  Monitor,
  MonitorPlay,
  TriangleAlert,
} from "lucide-react";
import { Panel } from "../components/Panel";

/**
 * Connection settings for PC-hosted light sync: entertainment credential,
 * display selection, audio output, Music defaults, and stop behavior.
 */
export const PcSyncTab = ({ onOpenSync }: { onOpenSync: () => void }) => {
  const {
    overview,
    isLoading,
    isUpdating,
    loadError,
    actionError,
    refresh,
    savePreferences,
    provisionCredentials,
  } = useHostSync();
  const scenes = useHueResourcesStore((store) => store.scenes);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading PC sync settings"
        className="flex min-h-48 items-center justify-center"
      >
        <Loader2
          aria-hidden
          className="size-6 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  if (loadError || !overview) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)"
      >
        <span>{loadError ?? "Unable to read PC sync settings."}</span>
        <Button variant="outline" onClick={() => void refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  const prefs = overview.preferences;
  const musicScenes = scenes.filter(
    (scene) => scene.resourceType === "scene" && scene.colors.length > 0,
  );
  const paletteValue = paletteToSelectValue(prefs.musicPalette);
  const selectedDisplayIds = new Set(prefs.displayIds);

  const toggleDisplay = (display: HostSyncDisplay) => {
    const next = new Set(selectedDisplayIds);
    if (next.has(display.id)) next.delete(display.id);
    else next.add(display.id);
    // At least one display stays selected.
    if (next.size === 0) return;
    void savePreferences({ displayIds: [...next] });
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MonitorPlay size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">PC Sync</p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                "size-2 rounded-full",
                overview.credentials.hasClientKey
                  ? "bg-green-500"
                  : "bg-muted-foreground/50",
              )}
            />
            {overview.credentials.hasClientKey
              ? "Ready to sync"
              : "Not enabled yet"}
          </p>
        </div>
        {overview.credentials.hasClientKey && (
          <Button variant="outline" onClick={onOpenSync}>
            Open sync controls
          </Button>
        )}
      </div>

      {(actionError || overview.areasError) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{actionError ?? overview.areasError}</p>
        </div>
      )}

      <Panel title="Entertainment credential">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              overview.credentials.hasClientKey
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <BadgeCheck size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="space-y-1">
              <p className="font-medium">
                {overview.credentials.hasClientKey
                  ? overview.credentials.hasDedicatedApplicationKey
                    ? "Dedicated PC Sync credential stored"
                    : "Using the app's bridge credential"
                  : "PC Sync needs a bridge credential"}
              </p>
              <p className="text-sm text-muted-foreground">
                {overview.credentials.hasClientKey
                  ? "Streaming to the bridge is set up. Re-pair only if sync fails with a credential error."
                  : "Press the round link button on your Hue Bridge, then enable PC Sync within 30 seconds. Your existing connection is not affected."}
              </p>
            </div>
            <Button
              variant={
                overview.credentials.hasClientKey ? "outline" : "default"
              }
              className="gap-2 self-end"
              disabled={isUpdating || !overview.bridgeConfigured}
              onClick={() => void provisionCredentials()}
            >
              {isUpdating && <Loader2 className="animate-spin" />}
              {overview.credentials.hasClientKey
                ? "Re-pair credential"
                : "Enable PC Sync"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Displays">
        <div className="grid gap-5">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="font-medium">Follow the primary display</p>
              <p className="text-sm text-muted-foreground">
                Automatically capture whichever display Windows marks as
                primary.
              </p>
            </div>
            <Switch
              size="lg"
              aria-label="Follow the primary display automatically"
              checked={prefs.automaticDisplay}
              disabled={isUpdating || !overview.captureSupported}
              onCheckedChange={(checked) => {
                const fallback =
                  prefs.displayIds.length > 0
                    ? prefs.displayIds
                    : overview.displays
                        .filter((display) => display.isPrimary)
                        .map((display) => display.id);
                void savePreferences({
                  automaticDisplay: checked,
                  displayIds: checked ? prefs.displayIds : fallback,
                });
              }}
            />
          </div>
          {overview.displays.length > 0 ? (
            <DisplayTopology
              displays={overview.displays}
              automatic={prefs.automaticDisplay}
              selectedIds={selectedDisplayIds}
              disabled={isUpdating}
              onToggle={toggleDisplay}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {overview.captureSupported
                ? "No displays detected."
                : "Display capture requires Windows."}
            </p>
          )}
        </div>
      </Panel>

      <Panel title="Audio output">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="font-medium">Capture device</p>
            <p className="text-sm text-muted-foreground">
              The output Music mode listens to. “Default” follows Windows'
              default device.
            </p>
          </div>
          <Select
            value={prefs.audioDeviceId ?? "default"}
            disabled={isUpdating || overview.audioOutputs.length === 0}
            onValueChange={(value) =>
              void savePreferences({
                audioDeviceId: value === "default" ? null : value,
              })
            }
          >
            <SelectTrigger aria-label="Audio capture device" className="w-64">
              <SelectValue>
                {() =>
                  prefs.audioDeviceId == null
                    ? "Default output"
                    : (overview.audioOutputs.find(
                        (output) => output.id === prefs.audioDeviceId,
                      )?.name ?? "Unavailable device")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default output</SelectItem>
              {overview.audioOutputs.map((output) => (
                <SelectItem key={output.id} value={output.id}>
                  {output.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Panel>

      <Panel title="Music defaults">
        <div className="grid gap-5">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="font-medium">Color palette</p>
              <p className="text-sm text-muted-foreground">
                Built-in palettes, or colors from one of your scenes.
              </p>
            </div>
            <Select
              value={paletteValue}
              disabled={isUpdating}
              onValueChange={(value) => {
                if (value == null) return;
                void savePreferences({
                  musicPalette: selectValueToPalette(
                    value,
                    musicScenes.find((scene) => `scene:${scene.id}` === value)
                      ?.name,
                  ),
                });
              }}
            >
              <SelectTrigger
                aria-label="Default Music color palette"
                className="w-64"
              >
                <SelectValue>
                  {() =>
                    typeof prefs.musicPalette === "string"
                      ? (builtinPalettes.find(
                          (option) => option.value === prefs.musicPalette,
                        )?.label ?? prefs.musicPalette)
                      : (musicScenes.find(
                          (scene) =>
                            typeof prefs.musicPalette !== "string" &&
                            scene.id === prefs.musicPalette.sceneId,
                        )?.name ?? "Scene palette")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {builtinPalettes.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {musicScenes.map((scene) => (
                  <SelectItem key={scene.id} value={`scene:${scene.id}`}>
                    {scene.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-6 border-t border-border pt-5">
            <div>
              <p className="font-medium">Light groups</p>
              <p className="text-sm text-muted-foreground">
                How many frequency bands spread across the area.
              </p>
            </div>
            <Select
              value={prefs.musicChannelCount}
              disabled={isUpdating}
              onValueChange={(value) =>
                void savePreferences({
                  musicChannelCount: value as typeof prefs.musicChannelCount,
                })
              }
            >
              <SelectTrigger aria-label="Music light groups" className="w-64">
                <SelectValue>
                  {() =>
                    channelCounts.find(
                      (option) => option.value === prefs.musicChannelCount,
                    )?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {channelCounts.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Panel>

      <Panel title="When sync stops">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="font-medium">Stop behavior</p>
            <p className="text-sm text-muted-foreground">
              {stopBehaviors.find(
                (option) => option.value === prefs.stopBehavior,
              )?.description ?? ""}
            </p>
          </div>
          <Select
            value={prefs.stopBehavior}
            disabled={isUpdating}
            onValueChange={(value) =>
              void savePreferences({
                stopBehavior: value as typeof prefs.stopBehavior,
              })
            }
          >
            <SelectTrigger aria-label="Stop behavior" className="w-64">
              <SelectValue>
                {() =>
                  stopBehaviors.find(
                    (option) => option.value === prefs.stopBehavior,
                  )?.label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {stopBehaviors.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Panel>
    </div>
  );
};

/**
 * Renders the monitors at their true relative positions and sizes on the
 * virtual desktop. When automatic tracking is off, displays toggle in and out
 * of the capture selection.
 */
const DisplayTopology = ({
  displays,
  automatic,
  selectedIds,
  disabled,
  onToggle,
}: {
  displays: HostSyncDisplay[];
  automatic: boolean;
  selectedIds: Set<string>;
  disabled: boolean;
  onToggle: (display: HostSyncDisplay) => void;
}) => {
  const minX = Math.min(...displays.map((display) => display.x));
  const minY = Math.min(...displays.map((display) => display.y));
  const maxX = Math.max(
    ...displays.map((display) => display.x + display.width),
  );
  const maxY = Math.max(
    ...displays.map((display) => display.y + display.height),
  );
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  // Fit the virtual desktop into a fixed-height strip.
  const scale = Math.min(520 / spanX, 180 / spanY);

  const isCaptured = (display: HostSyncDisplay) =>
    automatic ? display.isPrimary : selectedIds.has(display.id);

  return (
    <div className="grid gap-3">
      <div
        role="group"
        aria-label="Displays to capture"
        className="relative rounded-xl bg-muted/50"
        style={{ width: spanX * scale + 16, height: spanY * scale + 16 }}
      >
        {displays.map((display) => (
          <button
            key={display.id}
            type="button"
            disabled={disabled || automatic}
            aria-pressed={isCaptured(display)}
            data-selected={isCaptured(display) ? "" : undefined}
            aria-label={`${display.name}, ${display.width}×${display.height}${display.hdrEnabled ? ", HDR" : ""}${display.isPrimary ? ", primary display" : ""}`}
            title={`${display.name} · ${display.width}×${display.height}${display.hdrEnabled ? " · HDR" : ""}`}
            onClick={() => onToggle(display)}
            className={cn(
              "absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg bg-background text-xs text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[selected]:text-foreground",
              selectableVariants(),
              !automatic && !disabled && "cursor-pointer hover:bg-accent",
            )}
            style={{
              left: (display.x - minX) * scale + 8,
              top: (display.y - minY) * scale + 8,
              width: display.width * scale,
              height: display.height * scale,
            }}
          >
            <Monitor className="size-4" />
            <span className="max-w-full truncate px-1 font-medium">
              {display.name}
            </span>
            {display.isPrimary && <span className="text-[10px]">Primary</span>}
          </button>
        ))}
      </div>
      <div className="grid gap-1 text-sm text-muted-foreground">
        {displays.map((display) => (
          <p key={display.id} className="truncate">
            <span className="font-medium text-foreground">{display.name}</span>{" "}
            · {display.width}×{display.height}
            {display.refreshRate ? ` @ ${display.refreshRate} Hz` : ""}
            {display.hdrEnabled ? " · HDR" : ""}
            {display.isPrimary ? " · Primary" : ""}
            {isCaptured(display) ? " · Capturing" : ""}
          </p>
        ))}
      </div>
      {!automatic && (
        <p className="text-xs text-muted-foreground">
          Select displays to add or remove them from capture.
        </p>
      )}
    </div>
  );
};
