import { useId, useRef, useState } from "react";
import {
  Check,
  Home,
  Layers,
  Lightbulb,
  Palette,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  { kind: "light", label: "Lights", icon: Lightbulb },
  { kind: "room", label: "Rooms", icon: Home },
  { kind: "zone", label: "Zones", icon: Layers },
  { kind: "scene", label: "Scenes", icon: Palette },
] as const;

export function ShortcutTargetPicker({
  targets,
  value,
  fallbackName,
  onChange,
}: {
  targets: ShortcutTarget[];
  value: string;
  fallbackName: string;
  onChange: (target: ShortcutTarget) => void;
}) {
  const id = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = targets
    .filter(
      (target) =>
        (category === "all" || target.kind === category) &&
        terms.every((term) =>
          `${target.name} ${target.context}`.toLocaleLowerCase().includes(term),
        ),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const selected = targets.find(
    (target) => `${target.kind}:${target.id}` === value,
  );
  const sections = categories.flatMap(({ kind, label, icon }) => {
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

  return (
    <div className="grid min-w-0 gap-3">
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Filter control type"
      >
        {[{ kind: "all", label: "All" }, ...categories].map(
          ({ kind, label }) => (
            <Button
              key={kind}
              size="sm"
              variant={category === kind ? "secondary" : "ghost"}
              aria-pressed={category === kind}
              onClick={() => setCategory(kind)}
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
          onChange={(event) => setQuery(event.target.value)}
        />
        {query.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <div
        key={`${category}:${query}`}
        className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-1"
        role="group"
        aria-labelledby="shortcut-target-label"
      >
        {sections.map(({ key: sectionKey, label, icon: Icon, items }) => {
          if (!items.length) return null;
          return (
            <fieldset key={sectionKey} className="min-w-0 pb-2 last:pb-0">
              <legend className="px-3 py-2 text-xs font-medium text-muted-foreground">
                {label}
              </legend>
              {items.map((target) => {
                const key = `${target.kind}:${target.id}`;
                return (
                  <label
                    key={key}
                    className={cn(
                      "relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-inset",
                      value === key && "bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name={id}
                      value={key}
                      checked={value === key}
                      onChange={() => onChange(target)}
                      className="sr-only"
                    />
                    {target.kind === "scene" ? (
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-foreground/10"
                        style={
                          target.preview
                            ? { background: target.preview }
                            : undefined
                        }
                      >
                        {!target.preview && (
                          <Palette className="size-4 text-muted-foreground" />
                        )}
                      </span>
                    ) : (
                      <Icon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    )}
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
                    {value === key && (
                      <Check aria-hidden="true" className="size-4 shrink-0" />
                    )}
                  </label>
                );
              })}
            </fieldset>
          );
        })}
        {!filtered.length && (
          <div className="grid justify-items-start gap-2 px-3 py-5">
            <p className="text-sm text-muted-foreground">
              {query
                ? `No controls match “${query}”.`
                : "No controls in this category."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setCategory("all");
              }}
            >
              Show all controls
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {filtered.length} {filtered.length === 1 ? "result" : "results"} ·
        Selected:{" "}
        {selected
          ? `${selected.name}${selected.context ? ` · ${selected.context}` : ""}`
          : `${fallbackName} (unavailable)`}
      </p>
    </div>
  );
}
