import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { HomeGroupingMode } from "@/types/app-layout";
import type { BridgeListItem } from "@/context/HueContext";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ListChecks,
  Palette,
  Pencil,
  Plus,
  Router,
  Settings,
  Tv,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/** Short labels for the current grouping mode, shown on the layout control. */
const GROUPING_MODE_LABELS: Record<HomeGroupingMode, string> = {
  "rooms-first": "Rooms first",
  "zones-first": "Zones first",
  custom: "Custom layout",
};

interface AppHeaderProps {
  /** Back navigation handler; when provided the left side shows a back button. */
  onBack?: () => void;
  title?: string;
  description?: string;
  titleIcon?: React.ReactNode;
  headerAction?: React.ReactNode;
  onTitleRename?: (name: string) => void;
  onTitleIconClick?: () => void;
  /** Optional placeholder action shown inline with the current page title. */
  titleActionLabel?: string;
  onTitleAction?: () => void;
  onTitleManage?: () => void;
  titleEditing?: boolean;
  titleManaging?: boolean;
  onCancelTitleEdit?: () => void;
  onSaveTitleEdit?: () => void;
  /**
   * The home/house name (the bridge's user-given name) shown on the Home screen
   * in place of a back button. `null` while it's still loading or when the
   * bridge carries no name — a neutral "Home" placeholder is shown instead.
   */
  homeName?: string | null;
  /** Every paired bridge; when more than one, the Home title becomes a switcher. */
  bridges?: BridgeListItem[];
  /** Switches the active bridge (whole app reloads onto it). */
  onSwitchBridge?: (bridgeId: string) => void;
  /** Launches the add-a-bridge flow. */
  onAddBridge?: () => void;
  /** Whether the Settings gear is shown (hidden on the Settings route itself). */
  showSettings: boolean;
  onOpenSettings: () => void;
  showSync: boolean;
  onOpenSync: () => void;
  /** Whether the Edit Layout control is available (Home screen only). */
  showEditLayout: boolean;
  groupingMode: HomeGroupingMode;
  onGroupingModeChange: (mode: HomeGroupingMode) => void;
  isEditLayoutMode: boolean;
  onEditLayout: () => void;
  onCancelEditLayout: () => void;
  onSaveEditLayout: () => void;
  onCreateSection: () => void;
}

/** A stable label for a bridge that hasn't cached its name yet. */
const bridgeLabel = (bridge: BridgeListItem) =>
  bridge.name ?? `Bridge ${bridge.bridgeId.slice(-4).toUpperCase()}`;

/**
 * The Home screen's title. With a single bridge it's the plain home name; with
 * several it becomes a switcher listing every paired bridge plus "Add bridge".
 */
