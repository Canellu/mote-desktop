import { useState } from "react";
import { ArrowUpRight, Check, Loader2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PacedSlider } from "@/components/PacedSlider";
import { sceneBubbleCss } from "@/features/space-screen/utils/color-state";
import { isSceneActive } from "@/features/space-screen/utils/scene-status";
import { cn } from "@/lib/utils";
import type { HueScene } from "@/types/hue";
import type { MapControlScope } from "../controlScope";
import type { HomeMapLighting } from "../lighting";

export function MapRoomControls({
  scope,
  lighting,
  preview,
  onOpenSpace,
}: {
  scope: MapControlScope;
  lighting: HomeMapLighting;
  preview: boolean;
  onOpenSpace: (id: string) => void;
}) {
  const [pendingScene, setPendingScene] = useState<string | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const target = scope.target;
  if (!target)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {scope.controlsDisabledReason}
      </p>
    );
  const disabled =
    scope.controlsDisabledReason !== null || pendingScene !== null;
  const sceneDisabled =
    scope.scenesDisabledReason !== null || pendingScene !== null;
  const brightness = Math.round(scope.brightness ?? 0);
  const error = sceneError ?? lighting.error;

  async function applyScene(scene: HueScene) {
    if (sceneDisabled) return;
    setPendingScene(scene.id);
    setSceneError(null);
    try {
      await lighting.onScene(scene);
    } catch (error) {
      setSceneError(String(error));
    } finally {
      setPendingScene(null);
    }
  }

  return (
    <div
      className="mt-5 space-y-5"
      aria-label={`${target.name} lighting controls`}
    >
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p className="wrap-anywhere">
          Controls {scope.memberIds.length}{" "}
          {scope.memberIds.length === 1 ? "light" : "lights"} in the Hue{" "}
          {target.resourceType}{" "}
          <strong className="font-medium text-foreground">{target.name}</strong>
          .
        </p>
        {scope.sharedAreaCount > 1 && (
          <p>
            Controls all {scope.sharedAreaCount} linked map areas
            {scope.sharedFloorCount > 1
              ? ` across ${scope.sharedFloorCount} floors`
              : ""}
            .
          </p>
        )}
        {scope.outsideAreaCount + scope.offFloorCount + scope.unplacedCount >
          0 && (
          <p>
            Includes{" "}
            {[
              scope.outsideAreaCount &&
                `${scope.outsideAreaCount} outside this area`,
              scope.offFloorCount && `${scope.offFloorCount} on other floors`,
              scope.unplacedCount &&
                `${scope.unplacedCount} not placed on the map`,
            ]
              .filter(Boolean)
              .join(", ")}
            .
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Power</p>
            <p className="text-xs text-muted-foreground">
              {!lighting.bridgeConnected ? "Last known state · " : ""}
              {scope.anyOn ? (scope.allOn ? "On" : "Some on") : "Off"}
            </p>
          </div>
          <Switch
            checked={scope.anyOn}
            disabled={disabled}
            aria-label={`Power for ${target.name}`}
            onCheckedChange={(on) => {
              if (!disabled) lighting.onToggle(target, on);
            }}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span>Brightness</span>
            <span className="text-muted-foreground tabular-nums">
              {brightness}%{scope.brightnessMixed ? " · Mixed" : ""}
            </span>
          </div>
          <PacedSlider
            key={`${target.id}:${disabled}`}
            value={Math.max(1, brightness)}
            min={1}
            disabled={disabled}
            ariaLabel={`${target.name} brightness`}
            isGroup
            animateKey={lighting.hueEventRevision}
            onCommit={(value, phase) => {
              if (!disabled) lighting.onBrightness(target, value, phase);
            }}
          />
        </div>
        {scope.controlsDisabledReason && (
          <p
            role="status"
            className="text-sm leading-relaxed text-muted-foreground"
          >
            {scope.controlsDisabledReason}
          </p>
        )}
        {(scope.offlineCount > 0 ||
          scope.syncedCount > 0 ||
          scope.missingLightIds.length > 0) && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {scope.syncedCount > 0 &&
              `${scope.syncedCount} syncing; power and brightness leave those lights unchanged. `}
            {scope.offlineCount > 0 &&
              `${scope.offlineCount} offline; they may not respond. `}
            {scope.missingLightIds.length > 0 &&
              `${scope.missingLightIds.length} unavailable in Hue.`}
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="space-y-2 text-sm">
          <p className="wrap-anywhere text-destructive">{error}</p>
          {lighting.onRefresh && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSceneError(null);
                lighting.onRefresh?.();
              }}
            >
              Refresh lights
            </Button>
          )}
        </div>
      )}

      <div>
        <h4 className="mb-3 font-medium">Scenes</h4>
        {scope.scenesDisabledReason &&
          scope.scenesDisabledReason !== scope.controlsDisabledReason && (
            <p className="mb-3 text-sm text-muted-foreground">
              {scope.scenesDisabledReason}
            </p>
          )}
        {scope.scenes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No saved scenes for this {target.resourceType}.
          </p>
        ) : (
          <ul className="grid gap-1.5" aria-label={`Scenes for ${target.name}`}>
            {scope.scenes.map((scene) => {
              const active = isSceneActive(scene) && scope.anyOn && !error;
              const bubble = sceneBubbleCss(scene);
              return (
                <li key={scene.id}>
                  <button
                    type="button"
                    disabled={sceneDisabled}
                    aria-label={`Apply ${scene.name}`}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                      active
                        ? "bg-selection-surface"
                        : "bg-muted/50 hover:bg-muted",
                    )}
                    onClick={() => void applyScene(scene)}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted"
                      style={bubble ? { background: bubble } : undefined}
                    >
                      {!bubble && <Palette className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1 wrap-anywhere text-sm">
                      {scene.name}
                    </span>
                    {pendingScene === scene.id ? (
                      <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
                    ) : active ? (
                      <Check className="size-4 shrink-0" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <span className="sr-only" role="status">
          {pendingScene ? "Applying scene" : ""}
        </span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          All {scope.memberIds.length} linked lights
        </summary>
        <ul className="mt-3 space-y-2">
          {scope.members.map((light) => (
            <li
              key={light.id}
              className="flex items-start justify-between gap-3"
            >
              <span className="min-w-0 wrap-anywhere">{light.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {lighting.syncedLightIds.includes(light.id)
                  ? "Syncing"
                  : !light.reachable
                    ? "Offline"
                    : light.isOn
                      ? "On"
                      : "Off"}
              </span>
            </li>
          ))}
          {scope.missingLightIds.length > 0 && (
            <li className="text-muted-foreground">
              {scope.missingLightIds.length} unavailable{" "}
              {scope.missingLightIds.length === 1 ? "light" : "lights"}
            </li>
          )}
        </ul>
      </details>
      {!preview && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onOpenSpace(target.id)}
        >
          Open {target.resourceType} details
          <ArrowUpRight />
        </Button>
      )}
    </div>
  );
}
