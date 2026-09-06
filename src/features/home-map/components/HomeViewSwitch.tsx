import { LayoutGrid, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HomeView } from "../homeView";

export function HomeViewSwitch({
  value,
  disabled,
  onChange,
}: {
  value: HomeView;
  disabled: boolean;
  onChange: (view: HomeView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Home view"
      className="inline-flex items-center gap-1 rounded-full bg-muted p-1"
    >
      {(
        [
          { value: "dashboard", label: "Dashboard", Icon: LayoutGrid },
          { value: "map", label: "Map", Icon: MapIcon },
        ] as const
      ).map(({ value: option, label, Icon }) => (
        <Button
          key={option}
          size="sm"
          variant={value === option ? "secondary" : "ghost"}
          aria-pressed={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          title={
            disabled
              ? "Finish customizing the dashboard to switch views"
              : undefined
          }
        >
          <Icon />
          {label}
        </Button>
      ))}
    </div>
  );
}
