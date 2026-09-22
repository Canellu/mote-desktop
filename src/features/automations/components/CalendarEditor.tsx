import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  Eye,
  EyeOff,
  Info,
  Lightbulb,
  Moon,
  Palette,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  addCalendarFeed,
  calendarSectionId,
  formatWhen,
  newCalendarRule,
  refreshCalendars,
  removeCalendarFeed,
  saveCalendar,
  useCalendarPreview,
  useRuleMatches,
  type CalendarFeed,
  type CalendarLook,
  type CalendarRule,
  type CalendarSettings,
  type CalendarStatus,
} from "@/features/automations/calendar";
import { ColorWheel } from "@/features/space-screen/components/ColorWheel";
import { TemperatureWheel } from "@/features/space-screen/components/TemperatureWheel";
import { describeCommandError } from "@/lib/entitlement-errors";
import { cn } from "@/lib/utils";
import {
  AutomationLightPicker,
  type AutomationLightGroup,
} from "./AutomationLightPicker";
import {
  AutomationScenePicker,
  type AutomationSceneOption,
} from "./AutomationScenePicker";
import { LevelSlider } from "@/features/settings-screen/components/LevelSlider";
import { FoldAllButton } from "./AutomationPickerGroups";
import { usePickerFolding } from "@/features/automations/usePickerFolding";
import { SECTION_PANEL, SectionHeading } from "./SingletonAutomationFields";
import { SegmentedControl } from "@/features/settings-screen/components/SegmentedControl";

const lookModes = [
  { value: "color", label: "Color", icon: Lightbulb },
  { value: "white", label: "White", icon: Sun },
  { value: "scene", label: "Scene", icon: Palette },
  { value: "dim", label: "Dim", icon: Moon },
  { value: "off", label: "Off", icon: Power },
] as const;
const previewModes = [
  { value: "off", label: "Off", icon: EyeOff },
  { value: "on", label: "On", icon: Eye },
] as const;
const leadOptions = [0, 1, 2, 5, 10, 15, 30, 60];
const trailOptions = [0, 5, 10, 15, 30, 60];

const minutesLabel = (minutes: number, when: "before" | "after") =>
  minutes === 0
    ? when === "before"
      ? "When it starts"
      : "When it ends"
    : `${minutes} min ${when}`;

const syncedLabel = (at: number | null) => {
  if (at === null) return "Not read yet";
  const minutes = Math.round((Date.now() - at) / 60000);
  return minutes < 1 ? "Read just now" : `Read ${minutes} min ago`;
};

/** What a rule does, as the list shows it. */
function ruleSentence(rule: CalendarRule): string {
  const what =
    rule.look === "scene"
      ? rule.scene
        ? `${rule.scene.name} comes on`
        : "a scene comes on"
      : `${
          rule.targets.length === 1
            ? rule.targets[0].name
            : rule.targets.length
              ? `${rule.targets.length} lights`
              : "your lights"
        } ${
          {
            color: "change color",
            white: "turn white",
            dim: "dim",
            off: "turn off",
            scene: "",
          }[rule.look]
        }`;
  const which = rule.titleIncludes.trim()
    ? `events with “${rule.titleIncludes.split(",")[0].trim()}”`
    : rule.busyOnly
      ? "busy events"
      : "events";
  return `During ${which}, ${what}.`;
}

/**
 * Calendar rules: the calendars Mote reads, and the rules that change lights
 * around their events. Rules rank in the order listed.
 */
