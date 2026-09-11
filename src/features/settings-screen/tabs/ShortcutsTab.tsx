import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHue } from "@/context/HueContext";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { type LightShortcut, shortcutLabel } from "@/features/shortcuts/model";
import { saveShortcut, useShortcutStore } from "@/features/shortcuts/store";
import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { SettingsSection, SettingsStack } from "../components/SettingsList";
import { ShortcutTargetPicker } from "../components/ShortcutTargetPicker";
import { sceneBubbleCss } from "@/features/space-screen/utils/color-state";

const actions = [
  { value: "toggle", label: "Toggle power" },
  { value: "on", label: "Turn on" },
  { value: "off", label: "Turn off" },
  { value: "brightness", label: "Set brightness" },
  { value: "activate", label: "Activate scene" },
];

export function ShortcutsTab() {
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const { bridgeId, connected } = useHue();
  const lights = useHueResourcesStore((s) => s.lights);
  const spaces = useHueResourcesStore((s) => s.roomZones);
  const scenes = useHueResourcesStore((s) => s.scenes);
  const { shortcuts, errors, busy, ready, loadError } = useShortcutStore();
  const [draft, setDraft] = useState<LightShortcut | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;
  useEffect(() => {
    useShortcutStore.setState({ editing });
    return () => {
      useShortcutStore.setState({ editing: false });
    };
  }, [editing]);
  const targets = [
    ...lights.map((s) => ({
      id: s.id,
      kind: "light" as const,
      name: s.name,
      context:
        spaces.find(
          (space) =>
            space.resourceType === "room" && space.lightIds.includes(s.id),
        )?.name ?? "",
    })),
    ...spaces
      .filter((s) => s.groupedLightId)
      .map((s) => ({
        id: s.groupedLightId!,
        kind: s.resourceType,
        name: s.name,
        context: `${s.lightCount} ${s.lightCount === 1 ? "light" : "lights"}`,
      })),
    ...scenes
      .filter((s) => s.resourceType === "scene")
      .map((s) => ({
        id: s.id,
        kind: "scene" as const,
        name: s.name,
        context: spaces.find((space) => space.id === s.group)?.name ?? "",
        spaceId: s.group,
        spaceKind: spaces.find((space) => space.id === s.group)?.resourceType,
        preview: sceneBubbleCss(s),
      })),
  ];

  useEffect(() => {
    useShortcutStore.setState({ recording });
    const capture = (event: Event) => {
      if (!recording) return;
      setDraft((value) =>
        value
          ? { ...value, accelerator: (event as CustomEvent<string>).detail }
          : null,
      );
      setError(null);
      document.getElementById("shortcut-key")?.blur();
    };
    window.addEventListener("mote-shortcut-recorded", capture);
    return () => {
      window.removeEventListener("mote-shortcut-recorded", capture);
      useShortcutStore.setState({ recording: false });
    };
  }, [recording]);

  async function apply(next: LightShortcut | null, id: string) {
    setError(null);
    try {
      await saveShortcut(next, id);
      setDraft(null);
      setRecording(false);
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <SettingsStack>
      <SettingsSection title="Keyboard shortcuts">
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">
          Control lights, rooms, zones, and scenes while Mote is running,
          including in the tray. Choose any key combination supported by
          Windows. No shortcuts are assigned by default. Each shortcut belongs
          to the bridge it was created for.
        </p>

        {/* Pressing a shortcut is refused in Rust without Pro, so say that here
          rather than letting somebody build a set of hotkeys that do nothing.
          The editor below stays usable: a shortcut can be prepared, and it
          starts working the moment Pro is owned. */}
        {!hasPro && (
          <div className="flex max-w-prose flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm leading-6">
              Shortcuts are part of Mote Pro. You can set them up now — they
              start working as soon as Pro is unlocked.
            </p>
            <Button size="sm" onClick={() => requestPro("global_shortcuts")}>
              Get Mote Pro
            </Button>
          </div>
        )}
        <p className="max-w-prose text-sm leading-6 text-muted-foreground">
          Mote checks availability when saving and at startup. Other apps’
          in-window shortcuts cannot all be detected; choose a different key if
          it interferes with an app you use.
        </p>
        {!isTauri() && (
          <p role="status" className="text-sm text-muted-foreground">
            Open Mote Desktop to configure global shortcuts.
          </p>
        )}
        {((error && !draft) || loadError) && (
          <p role="alert" className="text-sm text-destructive">
            {error || loadError}
          </p>
        )}
        {!ready ? (
          <p role="status">Loading shortcuts…</p>
        ) : shortcuts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No shortcuts yet. Add one for a light or scene you use often.
          </p>
        ) : (
          <ul className="grid gap-5">
            {shortcuts.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div className="grid min-w-0 gap-1">
                  <p className="break-words text-sm font-medium">
                    {s.targetName} ·{" "}
                    {actions.find((a) => a.value === s.action)?.label}
                    {s.action === "brightness" ? ` (${s.brightness}%)` : ""}
                  </p>
                  <kbd
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground"
                    aria-label={shortcutLabel(s.accelerator).replace(
                      /\bWin\b/g,
                      "Windows",
                    )}
                  >
                    {shortcutLabel(s.accelerator)
                      .split(" + ")
                      .map((key, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1"
                          aria-hidden="true"
                        >
                          {index > 0 && <span>+</span>}
                          {key === "Win" ? (
                            <svg
                              viewBox="0 0 16 16"
                              className="size-3"
                              fill="currentColor"
                            >
                              <path d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z" />
                            </svg>
                          ) : (
                            key
                          )}
                        </span>
                      ))}
                  </kbd>
                  <p className="text-xs text-muted-foreground">
                    {!s.enabled
                      ? "Disabled"
                      : s.bridgeId !== bridgeId
                        ? "Switch to its bridge to use this shortcut"
                        : errors[s.id]
                          ? "Needs attention"
                          : "Enabled"}
                  </p>
                  {errors[s.id] && (
                    <p
                      role="status"
                      className="max-w-prose break-words text-sm text-destructive"
                    >
                      {errors[s.id]}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {errors[s.id] && (
                    <Button
                      variant="outline"
                      disabled={busy || !!draft}
                      onClick={() => void apply(s, s.id)}
                    >
                      Retry
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    disabled={busy || !!draft || s.bridgeId !== bridgeId}
                    onClick={() => {
                      setDraft({ ...s });
                      setError(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy || !!draft}
                    onClick={() => void apply(null, s.id)}
                  >
                    Delete
                  </Button>
                  <Switch
                    aria-label={`Enable shortcut for ${s.targetName}`}
                    checked={s.enabled}
                    disabled={busy || !!draft}
                    onCheckedChange={(enabled) =>
                      void apply({ ...s, enabled }, s.id)
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {!draft && (
          <div>
            <Button
              disabled={
                !ready ||
                busy ||
                !!loadError ||
                !isTauri() ||
                !bridgeId ||
                !connected ||
                targets.length === 0
              }
              onClick={() => {
                const target = targets[0];
                setError(null);
                setDraft({
                  id: crypto.randomUUID(),
                  accelerator: "",
                  bridgeId: bridgeId!,
                  targetKind: target.kind,
                  targetId: target.id,
                  targetName: target.name,
                  action: target.kind === "scene" ? "activate" : "toggle",
                  brightness: 100,
                  enabled: true,
                });
              }}
            >
              Add shortcut
            </Button>
          </div>
        )}
      </SettingsSection>
      {draft && (
        <SettingsSection
          title={
            shortcuts.some((s) => s.id === draft.id)
              ? "Edit shortcut"
              : "New shortcut"
          }
        >
          <div className="grid gap-5">
            <div className="grid gap-2">
              <label id="shortcut-target-label" className="text-sm font-medium">
                Control
              </label>
              <ShortcutTargetPicker
                targets={targets}
                value={`${draft.targetKind}:${draft.targetId}`}
                fallbackName={draft.targetName}
                onChange={(target) => {
                  setDraft({
                    ...draft,
                    targetKind: target.kind,
                    targetId: target.id,
                    targetName: target.name,
                    action:
                      target.kind === draft.targetKind
                        ? draft.action
                        : target.kind === "scene"
                          ? "activate"
                          : "toggle",
                  });
                }}
              />
            </div>
            {draft.targetKind !== "scene" && (
              <div className="grid gap-2">
                <label
                  id="shortcut-action-label"
                  className="text-sm font-medium"
                >
                  Action
                </label>
                <Select
                  value={draft.action}
                  onValueChange={(action) => {
                    if (action)
                      setDraft({
                        ...draft,
                        action: action as LightShortcut["action"],
                      });
                  }}
                >
                  <SelectTrigger aria-labelledby="shortcut-action-label">
                    <SelectValue>
                      {actions.find((s) => s.value === draft.action)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {actions
                      .filter((a) => a.value !== "activate")
                      .map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {draft.action === "brightness" && (
              <div className="grid gap-2">
                <label
                  htmlFor="shortcut-brightness"
                  className="text-sm font-medium"
                >
                  Brightness (%)
                </label>
                <Input
                  id="shortcut-brightness"
                  type="number"
                  min={1}
                  max={100}
                  value={draft.brightness}
                  onChange={(e) =>
                    setDraft({ ...draft, brightness: Number(e.target.value) })
                  }
                />
              </div>
            )}
            <div className="grid gap-2">
              <label htmlFor="shortcut-key" className="text-sm font-medium">
                Key combination
              </label>
              <Input
                id="shortcut-key"
                readOnly={recording}
                value={
                  recording
                    ? "Press your shortcut…"
                    : draft.accelerator.replace(/\bSuper\b/g, "Win")
                }
                placeholder="For example Ctrl+L, Alt+F8, or Win+J"
                onChange={(e) =>
                  setDraft({ ...draft, accelerator: e.target.value })
                }
                onBlur={() => setRecording(false)}
                onKeyDown={(e) => {
                  if (!recording) return;
                  if (e.key === "Tab") return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    e.currentTarget.blur();
                    return;
                  }
                  if (
                    e.repeat ||
                    ["Control", "Alt", "Shift", "Meta"].includes(e.key)
                  )
                    return;
                  if (e.code && e.code !== "Unidentified") {
                    setDraft({
                      ...draft,
                      accelerator: [
                        e.ctrlKey && "Control",
                        e.altKey && "Alt",
                        e.shiftKey && "Shift",
                        e.metaKey && "Super",
                        e.code,
                      ]
                        .filter(Boolean)
                        .join("+"),
                    });
                    setError(null);
                    e.currentTarget.blur();
                  } else
                    setError(
                      "This key could not be recorded. Type the combination instead.",
                    );
                }}
              />
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setRecording(!recording);
                    if (!recording)
                      document.getElementById("shortcut-key")?.focus();
                  }}
                >
                  {recording ? "Cancel recording" : "Record shortcut"}
                </Button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                disabled={
                  busy ||
                  recording ||
                  !draft.accelerator ||
                  draft.bridgeId !== bridgeId ||
                  !targets.some((s) => s.id === draft.targetId)
                }
                onClick={() => void apply(draft, draft.id)}
              >
                {busy ? "Saving…" : "Save shortcut"}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setRecording(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SettingsSection>
      )}
    </SettingsStack>
  );
}
