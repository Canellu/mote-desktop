import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/expandable-row";
import { Switch } from "@/components/ui/switch";
import type { AutomationPresentationStatus } from "@/features/automations/presentation";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./SingletonAutomationFields";

export interface EditorSection {
  /** The id of the section's element in the page. */
  id: string;
  title: string;
  /** What the section is set to now, e.g. "Desk · Red 80%". */
  value?: string;
}

/** Something to fix before the automation can run, and where to fix it. */
export interface EditorIssue {
  message: string;
  /** The id of the section that fixes it. */
  section?: string;
}

/**
 * An automation's edit page: the settings on the left, and beside them a
 * summary that stays in view while the page scrolls — whether it is on,
 * anything to fix first, what it does in one sentence, a way to each section
 * showing what it holds, and Save. Both columns start at the same line.
 *
 * A window too narrow for two columns puts the summary above the settings,
 * with Save floating once there is an edit.
 */
export function AutomationEditorLayout({
  summary,
  status,
  enabled,
  sections,
  issues = [],
  preview,
  dirty,
  pending,
  canSave,
  onSave,
  onCancel,
  secondaryAction,
  notice,
  children,
}: {
  summary: string;
  status?: AutomationPresentationStatus;
  enabled: {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onChange: (enabled: boolean) => void;
  };
  sections: EditorSection[];
  issues?: EditorIssue[];
  preview?: {
    checked: boolean;
    disabled?: boolean;
    hint: string;
    error?: string | null;
    onChange: (on: boolean) => void;
  };
  dirty: boolean;
  pending: boolean;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** A quieter action under Save, such as deleting the rule. */
  secondaryAction?: ReactNode;
  /** What saving ran into, e.g. a conflict; shown beside Save. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { active, pin } = useActiveSection(
    sections.map((section) => section.id),
    root,
  );
  const goTo = (id: string) => {
    pin(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  };
  const saveLabel = pending ? "Saving…" : "Save changes";
  const stateLabel = enabled.checked ? "On" : "Off";
  // Each problem is said once, in the list; "Needs setup" would only repeat it.
  const showStatus =
    status &&
    status.text !== stateLabel &&
    !(issues.length && status.tone === "warning");
  const flagged = new Set(issues.map((issue) => issue.section));

  // Laid out like an order summary: one card, its parts split by hairlines,
  // the action along the bottom.
  const card = (
    <div className="grid min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-(--settings-surface) dark:bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-sm font-medium">{stateLabel}</span>
          {showStatus && (
            <span
              role="status"
              className={cn(
                "text-xs",
                status.tone === "warning"
                  ? "text-(--warn-text)"
                  : status.tone === "active"
                    ? "text-primary"
                    : "text-muted-foreground",
              )}
            >
              {status.text}
            </span>
          )}
        </div>
        <Switch
          aria-label={enabled.label}
          checked={enabled.checked}
          disabled={enabled.disabled}
          onCheckedChange={enabled.onChange}
        />
      </div>

      <Reveal open={issues.length > 0}>
        <div
          role="alert"
          className="grid gap-0.5 bg-(--warn-surface) px-2 py-2 text-(--warn-text)"
        >
          <span className="px-2 pt-1 pb-0.5 text-[11px] font-medium tracking-wider uppercase">
            {enabled.checked ? "Needs attention" : "Before it can run"}
          </span>
          {issues.map((issue) => {
            const section = issue.section;
            const body = (
              <>
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1">{issue.message}</span>
                {section && (
                  <ChevronRight
                    aria-hidden
                    className="mt-0.5 size-3.5 shrink-0 opacity-60 transition-[opacity,translate] group-hover/issue:translate-x-0.5 group-hover/issue:opacity-100"
                  />
                )}
              </>
            );
            return section ? (
              <button
                key={issue.message}
                type="button"
                onClick={() => goTo(section)}
                className="group/issue flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </button>
            ) : (
              <p
                key={issue.message}
                className="flex min-w-0 items-start gap-2 px-2 py-1.5 text-sm"
              >
                {body}
              </p>
            );
          })}
        </div>
      </Reveal>

      <p className="px-4 py-3.5 text-sm leading-6 text-muted-foreground">
        {summary}
      </p>

      {sections.length > 1 && (
        <nav
          aria-label="Sections"
          className="hidden min-w-0 divide-y divide-border/60 @3xl:grid"
        >
          {sections.map((section) => {
            const current = section.id === active;
            const problem = flagged.has(section.id);
            return (
              <button
                key={section.id}
                type="button"
                aria-current={current ? "location" : undefined}
                onClick={() => goTo(section.id)}
                className="group/section grid min-w-0 gap-1 px-4 py-3 text-left outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/[0.05]"
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-[11px] font-medium tracking-wider uppercase transition-colors",
                      current
                        ? "text-foreground"
                        : "text-muted-foreground group-hover/section:text-foreground",
                    )}
                  >
                    {section.title}
                  </span>
                  {problem ? (
                    <TriangleAlert
                      aria-label="Needs attention"
                      className="size-3.5 shrink-0 text-(--warn-text)"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full bg-primary transition-opacity",
                        current ? "opacity-100" : "opacity-0",
                      )}
                    />
                  )}
                </span>
                {section.value && (
                  <span
                    className={cn(
                      "truncate text-sm",
                      problem && "text-(--warn-text)",
                    )}
                  >
                    {section.value}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {preview && (
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="grid min-w-0 gap-0.5">
            <span className="text-sm font-medium">Preview on lights</span>
            <span
              role={preview.error ? "alert" : undefined}
              className={cn(
                "text-xs",
                preview.error
                  ? "text-(--destructive-text)"
                  : "text-muted-foreground",
              )}
            >
              {preview.error ?? preview.hint}
            </span>
          </div>
          <Switch
            aria-label="Preview on your lights"
            checked={preview.checked}
            disabled={preview.disabled}
            onCheckedChange={preview.onChange}
          />
        </div>
      )}

      <div className="hidden gap-2 bg-foreground/[0.02] p-4 @3xl:grid">
        <div className="grid gap-2 empty:hidden">{notice}</div>
        <Button disabled={pending || !canSave} onClick={onSave}>
          {saveLabel}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          {dirty ? "Discard changes" : "Back to automations"}
        </Button>
      </div>
    </div>
  );

  const rail = (
    <>
      {/* Headed like the sections, so its card lines up with theirs. */}
      <div className="hidden @3xl:block">
        <SectionHeading
          title="Summary"
          description="What it does, and what is left."
        />
      </div>
      {card}
      {secondaryAction && (
        <div className="hidden justify-center @3xl:flex">{secondaryAction}</div>
      )}
    </>
  );

  return (
    <div ref={root} className="@container min-w-0">
      {/* The summary comes first in reading order, so a narrow window shows
          it above the settings; a wide one pins it in the right column. */}
      <div className="grid min-w-0 gap-6 @3xl:grid-cols-[minmax(0,1fr)_18rem] @3xl:gap-10">
        {/* top-0, not the page's own padding: a scroller's sticky offset is
            measured from its padded content edge, so any larger offset pushes
            the summary below the first heading while the page sits at rest. */}
        <aside className="grid min-w-0 content-start gap-3 @3xl:sticky @3xl:top-0 @3xl:col-start-2 @3xl:row-start-1 @3xl:self-start">
          {rail}
        </aside>

        <div className="grid min-w-0 content-start gap-12 @3xl:col-start-1 @3xl:row-start-1">
          <div className="grid gap-2 empty:hidden @3xl:hidden">{notice}</div>
          {children}
          {secondaryAction && (
            <div className="border-t border-border pt-5 @3xl:hidden">
              {secondaryAction}
            </div>
          )}
        </div>
      </div>

      {/* Narrow windows: Save floats above the page once there is an edit,
          clear of the bottom edge where the page fades out. */}
      {dirty && (
        <div className="pointer-events-none sticky bottom-8 z-10 flex justify-center pt-6 @3xl:hidden">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-popover py-1.5 pr-1.5 pl-4 shadow-lg">
            <span className="text-sm text-muted-foreground">
              Unsaved changes
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={onCancel}
            >
              Discard
            </Button>
            <Button size="sm" disabled={pending || !canSave} onClick={onSave}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The section the reader is in: the last one whose top has passed the upper
 * part of the scrolling page. A section picked from the summary stays current
 * until the reader scrolls themselves, so a short last section still lights up.
 */
function useActiveSection(
  ids: string[],
  root: React.RefObject<HTMLDivElement | null>,
) {
  const [active, setActive] = useState(ids[0]);
  const pinned = useRef<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    const scroller = root.current?.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!scroller) return;
    const list = key.split("|");
    const update = () => {
      if (pinned.current) return setActive(pinned.current);
      const line = scroller.getBoundingClientRect().top + 120;
      let current = list[0];
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) current = id;
      }
      const scrollable = scroller.scrollHeight > scroller.clientHeight + 4;
      const atEnd =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      setActive(scrollable && atEnd ? list[list.length - 1] : current);
    };
    const release = () => {
      pinned.current = null;
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    scroller.addEventListener("wheel", release, { passive: true });
    scroller.addEventListener("pointerdown", release);
    scroller.addEventListener("keydown", release);
    return () => {
      scroller.removeEventListener("scroll", update);
      scroller.removeEventListener("wheel", release);
      scroller.removeEventListener("pointerdown", release);
      scroller.removeEventListener("keydown", release);
    };
  }, [key, root]);
  return {
    active,
    pin: (id: string) => {
      pinned.current = id;
      setActive(id);
    },
  };
}
