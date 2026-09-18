import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Popover } from "@base-ui/react/popover";
import {
  Check,
  ChevronDown,
  Home,
  Layers,
  Lightbulb,
  Palette,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LightShortcut } from "@/features/shortcuts/model";

export interface ShortcutTarget {
  id: string;
  kind: LightShortcut["targetKind"];
  name: string;
  context: string;
  spaceId?: string | null;
  spaceKind?: "room" | "zone";
  preview?: string | null;
}

const categories = [
  { kind: "light", label: "Lights", singular: "Light", icon: Lightbulb },
  { kind: "room", label: "Rooms", singular: "Room", icon: Home },
  { kind: "zone", label: "Zones", singular: "Zone", icon: Layers },
  { kind: "scene", label: "Scenes", singular: "Scene", icon: Palette },
] as const;

const allKinds = categories.map((category) => category.kind);

const categoryOf = (kind: ShortcutTarget["kind"]) =>
  categories.find((category) => category.kind === kind) ?? categories[0];

/** "Choose a light, room or zone" for the kinds a picker offers. */
function choosePrompt(kinds: readonly ShortcutTarget["kind"][]) {
  const names = categories
    .filter((category) => kinds.includes(category.kind))
    .map((category) => category.singular.toLocaleLowerCase());
  if (names.length < 2) return `Choose a ${names[0] ?? "control"}`;
  return `Choose a ${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

// Picked from a popover so the current choice always shows in the field, and
// the long list only takes space while somebody is choosing.
export function ShortcutTargetPicker({
  targets,
  value,
  fallbackName,
  onChange,
  kinds = allKinds,
  labelledBy = "shortcut-target-label",
  multiple,
  triggerClassName,
}: {
  targets: ShortcutTarget[];
  value: string;
  fallbackName: string;
  onChange: (target: ShortcutTarget) => void;
  /** The categories offered, for a caller that cannot use every kind. */
  kinds?: readonly ShortcutTarget["kind"][];
  /** Id of the visible label, when more than one picker is on screen. */
  labelledBy?: string;
  triggerClassName?: string;
  /** Keeps the picker open while selecting several lights or groups. */
  multiple?: {
    selected: ShortcutTarget[];
    onChange: (targets: ShortcutTarget[]) => void;
  };
}) {
  const id = useId();
  const valueId = `${id}-value`;
  const shownCategories = categories.filter((category) =>
    kinds.includes(category.kind),
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = targets
    .filter(
      (target) =>
        kinds.includes(target.kind) &&
        (category === "all" || target.kind === category) &&
        terms.every((term) =>
          `${target.name} ${target.context}`.toLocaleLowerCase().includes(term),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const selected = targets.find(
    (target) => `${target.kind}:${target.id}` === value,
  );
  const sections = shownCategories.flatMap(({ kind, label, icon }) => {
    const items = filtered.filter((target) => target.kind === kind);
    if (kind !== "scene") return [{ key: kind, label, icon, items }];
    const groups = new Map<string, ShortcutTarget[]>();
    for (const target of items) {
      const key = target.spaceId ?? "unknown";
      groups.set(key, [...(groups.get(key) ?? []), target]);
    }
    return Array.from(groups, ([key, scenes]) => {
      const space = scenes[0];
      const type = space.spaceKind === "zone" ? "Zone" : "Room";
      return {
        key: `scene:${key}`,
        label: space.context
          ? `${space.context} · ${type} scenes`
          : "Scenes · Room or zone unavailable",
        icon,
        items: scenes,
      };
    }).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  });

  // The list opens with the current choice centered, so it is in view without
  // scrolling for it. Stable identity: it runs once each time the list mounts.
  const revealSelected = useCallback((viewport: HTMLDivElement | null) => {
    viewportRef.current = viewport;
    if (!viewport) return;
    requestAnimationFrame(() => {
      const option = viewport.querySelector<HTMLElement>("[data-selected]");
      if (!option) return;
      const offset =
        option.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top;
      viewport.scrollTop +=
        offset - (viewport.clientHeight - option.offsetHeight) / 2;
    });
  }, []);

  const options = () =>
    Array.from(
      viewportRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-target-option]",
      ) ?? [],
    );
  const filterBy = (next: { query?: string; category?: string }) => {
    if (next.query !== undefined) setQuery(next.query);
    if (next.category !== undefined) setCategory(next.category);
    viewportRef.current?.scrollTo({ top: 0 });
  };
  const pick = (target: ShortcutTarget) => {
    if (multiple) {
      const matches = (item: ShortcutTarget) =>
        item.kind === target.kind && item.id === target.id;
      multiple.onChange(
        multiple.selected.some(matches)
          ? multiple.selected.filter((item) => !matches(item))
          : [...multiple.selected, target],
      );
      return;
    }
    onChange(target);
    setOpen(false);
  };
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options()[0]?.focus();
    } else if (event.key === "Enter" && terms.length > 0) {
      event.preventDefault();
      options()[0]?.click();
    }
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = options();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next =
      event.key === "ArrowDown"
        ? Math.min(index + 1, list.length - 1)
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? list.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    if (next < 0) searchRef.current?.focus();
    else list[next].focus();
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery("");
          setCategory("all");
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger
        aria-labelledby={`${labelledBy} ${valueId}`}
        className={cn(
          "flex min-h-14 w-full max-w-md min-w-0 items-center gap-3 rounded-2xl border border-foreground/12 bg-popover py-2 pr-3.5 pl-2.5 text-left text-popover-foreground transition-colors outline-none hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:border-foreground/25 dark:border-foreground/8 dark:bg-[oklch(0.25_0_0)] dark:hover:border-foreground/15",
          triggerClassName,
        )}
      >
        <TargetIcon target={selected} />
        <span id={valueId} className="grid min-w-0 flex-1 gap-0.5">
          {multiple ? (
            <>
              <span className="truncate text-sm font-medium">
                {multiple.selected.length
                  ? `${multiple.selected.length} selected`
                  : "Choose lights, rooms or zones"}
              </span>
              {multiple.selected.length > 0 && (
                <span className="truncate text-xs text-muted-foreground">
                  {multiple.selected.map((item) => item.name).join(", ")}
                </span>
              )}
            </>
          ) : selected ? (
            <>
              <span className="truncate text-sm font-medium">
                {selected.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {selected.context || categoryOf(selected.kind).singular}
              </span>
            </>
          ) : value ? (
            <>
              <span className="truncate text-sm font-medium">
                {fallbackName}
              </span>
              <span className="truncate text-xs text-(--warn-text)">
                Unavailable. Choose another.
              </span>
            </>
          ) : (
            <span className="truncate text-sm text-muted-foreground">
              {choosePrompt(kinds)}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="isolate z-50"
        >
          <Popover.Popup
            initialFocus={searchRef}
            aria-labelledby={labelledBy}
            className="flex max-h-(--available-height) w-(--anchor-width) max-w-[calc(100vw-2rem)] min-w-80 origin-(--transform-origin) flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/8 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 dark:bg-[oklch(0.25_0_0)]"
          >
            <div className="grid shrink-0 gap-2 border-b border-border p-2">
              <div
                className="flex flex-wrap gap-1"
                role="group"
                aria-label="Filter control type"
              >
                {[{ kind: "all", label: "All" }, ...shownCategories].map(
                  ({ kind, label }) => (
                    <Button
                      key={kind}
                      size="sm"
                      variant={category === kind ? "secondary" : "ghost"}
                      aria-pressed={category === kind}
                      onClick={() => filterBy({ category: kind })}
                    >
                      {label}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {
                          targets.filter(
                            (target) => kind === "all" || target.kind === kind,
                          ).length
                        }
                      </span>
                    </Button>
                  ),
                )}
              </div>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={searchRef}
                  aria-label="Search controls"
                  placeholder="Search by name, room or zone…"
                  className="pl-9 pr-11"
                  value={query}
                  onChange={(event) => filterBy({ query: event.target.value })}
                  onKeyDown={onSearchKeyDown}
                />
                {query.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label="Clear search"
                    onClick={() => {
                      filterBy({ query: "" });
                      searchRef.current?.focus();
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            <ScrollArea
              fade
              className="min-h-0 shrink"
              viewportClassName="max-h-[min(20rem,calc(var(--available-height)-10rem))]"
              viewportRef={revealSelected}
              contentClassName="p-1.5"
            >
              <div className="grid gap-2" onKeyDown={onListKeyDown}>
                {sections.map(
                  ({ key: sectionKey, label, icon: Icon, items }) => {
                    if (!items.length) return null;
                    const headingId = `${id}-${sectionKey}`;
                    return (
                      <div
                        key={sectionKey}
                        role="group"
                        aria-labelledby={headingId}
                      >
                        <p
                          id={headingId}
                          className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground"
                        >
                          {label}
                        </p>
                        {items.map((target) => {
                          const key = `${target.kind}:${target.id}`;
                          const isSelected = multiple
                            ? multiple.selected.some(
                                (item) =>
                                  item.kind === target.kind &&
                                  item.id === target.id,
                              )
                            : value === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              data-target-option=""
                              data-selected={isSelected || undefined}
                              role={multiple ? "checkbox" : undefined}
                              aria-checked={multiple ? isSelected : undefined}
                              aria-pressed={multiple ? undefined : isSelected}
                              onClick={() => pick(target)}
                              className={cn(
                                "flex w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-1.5 text-left outline-none hover:bg-(--interactive-hover) focus-visible:bg-(--interactive-hover) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                isSelected &&
                                  "bg-(--selection-surface) hover:bg-(--selection-surface)",
                              )}
                            >
                              <TargetIcon target={target} icon={Icon} />
                              <span className="grid min-w-0 flex-1 gap-0.5">
                                <span
                                  className="truncate text-sm font-medium"
                                  title={target.name}
                                >
                                  {target.name}
                                </span>
                                {target.context && (
                                  <span
                                    className="truncate text-xs text-muted-foreground"
                                    title={target.context}
                                  >
                                    {target.context}
                                  </span>
                                )}
                                {target.kind === "scene" && !target.preview && (
                                  <span className="text-xs text-muted-foreground">
                                    Color preview unavailable
                                  </span>
                                )}
                              </span>
                              {multiple ? (
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "flex size-5 shrink-0 items-center justify-center rounded-md border border-foreground/30",
                                    isSelected &&
                                      "border-primary bg-primary text-primary-foreground",
                                  )}
                                >
                                  {isSelected && <Check className="size-3.5" />}
                                </span>
                              ) : (
                                isSelected && (
                                  <Check
                                    aria-hidden="true"
                                    className="size-4 shrink-0"
                                  />
                                )
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  },
                )}
                {!filtered.length && (
                  <div className="grid justify-items-start gap-2 px-2.5 py-4">
                    <p className="text-sm text-muted-foreground">
                      {query
                        ? `No controls match “${query}”.`
                        : "No controls in this category."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => filterBy({ query: "", category: "all" })}
                    >
                      Show all controls
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
            {multiple && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!multiple.selected.length}
                  onClick={() => multiple.onChange([])}
                >
                  Clear selection
                </Button>
                <Button size="sm" onClick={() => setOpen(false)}>
                  Done
                  {multiple.selected.length > 0
                    ? ` · ${multiple.selected.length}`
                    : ""}
                </Button>
              </div>
            )}
            <p className="sr-only" role="status">
              {filtered.length} {filtered.length === 1 ? "result" : "results"}
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A scene's color swatch, or the category icon, in a fixed-size slot. */
function TargetIcon({
  target,
  icon,
}: {
  target: ShortcutTarget | undefined;
  icon?: (typeof categories)[number]["icon"];
}) {
  const Icon = icon ?? (target ? categoryOf(target.kind).icon : Lightbulb);
  if (target?.kind === "scene") {
    return (
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-foreground/10"
        style={target.preview ? { background: target.preview } : undefined}
      >
        {!target.preview && (
          <Palette className="size-4 text-muted-foreground" />
        )}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/6"
    >
      <Icon className="size-4 text-muted-foreground" />
    </span>
  );
}