export function CalendarEditor({
  settings,
  status,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  onSettingsChange,
}: {
  settings: CalendarSettings;
  status: CalendarStatus | null;
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  /** Keeps rule/order edits in a caller-owned draft. Feed connections remain shared. */
  onSettingsChange?: (next: CalendarSettings) => void;
}) {
  const [editing, setEditing] = useState<{
    rule: CalendarRule;
    isNew: boolean;
  } | null>(null);
  const commit = (
    change: (current: CalendarSettings) => CalendarSettings,
  ): Promise<boolean> => {
    if (!onSettingsChange) return saveCalendar(change);
    onSettingsChange(change(settings));
    return Promise.resolve(true);
  };
  const saveRule = (rule: CalendarRule) =>
    commit((current) => ({
      ...current,
      rules: current.rules.some((item) => item.id === rule.id)
        ? current.rules.map((item) => (item.id === rule.id ? rule : item))
        : [...current.rules, rule],
    }));
  const move = (index: number, by: number) =>
    void commit((current) => {
      const rules = [...current.rules];
      const [rule] = rules.splice(index, 1);
      rules.splice(index + by, 0, rule);
      return { ...current, rules };
    });

  return (
    <div className="@container grid min-w-0 gap-8">
      <Step
        number={1}
        id="calendars"
        title="Calendars"
        hint="Mote reads these every 15 minutes. Events stay in memory for the next few days and are never saved."
      >
        <CalendarConnections settings={settings} status={status} />
      </Step>

      <Step
        number={2}
        id="rules"
        title="Rules"
        hint="Each rule changes lights around the events it matches. When two want the same light, the one higher in this list keeps it."
      >
        <div className="grid min-w-0 gap-3">
          {settings.rules.length > 0 && (
            <ul className="grid gap-2">
              {settings.rules.map((rule, index) => {
                const live = status?.rules.find((item) => item.id === rule.id);
                if (editing?.rule.id === rule.id)
                  return (
                    <li key={rule.id}>
                      <CalendarRuleFields
                        initial={editing.rule}
                        isNew={false}
                        feeds={settings.feeds}
                        lightGroups={lightGroups}
                        scenes={scenes}
                        bridgeId={bridgeId}
                        hasPro={hasPro}
                        onSave={async (next) => {
                          if (await saveRule(next)) setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                        onDelete={() => {
                          void commit((current) => ({
                            ...current,
                            rules: current.rules.filter(
                              (item) => item.id !== rule.id,
                            ),
                          }));
                          setEditing(null);
                        }}
                      />
                    </li>
                  );
                const ready =
                  (rule.look === "scene"
                    ? !!rule.scene
                    : rule.targets.length > 0) &&
                  (!rule.bridgeId || rule.bridgeId === bridgeId);
                return (
                  <li
                    key={rule.id}
                    className="flex min-w-0 items-center gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/5"
                  >
                    <span className="flex shrink-0 flex-col">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        aria-label={`Move ${rule.name} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6"
                        aria-label={`Move ${rule.name} down`}
                        disabled={index === settings.rules.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm font-medium">
                        {rule.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {ruleSentence(rule)}
                      </span>
                      <span
                        role="status"
                        className={cn(
                          "flex min-w-0 items-center gap-1.5 truncate text-xs",
                          live?.error
                            ? "text-(--destructive-text)"
                            : "text-muted-foreground",
                        )}
                      >
                        {live?.active && !live.error && (
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 animate-pulse rounded-full bg-success"
                          />
                        )}
                        <span className="truncate">
                          {live?.error
                            ? describeCommandError(live.error)
                            : live?.active
                              ? `On now for ${live.active.title || "an event"}`
                              : live?.next
                                ? `Next: ${live.next.title || "an event"}, ${formatWhen(live.next.start, live.next.allDay)}`
                                : "No matching events this week"}
                        </span>
                      </span>
                    </span>
                    <Switch
                      aria-label={`Turn ${rule.enabled ? "off" : "on"} ${rule.name}`}
                      checked={rule.enabled}
                      disabled={!rule.enabled && (!hasPro || !ready)}
                      onCheckedChange={(enabled) =>
                        void saveRule({ ...rule, enabled })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${rule.name}`}
                      onClick={() => setEditing({ rule, isNew: false })}
                    >
                      <Pencil />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {editing?.isNew ? (
            <CalendarRuleFields
              initial={editing.rule}
              isNew
              feeds={settings.feeds}
              lightGroups={lightGroups}
              scenes={scenes}
              bridgeId={bridgeId}
              hasPro={hasPro}
              onSave={async (next) => {
                if (await saveRule(next)) setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div>
              <Button
                variant="outline"
                disabled={settings.rules.length >= 30}
                onClick={() =>
                  setEditing({ rule: newCalendarRule(), isNew: true })
                }
              >
                <Plus />
                Add a rule
              </Button>
            </div>
          )}
          {settings.feeds.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Rules act once a calendar is added above.
            </p>
          )}
        </div>
      </Step>
    </div>
  );
}

function Step({
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
          <h3 id={`calendar-step-${id}`} className="text-sm font-semibold">
            {title}
          </h3>
          <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="min-w-0 rounded-2xl bg-(--settings-surface) p-4 @3xl:p-5">
        {children}
      </div>
    </section>
  );
}

export function CalendarConnections({
  settings,
  status,
  creationMode = false,
}: {
  settings: CalendarSettings;
  status: CalendarStatus | null;
  creationMode?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const add = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const events = await addCalendarFeed(name.trim() || "Calendar", url);
      setAdding(false);
      setName("");
      setUrl("");
      setMessage(
        creationMode
          ? "Calendar connected. It stays connected if you cancel this rule."
          : `Added. ${events} ${events === 1 ? "event" : "events"} in the next week.`,
      );
    } catch (error) {
      setMessage(describeCommandError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-w-0 gap-3">
      {settings.feeds.length > 0 && (
        <ul className="grid gap-2">
          {settings.feeds.map((feed) => (
            <FeedRow
              key={feed.id}
              feed={feed}
              live={status?.feeds.find((item) => item.id === feed.id)}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <div className="grid min-w-0 gap-3 rounded-xl bg-card p-4 ring-1 ring-primary/20">
          <div className="grid min-w-0 gap-3 @lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Name
              </span>
              <Input
                value={name}
                placeholder="Work"
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                iCal address
              </span>
              <Input
                value={url}
                placeholder="https://… or webcal://…"
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !url.trim()} onClick={() => void add()}>
              {busy
                ? "Checking the calendar..."
                : creationMode
                  ? "Connect calendar"
                  : "Add calendar"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setName("");
                setUrl("");
                setMessage(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <div className="grid gap-1.5 text-xs leading-5 text-muted-foreground">
            <p className="flex gap-2">
              <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Use the calendar's private iCal address. The address is kept in
                Windows' credential store, not in Mote's settings.
              </span>
            </p>
            <p>
              Google Calendar: Settings, your calendar, Secret address in iCal
              format. Outlook: Settings, Calendar, Shared calendars, Publish a
              calendar, ICS link. iCloud: share the calendar as a public
              calendar and copy its link.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={settings.feeds.length >= 10}
            onClick={() => {
              setAdding(true);
              setMessage(null);
            }}
          >
            <CalendarPlus />
            {creationMode ? "Connect calendar" : "Add a calendar"}
          </Button>
          {settings.feeds.length > 0 && (
            <Button
              variant="ghost"
              disabled={status?.syncing}
              onClick={() => void refreshCalendars()}
            >
              <RefreshCw className={cn(status?.syncing && "animate-spin")} />
              Read now
            </Button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

function FeedRow({
  feed,
  live,
}: {
  feed: CalendarFeed;
  live: CalendarStatus["feeds"][number] | undefined;
}) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/5">
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium">{feed.name}</span>
        <span
          className={cn(
            "truncate text-xs",
            live?.error ? "text-(--destructive-text)" : "text-muted-foreground",
          )}
        >
          {live?.error ??
            `${syncedLabel(live?.syncedAt ?? null)} · ${live?.events ?? 0} ${
              live?.events === 1 ? "event" : "events"
            } this week`}
        </span>
      </span>
      <Switch
        aria-label={`Read ${feed.name}`}
        checked={feed.enabled}
        onCheckedChange={(enabled) =>
          void saveCalendar((current) => ({
            ...current,
            feeds: current.feeds.map((item) =>
              item.id === feed.id ? { ...item, enabled } : item,
            ),
          }))
        }
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${feed.name}`}
        onClick={() => void removeCalendarFeed(feed.id)}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

/** One rule being added or edited. */
export function CalendarRuleFields({
  initial,
  isNew,
  feeds,
  lightGroups,
  scenes,
  bridgeId,
  hasPro,
  onSave,
  onCancel,
  onDelete,
  value,
  onChange,
  sections = ["events", "timing", "lights", "matches"],
  showActions = true,
  onManageFeeds,
  boxed = false,
}: {
  initial: CalendarRule;
  isNew: boolean;
  feeds: CalendarFeed[];
  lightGroups: AutomationLightGroup[];
  scenes: AutomationSceneOption[];
  bridgeId: string | null;
  hasPro: boolean;
  onSave: (rule: CalendarRule) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
  value?: CalendarRule;
  onChange?: (rule: CalendarRule) => void;
  sections?: Array<"events" | "timing" | "lights" | "matches">;
  showActions?: boolean;
  /** Opens the calendar connections, which live in Settings. */
  onManageFeeds?: () => void;
  /**
   * Each part as its own titled card with an id to scroll to, like the other
   * automation editors, instead of one card holding them all.
   */
  boxed?: boolean;
}) {
  const [localRule, setLocalRule] = useState(initial);
  const rule = value ?? localRule;
  const [preview, setPreview] = useState(false);
  const update = (patch: Partial<CalendarRule>) => {
    const next = { ...rule, ...patch };
    if (onChange) onChange(next);
    else setLocalRule(next);
  };
  const onAnotherBridge = !!rule.bridgeId && rule.bridgeId !== bridgeId;
  const chosen =
    !onAnotherBridge &&
    (rule.look === "scene" ? !!rule.scene : rule.targets.length > 0);
  const canPreview = hasPro && chosen;
  const matches = useRuleMatches(rule);
  const { error: previewError } = useCalendarPreview(
    preview && canPreview ? rule : null,
  );
  const folding = usePickerFolding();
  const allFeeds = rule.feedIds.length === 0;
  const toggleFeed = (id: string) =>
    update({
      feedIds: rule.feedIds.includes(id)
        ? rule.feedIds.filter((item) => item !== id)
        : [...rule.feedIds, id],
    });
  const feedName = (id: string) =>
    feeds.find((feed) => feed.id === id)?.name ?? "Calendar";
  const groupId = (part: string) =>
    boxed ? calendarSectionId(rule.id, part) : undefined;
  const nameField = (
    <label className="grid max-w-sm gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Name</span>
      <Input
        value={rule.name}
        maxLength={60}
        onChange={(event) => update({ name: event.target.value })}
      />
    </label>
  );

  return (
    <div
      className={cn(
        "grid min-w-0",
        boxed
          ? "gap-10"
          : "gap-6 rounded-xl bg-card p-4 ring-1 ring-primary/20 @3xl:p-5",
      )}
    >
      {sections.includes("events") && (
        <>
          {!boxed && nameField}

          <Group
            title="Which events"
            description="The calendars and titles this rule looks for."
            id={groupId("events")}
            boxed={boxed}
          >
            {boxed && nameField}
            {(feeds.length > 1 || onManageFeeds) && (
              <div className="grid gap-3">
                {feeds.length > 1 && (
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Calendars"
                  >
                    <Chip
                      pressed={allFeeds}
                      onClick={() => update({ feedIds: [] })}
                    >
                      Every calendar
                    </Chip>
                    {feeds.map((feed) => (
                      <Chip
                        key={feed.id}
                        pressed={rule.feedIds.includes(feed.id)}
                        onClick={() => toggleFeed(feed.id)}
                      >
                        {feed.name}
                      </Chip>
                    ))}
                  </div>
                )}
                {onManageFeeds && (
                  <button
                    type="button"
                    className="justify-self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={onManageFeeds}
                  >
                    Add or remove calendars in Settings
                  </button>
                )}
              </div>
            )}
            <div className="grid min-w-0 gap-3 @lg:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Title has any of
                </span>
                <Input
                  value={rule.titleIncludes}
                  placeholder="Any title, or e.g. sync, 1:1"
                  maxLength={500}
                  onChange={(event) =>
                    update({ titleIncludes: event.target.value })
                  }
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  But not
                </span>
                <Input
                  value={rule.titleExcludes}
                  placeholder="e.g. optional, lunch"
                  maxLength={500}
                  onChange={(event) =>
                    update({ titleExcludes: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="grid gap-2">
              <ToggleRow
                label="Only when I'm busy"
                hint="Skip events marked free."
                checked={rule.busyOnly}
                onChange={(busyOnly) => update({ busyOnly })}
              />
              <ToggleRow
                label="Include all-day events"
                checked={rule.includeAllDay}
                onChange={(includeAllDay) => update({ includeAllDay })}
              />
            </div>
          </Group>
        </>
      )}

      {sections.includes("timing") && (
        <Group
          title="When"
          description="How long around each event the lights change."
          id={groupId("timing")}
          boxed={boxed}
        >
          <div className="grid min-w-0 gap-3 @lg:grid-cols-2">
            <MinutesSelect
              label="Starts"
              value={rule.leadMinutes}
              options={leadOptions}
              when="before"
              onChange={(leadMinutes) => update({ leadMinutes })}
            />
            <MinutesSelect
              label="Ends"
              value={rule.trailMinutes}
              options={trailOptions}
              when="after"
              onChange={(trailMinutes) => update({ trailMinutes })}
            />
          </div>
          <ToggleRow
            label="Put the lights back afterwards"
            hint="A light someone changed during the event is left as it is."
            checked={rule.restore}
            onChange={(restore) => update({ restore })}
          />
        </Group>
      )}

      {sections.includes("lights") && (
        <Group
          title="Lights"
          description="What the lights do during a matching event."
          labelledBy={`calendar-rule-${rule.id}-lights`}
          id={groupId("lights")}
          boxed={boxed}
          action={<FoldAllButton state={folding} />}
        >
          <SegmentedControl
            value={rule.look}
            ariaLabel="What the lights do"
            layoutId={`calendar-look-${rule.id}`}
            options={lookModes}
            onValueChange={(look: CalendarLook) => update({ look })}
          />
          {onAnotherBridge && (
            <p className="text-sm text-muted-foreground">
              Choose lights on this bridge to replace the previous selection.
            </p>
          )}
          {rule.look === "scene" ? (
            <AutomationScenePicker
              scenes={scenes}
              labelledBy={`calendar-rule-${rule.id}-lights`}
              folding={folding.folding}
              selectedId={onAnotherBridge ? null : (rule.scene?.id ?? null)}
              fallbackName={rule.scene?.name}
              onSelect={(scene) =>
                update({
                  bridgeId,
                  scene: { id: scene.id, name: scene.name },
                })
              }
            />
          ) : (
            <AutomationLightPicker
              groups={lightGroups}
              selected={onAnotherBridge ? [] : rule.targets}
              labelledBy={`calendar-rule-${rule.id}-lights`}
              folding={folding.folding}
              onChange={(targets) => update({ bridgeId, targets })}
            />
          )}
          {rule.look !== "off" && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-5">
              {rule.look === "color" && (
                <div className="w-40 shrink-0">
                  <ColorWheel xy={rule.xy} onPick={(xy) => update({ xy })} />
                </div>
              )}
              {rule.look === "white" && (
                <div className="w-40 shrink-0">
                  <TemperatureWheel
                    value={rule.mirek}
                    min={153}
                    max={500}
                    onPick={(mirek) => update({ mirek })}
                  />
                </div>
              )}
              <div className="grid min-w-56 flex-1 gap-2">
                <p className="text-sm font-medium">
                  {rule.look === "dim" ? "Dim to" : "Brightness"}
                </p>
                <LevelSlider
                  label={rule.look === "dim" ? "Dim to" : "Brightness"}
                  value={rule.brightness}
                  onCommit={(brightness) => update({ brightness })}
                />
              </div>
            </div>
          )}
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <span
              role="status"
              className={cn(
                "text-xs",
                previewError
                  ? "text-(--destructive-text)"
                  : "text-muted-foreground",
              )}
            >
              {previewError ??
                (!hasPro
                  ? "Live preview is part of Mote Pro."
                  : !chosen
                    ? "Preview starts once you choose lights."
                    : preview
                      ? "Showing now. Your lights go back when you turn this off."
                      : "Try it on your lights while you set this up.")}
            </span>
            <SegmentedControl
              value={preview && canPreview ? "on" : "off"}
              ariaLabel="Preview on your lights"
              layoutId={`calendar-preview-${rule.id}`}
              options={previewModes}
              disabled={!canPreview}
              onValueChange={(mode) => setPreview(mode === "on")}
            />
          </div>
        </Group>
      )}

      {sections.includes("matches") && (
        <Group
          title="This week"
          description="The next events this rule matches."
          id={groupId("matches")}
          boxed={boxed}
        >
          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {feeds.length === 0
                ? "Add a calendar to see which events this rule matches."
                : "No events this week match yet."}
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {matches.slice(0, 6).map((event) => (
                <li
                  key={`${event.feedId}-${event.start}-${event.title}`}
                  className="flex min-w-0 items-baseline gap-3 text-sm"
                >
                  <span className="w-32 shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatWhen(event.start, event.allDay)}
                  </span>
                  <span className="min-w-0 truncate">
                    {event.title || "Untitled event"}
                  </span>
                  {feeds.length > 1 && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {feedName(event.feedId)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Group>
      )}

      {showActions && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
          <Button
            disabled={!rule.name.trim()}
            onClick={() =>
              void onSave({ ...rule, enabled: rule.enabled && chosen })
            }
          >
            {isNew ? "Add rule" : "Save rule"}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          {onDelete && (
            <Button
              variant="ghost"
              className="ml-auto text-(--destructive-text)"
              onClick={onDelete}
            >
              <Trash2 />
              Delete rule
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  description,
  labelledBy,
  id,
  boxed = false,
  action,
  children,
}: {
  title: string;
  /** Shown under the title when boxed. */
  description?: string;
  labelledBy?: string;
  id?: string;
  boxed?: boolean;
  /** Sits at the end of the title's line when boxed. */
  action?: ReactNode;
  children: ReactNode;
}) {
  if (boxed)
    return (
      <section id={id} className="grid min-w-0 scroll-mt-8 gap-3">
        <SectionHeading
          title={title}
          description={description}
          titleId={labelledBy}
          action={action}
        />
        <div className={SECTION_PANEL}>{children}</div>
      </section>
    );
  return (
    <section id={id} className="grid min-w-0 gap-3">
      <h4 id={labelledBy} className="text-sm font-semibold">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border/60 text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-4">
      <span className="grid gap-0.5">
        <span className="text-sm">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function MinutesSelect({
  label,
  value,
  options,
  when,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  when: "before" | "after";
  onChange: (minutes: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select
        value={String(value)}
        onValueChange={(next) => {
          if (next !== null) onChange(Number(next));
        }}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue>{minutesLabel(value, when)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((minutes) => (
            <SelectItem key={minutes} value={String(minutes)}>
              {minutesLabel(minutes, when)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
