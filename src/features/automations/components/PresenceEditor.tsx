import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  Cpu,
  Info,
  Pencil,
  Plus,
  Radar,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  looksLikePhone,
  occupancyText,
  probePresenceDevice,
  savePresence,
  scanPresenceDevices,
  testPresenceAction,
  type FoundDevice,
  type PresenceDevice,
  type PresenceSettings,
  type PresenceStatus,
  type ProbeResult,
} from "@/features/automations/presence";
import { describeCommandError } from "@/lib/entitlement-errors";
import { cn } from "@/lib/utils";
import { getCachedAppSettings } from "@/features/settings-screen/appSettingsCache";
import { FoldAllButton, PICKER_TILE_SURFACE } from "./AutomationPickerGroups";
import { usePickerFolding } from "@/features/automations/usePickerFolding";
import { SECTION_PANEL, SectionHeading } from "./SingletonAutomationFields";
import {
  AutomationLightPicker,
  type AutomationLightGroup,
} from "./AutomationLightPicker";
import {
  AutomationScenePicker,
  type AutomationSceneOption,
} from "./AutomationScenePicker";

const minutesAgo = (at: number) => {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `at ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

/**
 * Presence: the phones that stand for the household, what leaving does, and
 * what coming back does. Phone details save when a phone is saved; everything
 * else saves as it changes, like every automation.
 */
export function PresenceEditor({
  settings,
  status,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  onSettingsChange,
  sections = ["phones", "leaving", "arriving"],
  showStatus = true,
  showSwitch = showStatus,
}: {
  settings: PresenceSettings;
  status: PresenceStatus | null;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  /** Keeps edits in a caller-owned draft. Omit to retain the legacy save-as-you-go screen. */
  onSettingsChange?: (next: PresenceSettings) => void;
  sections?: Array<"phones" | "leaving" | "arriving">;
  showStatus?: boolean;
  /** The on/off card at the top; an editor with its own switch hides it. */
  showSwitch?: boolean;
}) {
  const navigate = useNavigate();
  const leavingFolding = usePickerFolding();
  const arrivingFolding = usePickerFolding();
  const [draft, setDraft] = useState<PresenceDevice | null>(null);
  const commit = (
    change: (current: PresenceSettings) => PresenceSettings,
  ): Promise<boolean> => {
    if (!onSettingsChange) return savePresence(change);
    onSettingsChange(change(settings));
    return Promise.resolve(true);
  };
  const onAnotherBridge = !!settings.bridgeId && settings.bridgeId !== bridgeId;
  const hasPhone = settings.devices.some((device) => device.enabled);
  const hasAction =
    !onAnotherBridge &&
    (!!settings.arrivalScene || settings.departureTargets.length > 0);
  const canEnable = hasPro && hasPhone && hasAction;
  const app = getCachedAppSettings();
  const mayStop =
    !!app &&
    (app.closeButtonBehavior !== "minimizeToTray" ||
      (app.autoStartSupported && !app.autoStart));
  const deviceStatus = (id: string) =>
    status?.devices.find((device) => device.id === id);
  const awayIn =
    status?.awayAt != null
      ? Math.max(1, Math.round((status.awayAt - Date.now()) / 60000))
      : null;

  return (
    <div className="@container grid min-w-0 gap-8">
      {showSwitch && (
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl bg-(--settings-surface) p-4">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border",
              settings.enabled
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground",
            )}
          >
            <Radar size={18} />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-sm font-medium">
              {settings.enabled ? occupancyText(status) : "Presence is off"}
            </span>
            <span role="status" className="text-xs text-muted-foreground">
              {!hasPro
                ? "Presence is part of Mote Pro. You can set it up now."
                : !hasPhone
                  ? "Add a phone to start."
                  : !hasAction
                    ? "Choose what happens when everyone leaves or comes back."
                    : settings.enabled
                      ? status?.occupancy === "away"
                        ? "Waiting for a phone to come back."
                        : awayIn
                          ? `No phone has answered lately. Everyone counts as gone in about ${awayIn} min.`
                          : "Mote checks your phones every 30 seconds."
                      : "Turn it on to start watching for your phones."}
            </span>
          </div>
          <Switch
            aria-label="Watch for phones"
            checked={settings.enabled}
            disabled={!settings.enabled && !canEnable}
            onCheckedChange={(enabled) =>
              void commit((current) => ({ ...current, enabled }))
            }
          />
        </div>
      )}

      {sections.includes("phones") && (
        <Step
          id="phones"
          title="Phones"
          hint="Everyone counts as gone ten minutes after the last phone stops answering."
        >
          <>
            {settings.devices.length > 0 && (
              <ul className="grid gap-2">
                {settings.devices.map((device) => {
                  const live = deviceStatus(device.id);
                  return draft?.id === device.id ? (
                    <li key={device.id}>
                      <DeviceForm
                        draft={draft}
                        onChange={setDraft}
                        onCancel={() => setDraft(null)}
                        onSave={async (next) => {
                          const saved = await commit((current) => ({
                            ...current,
                            devices: current.devices.map((item) =>
                              item.id === next.id ? next : item,
                            ),
                          }));
                          if (saved) setDraft(null);
                        }}
                      />
                    </li>
                  ) : (
                    <li
                      key={device.id}
                      className={cn(
                        "flex min-w-0 items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/5",
                        PICKER_TILE_SURFACE,
                      )}
                    >
                      <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Smartphone size={16} aria-hidden="true" />
                        {live?.seen && (
                          <span
                            aria-hidden="true"
                            className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-scene-tile dark:ring-(--settings-surface-hover)"
                          />
                        )}
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm font-medium">
                          {device.name}
                        </span>
                        <span
                          className={cn(
                            "truncate text-xs",
                            live?.conflict
                              ? "text-(--warn-text)"
                              : "text-muted-foreground",
                          )}
                        >
                          {device.ip}
                          {" · "}
                          {live?.conflict
                            ? "Answered with a different Wi-Fi address"
                            : live?.seen
                              ? "Home now"
                              : live?.lastSeenAt
                                ? `Last seen ${minutesAgo(live.lastSeenAt)}`
                                : settings.enabled && device.enabled
                                  ? "Not seen yet"
                                  : device.mac
                                    ? device.mac
                                    : "No Wi-Fi address"}
                        </span>
                      </span>
                      <Switch
                        aria-label={`Watch ${device.name}`}
                        checked={device.enabled}
                        onCheckedChange={(enabled) =>
                          void commit((current) => ({
                            ...current,
                            // The last phone switched off turns presence off too.
                            enabled:
                              current.enabled &&
                              current.devices.some(
                                (item) =>
                                  item.enabled &&
                                  (item.id !== device.id || enabled),
                              ),
                            devices: current.devices.map((item) =>
                              item.id === device.id
                                ? { ...item, enabled }
                                : item,
                            ),
                          }))
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${device.name}`}
                        onClick={() => setDraft(device)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${device.name}`}
                        onClick={() =>
                          void commit((current) => {
                            const devices = current.devices.filter(
                              (item) => item.id !== device.id,
                            );
                            return {
                              ...current,
                              enabled:
                                current.enabled &&
                                devices.some((item) => item.enabled),
                              devices,
                            };
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {draft && !settings.devices.some((item) => item.id === draft.id) ? (
              // The panel pads its rows, but the form card brings padding of
              // its own and would win, leaving it flush with the panel border.
              // A bare row wrapper takes the panel's padding for it, so a new
              // phone sits inset exactly like the phones listed above.
              <div>
                <DeviceForm
                  draft={draft}
                  isNew
                  onChange={setDraft}
                  onCancel={() => setDraft(null)}
                  onSave={async (next) => {
                    const saved = await commit((current) => ({
                      ...current,
                      devices: [...current.devices, next],
                    }));
                    if (saved) setDraft(null);
                  }}
                />
              </div>
            ) : (
              settings.devices.length < 10 && (
                <FindPhones
                  known={settings.devices}
                  onPick={(found) =>
                    setDraft({
                      id: crypto.randomUUID(),
                      name: found?.name ?? "",
                      ip: found?.ip ?? "",
                      mac: found?.mac ?? null,
                      enabled: true,
                    })
                  }
                />
              )
            )}
            <p className="flex max-w-prose gap-2 text-xs leading-5 text-muted-foreground">
              <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Mote knows each phone by its Wi-Fi address, so it keeps up when
                the router gives the phone a new IP. If your phone changes its
                private Wi-Fi address over time, set it to stay fixed for this
                network. Nothing leaves your home network.
              </span>
            </p>
          </>
        </Step>
      )}

      {sections.includes("leaving") && (
        <Step
          id="leaving"
          title="When everyone leaves"
          hint="The lights that turn off once no phone has answered for ten minutes."
          action={<FoldAllButton state={leavingFolding} />}
        >
          <>
            {onAnotherBridge && (
              <p className="text-sm text-muted-foreground">
                Choose lights and a scene on this bridge to replace the previous
                ones.
              </p>
            )}
            <AutomationLightPicker
              groups={lightGroups}
              selected={onAnotherBridge ? [] : settings.departureTargets}
              labelledBy="presence-step-leaving"
              folding={leavingFolding.folding}
              onChange={(departureTargets) =>
                void commit((current) => ({
                  ...current,
                  bridgeId,
                  departureTargets,
                  arrivalScene: onAnotherBridge ? null : current.arrivalScene,
                  enabled:
                    current.enabled &&
                    (departureTargets.length > 0 || !!current.arrivalScene),
                }))
              }
            />
            <TryAction
              label="Turn them off now"
              disabled={
                !hasPro || onAnotherBridge || !settings.departureTargets.length
              }
              run={() => testPresenceAction("departure", settings)}
            />
          </>
        </Step>
      )}

      {sections.includes("arriving") && (
        <Step
          id="arriving"
          title="When someone comes home"
          hint="The scene set when the first phone answers again, twice in a row."
          action={<FoldAllButton state={arrivingFolding} />}
        >
          <>
            <AutomationScenePicker
              scenes={scenes}
              labelledBy="presence-step-arriving"
              folding={arrivingFolding.folding}
              selectedId={
                onAnotherBridge ? null : (settings.arrivalScene?.id ?? null)
              }
              fallbackName={settings.arrivalScene?.name}
              onSelect={(scene) =>
                void commit((current) => ({
                  ...current,
                  bridgeId,
                  departureTargets: onAnotherBridge
                    ? []
                    : current.departureTargets,
                  arrivalScene:
                    current.arrivalScene?.id === scene.id
                      ? null
                      : { id: scene.id, name: scene.name },
                }))
              }
            />
            <TryAction
              label="Set it now"
              disabled={!hasPro || onAnotherBridge || !settings.arrivalScene}
              run={() => testPresenceAction("arrival", settings)}
            />
          </>
        </Step>
      )}

      {showStatus && (mayStop || status?.lastAction) && (
        <div className="grid gap-3">
          {status?.lastAction && (
            <p className="text-xs text-muted-foreground">
              {status.lastAction.kind === "arrival"
                ? "Coming home"
                : "Everyone leaving"}{" "}
              last ran {minutesAgo(status.lastAction.at)}
              {status.lastAction.error
                ? `, but ${describeCommandError(status.lastAction.error)}`
                : status.lastAction.failed
                  ? `, but ${status.lastAction.failed} lights could not be changed`
                  : "."}
            </p>
          )}
          {mayStop && (
            <div className="flex min-w-0 flex-wrap items-start gap-3 rounded-2xl bg-(--warn-surface) p-4 text-sm text-(--warn-text)">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p className="min-w-0 flex-1">
                Presence only watches while Mote is running. Keep it in the tray
                when you close it, and start it with Windows, so it is there
                when you are not.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigate({
                    to: "/settings",
                    search: { tab: "general" },
                  })
                }
              >
                Open General
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step({
  id,
  title,
  hint,
  action,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`presence-${id}`} className="grid min-w-0 scroll-mt-8 gap-3">
      <SectionHeading
        title={title}
        description={hint}
        titleId={`presence-step-${id}`}
        action={action}
      />
      <div className={SECTION_PANEL}>{children}</div>
    </section>
  );
}

/** A phone being added or edited, with a way to check it answers first. */
function DeviceForm({
  draft,
  isNew = false,
  onChange,
  onCancel,
  onSave,
}: {
  draft: PresenceDevice;
  isNew?: boolean;
  onChange: (next: PresenceDevice) => void;
  onCancel: () => void;
  onSave: (device: PresenceDevice) => Promise<void>;
}) {
  const [probe, setProbe] = useState<ProbeResult | "busy" | string | null>(
    null,
  );
  const test = async () => {
    setProbe("busy");
    try {
      setProbe(await probePresenceDevice(draft.ip, draft.mac));
    } catch (error) {
      setProbe(describeCommandError(error));
    }
  };
  const result = typeof probe === "object" ? probe : null;
  return (
    <div
      className={cn(
        "grid min-w-0 gap-4 rounded-xl p-4 ring-1 ring-primary/20",
        PICKER_TILE_SURFACE,
      )}
    >
      <div className="grid min-w-0 gap-3 @lg:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Name
          </span>
          <Input
            value={draft.name}
            placeholder="Alex's phone"
            maxLength={60}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Address on your network
          </span>
          <Input
            value={draft.ip}
            placeholder="192.168.1.42"
            inputMode="decimal"
            onChange={(event) => {
              onChange({ ...draft, ip: event.target.value });
              setProbe(null);
            }}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Wi-Fi address (optional)
          </span>
          <Input
            value={draft.mac ?? ""}
            placeholder="aa:bb:cc:dd:ee:ff"
            onChange={(event) =>
              onChange({ ...draft, mac: event.target.value || null })
            }
          />
        </label>
      </div>
      {probe !== null && (
        <p
          role="status"
          className={cn(
            "flex items-center gap-2 text-sm",
            result?.seen && result.macMatches !== false
              ? "text-(--success-text)"
              : "text-muted-foreground",
          )}
        >
          {probe === "busy"
            ? "Asking the phone..."
            : result
              ? result.seen
                ? result.macMatches === false
                  ? `Something answered, but with Wi-Fi address ${result.mac}. Check the address you entered.`
                  : `The phone answered${result.mac ? ` as ${result.mac}` : ""}.`
                : "No answer. Check the address, and that the phone is on this Wi-Fi and awake."
              : typeof probe === "string"
                ? probe
                : null}
          {result?.seen && result.mac && !draft.mac && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange({ ...draft, mac: result.mac })}
            >
              <Check />
              Use this Wi-Fi address
            </Button>
          )}
        </p>
      )}
      {/* Backing out sits apart on the left; checking the phone and keeping it
          stay together on the right, with the button that saves last. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!draft.ip.trim() || probe === "busy"}
            onClick={() => void test()}
          >
            <Radar />
            Test
          </Button>
          <Button
            disabled={!draft.name.trim() || !draft.ip.trim()}
            onClick={() => void onSave(draft)}
          >
            {isNew ? "Add phone" : "Save phone"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Looks around the home network for devices, likely phones first, so a phone
 * is picked rather than typed in. Typing an address stays possible.
 */
function FindPhones({
  known,
  onPick,
}: {
  known: PresenceDevice[];
  onPick: (found: FoundDevice | null) => void;
}) {
  const [found, setFound] = useState<FoundDevice[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const scan = async () => {
    setScanning(true);
    setError(null);
    try {
      setFound(await scanPresenceDevices());
    } catch (reason) {
      setError(describeCommandError(reason));
    } finally {
      setScanning(false);
    }
  };
  const added = (device: FoundDevice) =>
    known.some((item) => item.mac === device.mac || item.ip === device.ip);
  const phones = found?.filter(looksLikePhone) ?? [];
  const others =
    found?.filter((device) => !device.kind && !looksLikePhone(device)) ?? [];
  const row = (device: FoundDevice) => (
    <li
      key={device.mac}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl p-3 ring-1 ring-foreground/5",
        PICKER_TILE_SURFACE,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {looksLikePhone(device) ? (
          <Smartphone size={16} aria-hidden="true" />
        ) : (
          <Cpu size={16} aria-hidden="true" />
        )}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium">
          {device.name ?? "Unnamed device"}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {device.ip}
          {" · "}
          {device.privateAddress ? "Private Wi-Fi address" : device.mac}
        </span>
      </span>
      {added(device) ? (
        <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
          <Check size={14} aria-hidden="true" />
          Added
        </span>
      ) : (
        <Button size="sm" variant="outline" onClick={() => onPick(device)}>
          <Plus />
          Add
        </Button>
      )}
    </li>
  );
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={found ? "ghost" : "outline"}
          disabled={scanning}
          onClick={() => void scan()}
        >
          <Radar className={cn(scanning && "animate-pulse")} />
          {scanning
            ? "Looking around your network..."
            : found
              ? "Look again"
              : "Find phones on this network"}
        </Button>
        <Button variant="ghost" onClick={() => onPick(null)}>
          Enter an address instead
        </Button>
      </div>
      {scanning && (
        <p role="status" className="text-xs text-muted-foreground">
          Asking every address on your home network. This takes about 15
          seconds. A phone that is asleep may need a moment to answer, so wake
          it if it is missing.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-(--destructive-text)">
          {error}
        </p>
      )}
      {found && !scanning && (
        <div className="grid min-w-0 gap-3">
          {phones.length > 0 ? (
            <ul className="grid gap-2" aria-label="Likely phones">
              {phones.map(row)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No phones answered. Wake your phone, make sure it is on this
              Wi-Fi, and look again.
            </p>
          )}
          {others.length > 0 && (
            <div className="grid min-w-0 gap-2">
              <button
                type="button"
                aria-expanded={showOthers}
                onClick={() => setShowOthers((open) => !open)}
                className="w-fit text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showOthers ? "Hide" : "Show"} {others.length} other{" "}
                {others.length === 1 ? "device" : "devices"}
              </button>
              {showOthers && (
                <ul className="grid gap-2" aria-label="Other devices">
                  {others.map(row)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A test run of an action, confirmed first because it changes real lights. */
function TryAction({
  label,
  disabled,
  run,
}: {
  label: string;
  disabled: boolean;
  run: () => Promise<number>;
}) {
  const [stage, setStage] = useState<"idle" | "confirm" | "busy">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const go = async () => {
    setStage("busy");
    try {
      const failed = await run();
      setMessage(failed ? `${failed} lights could not be changed.` : "Done.");
    } catch (error) {
      setMessage(describeCommandError(error));
    } finally {
      setStage("idle");
    }
  };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {stage === "confirm" ? (
        <>
          <span className="text-sm">This changes your lights now.</span>
          <Button size="sm" onClick={() => void go()}>
            {label}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setStage("idle")}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || stage === "busy"}
          onClick={() => {
            setMessage(null);
            setStage("confirm");
          }}
        >
          Try it
        </Button>
      )}
      {message && (
        <span role="status" className="text-xs text-muted-foreground">
          {message}
        </span>
      )}
    </div>
  );
}