const HomeTitle: React.FC<{
  homeName?: string | null;
  bridges?: BridgeListItem[];
  onSwitchBridge?: (bridgeId: string) => void;
  onAddBridge?: () => void;
}> = ({ homeName, bridges, onSwitchBridge, onAddBridge }) => {
  const activeBridge = bridges?.find((bridge) => bridge.active);
  const label = homeName ?? (activeBridge ? bridgeLabel(activeBridge) : "Home");

  // Single bridge (or none): a plain title, matching the original Home header.
  if (!bridges || bridges.length <= 1) {
    return <span className="font-heading text-3xl font-semibold">{label}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="group flex items-center gap-1.5 rounded-lg font-heading text-3xl font-semibold outline-none"
            aria-label="Switch bridge"
          />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={22}
          className="mt-1 text-muted-foreground transition-transform group-data-popup-open:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        {bridges.map((bridge) => (
          <DropdownMenuItem
            key={bridge.bridgeId}
            onClick={() => !bridge.active && onSwitchBridge?.(bridge.bridgeId)}
            className="gap-2 text-base [&_svg:not([class*='size-'])]:size-5"
          >
            <Router className="text-muted-foreground" />
            <span className="flex-1 truncate">{bridgeLabel(bridge)}</span>
            {bridge.active && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
        {onAddBridge && (
          <>
            <div className="my-1 h-px bg-border" />
            <DropdownMenuItem
              onClick={onAddBridge}
              className="gap-2 text-base [&_svg:not([class*='size-'])]:size-5"
            >
              <Plus />
              Add bridge
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * Minimal global header with a fixed height so swapping its contents (back
 * button vs. greeting, edit controls) never shifts the layout below it.
 *
 * Pinned above the scroll area so it stays put while the page scrolls; content
 * fades out at the viewport's top edge just beneath it.
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
  onBack,
  title,
  description,
  titleIcon,
  headerAction,
  onTitleRename,
  onTitleIconClick,
  titleActionLabel,
  onTitleAction,
  onTitleManage,
  titleEditing = false,
  titleManaging = false,
  onCancelTitleEdit,
  onSaveTitleEdit,
  homeName,
  bridges,
  onSwitchBridge,
  onAddBridge,
  showSettings,
  onOpenSettings,
  showSync,
  onOpenSync,
  showEditLayout,
  groupingMode,
  onGroupingModeChange,
  isEditLayoutMode,
  onEditLayout,
  onCancelEditLayout,
  onSaveEditLayout,
  onCreateSection,
}) => {
  const isCustomLayout = groupingMode === "custom";
  const reduceMotion = useReducedMotion();
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? "");
  const cancelTitleRename = useRef(false);

  useEffect(() => {
    setDraftTitle(title ?? "");
    setRenamingTitle(false);
  }, [title, titleEditing]);

  const commitTitleRename = () => {
    if (cancelTitleRename.current) {
      cancelTitleRename.current = false;
      return;
    }
    const next = draftTitle.trim();
    if (next && next !== title) onTitleRename?.(next);
    setRenamingTitle(false);
  };
  // Crossfade between the layout controls and the edit-mode controls so
  // entering/leaving edit mode swaps the cluster without a hard cut.
  const crossfade = {
    duration: reduceMotion ? 0 : 0.18,
    ease: "easeOut",
  } as const;

  return (
    <header className="flex h-20 shrink-0 items-center justify-between px-12">
      {onBack ? (
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xl"
            className="-ml-3"
            aria-label="Back"
            onClick={onBack}
          >
            <ArrowLeft size={26} />
          </Button>
          <motion.div
            layout="position"
            transition={crossfade}
            className={`flex min-w-0 items-center ${titleEditing ? "gap-3" : "gap-0"}`}
          >
            {titleIcon && (
              <motion.div layout="position" transition={crossfade}>
                {titleEditing ? (
                  <Button
                    variant="outline"
                    size="icon-xl"
                    aria-label="Change icon"
                    onClick={onTitleIconClick}
                    className="size-12 shrink-0 rounded-full text-foreground transition-colors dark:border-foreground/25 [&_svg]:size-7!"
                  >
                    {titleIcon}
                  </Button>
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-foreground transition-colors [&_svg]:size-7!">
                    {titleIcon}
                  </span>
                )}
              </motion.div>
            )}
            {title && (
              <motion.div
                layout="position"
                transition={crossfade}
                className="min-w-0"
              >
                <div className="flex h-8 items-center">
                  {titleEditing && renamingTitle ? (
                    <Input
                      autoFocus
                      value={draftTitle}
                      maxLength={32}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onFocus={(event) => event.target.select()}
                      onBlur={commitTitleRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          cancelTitleRename.current = true;
                          setDraftTitle(title);
                          event.currentTarget.blur();
                        }
                      }}
                      aria-label={`Rename ${title}`}
                      className="h-8 w-auto min-w-0 max-w-full rounded-md bg-[color-mix(in_oklch,var(--background),var(--foreground)_4%)] px-3 py-5 font-heading text-2xl font-semibold field-sizing-content md:text-2xl dark:border-foreground/25 dark:bg-input/30"
                    />
                  ) : titleEditing ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDraftTitle(title);
                        setRenamingTitle(true);
                      }}
                      className="h-8 max-w-full justify-start rounded-md px-3 py-5 font-heading text-2xl font-semibold dark:border-foreground/25"
                    >
                      <span className="truncate">{title}</span>
                    </Button>
                  ) : (
                    <h1 className="flex h-8 items-center truncate rounded-md border border-transparent px-1 font-heading text-2xl font-semibold">
                      {title}
                    </h1>
                  )}
                </div>
                {description && (
                  <p className="truncate text-sm text-muted-foreground">
                    {description}
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>
      ) : (
        <HomeTitle
          homeName={homeName}
          bridges={bridges}
          onSwitchBridge={onSwitchBridge}
          onAddBridge={onAddBridge}
        />
      )}

      <div className="relative flex items-center justify-end gap-2">
        {/* The outgoing cluster is popped out of flow (popLayout) and fades
          out while the incoming one fades in, so edit mode swaps cleanly. */}
        <AnimatePresence initial={false} mode="wait">
          {isEditLayoutMode ? (
            <motion.div
              key="edit-controls"
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={crossfade}
            >
              <Button
                variant="outline"
                size="xl"
                className="gap-1.5"
                onClick={onCreateSection}
              >
                <Plus size={20} />
                Add New Section
              </Button>
              <Separator
                orientation="vertical"
                className="mx-4 self-center data-vertical:h-9 data-vertical:self-center bg-[oklch(0.86_0_0)] dark:bg-border"
              />

              <Button
                variant="secondary"
                size="xl"
                onClick={onCancelEditLayout}
              >
                Cancel
              </Button>
              <Button size="xl" onClick={onSaveEditLayout}>
                Save
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key={titleEditing ? "title-edit-controls" : "view-controls"}
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={crossfade}
            >
              {headerAction}
              {titleEditing ? (
                <>
                  <Button
                    variant="secondary"
                    size="xl"
                    onClick={onCancelTitleEdit}
                  >
                    Cancel
                  </Button>
                  <Button size="xl" onClick={onSaveTitleEdit}>
                    Save
                  </Button>
                </>
              ) : titleManaging ? (
                <Button size="xl" onClick={onSaveTitleEdit}>
                  Done
                </Button>
              ) : titleActionLabel ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="icon-xl"
                        className="rounded-2xl border-[oklch(0.91_0_0)] bg-popover hover:bg-muted dark:border-[oklch(0.32_0_0)] dark:bg-[oklch(0.25_0_0)] dark:hover:bg-[oklch(0.28_0_0)]"
                        aria-label={titleActionLabel}
                      />
                    }
                  >
                    <Pencil size={22} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuItem
                      onClick={onTitleAction}
                      className="text-base [&_svg:not([class*='size-'])]:size-5"
                    >
                      <Palette />
                      Customize
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={onTitleManage}
                      className="text-base [&_svg:not([class*='size-'])]:size-5"
                    >
                      <ListChecks />
                      Manage items
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}

              {showEditLayout && (
                <div className="flex items-center">
                  {/* In Custom layout, the Edit button arranges the hand-built
                    layout. It's fused to the left of the mode select as a button
                    group: shared surface + border, left-only rounding, and no
                    right border so the select's left border is the divider. */}
                  {isCustomLayout && (
                    <Button
                      variant="outline"
                      size="icon-xl"
                      className="rounded-2xl rounded-r-none border-r-0 border-[oklch(0.91_0_0)] bg-popover hover:bg-muted dark:border-[oklch(0.32_0_0)] dark:bg-[oklch(0.25_0_0)] dark:hover:bg-[oklch(0.28_0_0)]"
                      aria-label="Edit custom layout"
                      onClick={onEditLayout}
                    >
                      <Pencil size={18} />
                    </Button>
                  )}
                  <Select
                    value={groupingMode}
                    onValueChange={(value) =>
                      onGroupingModeChange(value as HomeGroupingMode)
                    }
                  >
                    <SelectTrigger
                      size="xl"
                      aria-label="Change layout"
                      className={cn(
                        isCustomLayout &&
                          "data-[size=xl]:rounded-l-none border-[oklch(0.91_0_0)] dark:border-[oklch(0.32_0_0)]",
                      )}
                    >
                      <SelectValue>
                        {(value: HomeGroupingMode) =>
                          GROUPING_MODE_LABELS[value]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-56">
                      {/* Rooms/Zones only re-sort the auto-generated layout... */}
                      <SelectGroup>
                        <SelectLabel>Sort order</SelectLabel>
                        <SelectItem value="rooms-first">Rooms first</SelectItem>
                        <SelectItem value="zones-first">Zones first</SelectItem>
                      </SelectGroup>
                      <SelectSeparator />
                      {/* ...whereas Custom is a separate, hand-arranged layout. */}
                      <SelectGroup>
                        <SelectLabel>Arrange yourself</SelectLabel>
                        <SelectItem value="custom">Custom layout</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(showSync || showSettings) && (
                /* Ghost icon buttons carry their own inner padding, so pull the
                  group past the gutter to sit the glyphs on it optically. */
                <div className="-mr-3 flex items-center">
                  {showSync && (
                    <Button
                      variant="ghost"
                      size="icon-xl"
                      aria-label="Sync"
                      onClick={onOpenSync}
                    >
                      <Tv size={26} />
                    </Button>
                  )}

                  {showSettings && (
                    <Button
                      variant="ghost"
                      size="icon-xl"
                      aria-label="Settings"
                      onClick={onOpenSettings}
                    >
                      <Settings size={26} />
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};
