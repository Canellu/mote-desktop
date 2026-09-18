import { selectableVariants } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { groupTabs, settingsGroups } from "../settingsTabs";
import { ProTag } from "./ProTag";

/**
 * Full-height settings navigation: a single left rail listing every leaf tab,
 * split into labelled sections (one per group). Selection is driven through the
 * same `search.tab` route as the content panels.
 *
 * The earlier folder-tab treatment lives on in `SettingsNav` (and the
 * `.notch-tab` styles in App.css) — kept for reuse elsewhere, not rendered here.
 */
export const SettingsSidebar = ({
  activeTab,
  onSelect,
}: {
  activeTab: string;
  onSelect: (tab: string) => void;
}) => {
  return (
    <TooltipProvider>
      <aside className="flex w-16 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border p-3 @2xl:w-60 @2xl:gap-8 @2xl:p-4">
        {settingsGroups.map((group) => (
          <div key={group.value} className="flex flex-col">
            <p className="sr-only @2xl:not-sr-only @2xl:px-2.5 @2xl:pb-1.5 @2xl:text-[0.6875rem] @2xl:font-semibold @2xl:tracking-wider @2xl:text-muted-foreground @2xl:uppercase">
              {group.label}
            </p>
            <nav aria-label={group.label} className="flex flex-col gap-1 @2xl:gap-0.5">
              {groupTabs(group.value).map(({ value, label, icon: Icon, pro }) => {
                const isActive = activeTab === value;
                const button = (
                  <button
                    type="button"
                    aria-label={label}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => onSelect(value)}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-lg text-sm font-medium text-foreground/80 @2xl:h-9 @2xl:w-full @2xl:justify-start @2xl:gap-2.5 @2xl:px-2.5",
                      selectableVariants({ treatment: "navigation" }),
                      isActive && "text-foreground",
                    )}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span className="hidden truncate @2xl:inline">{label}</span>
                    {pro && <ProTag className="ml-auto hidden @2xl:inline-flex" />}
                  </button>
                );

                return (
                  <Tooltip key={value}>
                    <TooltipTrigger render={button} />
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>
        ))}
      </aside>
    </TooltipProvider>
  );
};
