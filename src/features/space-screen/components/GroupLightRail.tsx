import { useState } from "react";

import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { CarouselDots } from "@/components/ui/carousel-dots";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { lightColorHex } from "@/features/space-screen/utils/color-state";
import { getLightIcon } from "@/features/space-screen/utils/light-icons";
import { selectableVariants } from "@/lib/selection-styles";
import { foregroundForBackground } from "@/lib/tile-theme";
import { cn } from "@/lib/utils";
import type { HueLight } from "@/types/hue";

interface GroupLightRailProps {
  lights: HueLight[];
  selectedIds: ReadonlySet<string>;
  focusedId: string | null;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onFocusedIdChange: (id: string | null) => void;
}

export const GroupLightRail: React.FC<GroupLightRailProps> = ({
  lights,
  selectedIds,
  focusedId,
  onToggle,
  onSelectAll,
  onClear,
  onFocusedIdChange,
}) => {
  const [api, setApi] = useState<CarouselApi>();
  const selectedCount = lights.filter((light) =>
    selectedIds.has(light.id),
  ).length;

  const controls = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {selectedCount} of {lights.length} linked
      </p>
      <ButtonGroup aria-label="Linked lights">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={selectedCount === lights.length}
          onClick={onSelectAll}
        >
          Link all
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={selectedCount === 0}
          onClick={onClear}
        >
          Clear
        </Button>
      </ButtonGroup>
    </div>
  );

  const card = (light: HueLight) => {
    const selected = selectedIds.has(light.id);
    const focused = focusedId === light.id;
    const Icon = getLightIcon(light.typeName);
    const color = light.isOn ? lightColorHex(light) : null;

    return (
      <button
        type="button"
        aria-pressed={selected}
        data-selected={selected ? "" : undefined}
        aria-label={`${selected ? "Unlink" : "Link"} ${light.name}`}
        onClick={() => onToggle(light.id)}
        onPointerEnter={() => onFocusedIdChange(light.id)}
        onPointerLeave={() => onFocusedIdChange(null)}
        onFocus={() => onFocusedIdChange(light.id)}
        onBlur={() => onFocusedIdChange(null)}
        className={cn(
          "relative flex h-36 w-full flex-col items-center justify-center gap-3 rounded-xl bg-muted/30 px-3 py-4 text-center outline-none transition-[border-color,background-color,transform] focus-visible:ring-2 focus-visible:ring-ring",
          selectableVariants(),
          focused && "scale-[1.02]",
        )}
      >
        <span
          className="flex size-12 items-center justify-center rounded-full border border-white/30 shadow-sm"
          style={{
            background: color ?? "var(--muted)",
            color: color ? foregroundForBackground(color) : "var(--foreground)",
          }}
        >
          <Icon className="size-5" />
        </span>
        <span className="flex h-9 max-w-full items-center justify-center">
          <span className="line-clamp-2 text-xs font-medium leading-snug wrap-break-word">
            {light.name}
          </span>
        </span>
      </button>
    );
  };

  return (
    <Carousel
      setApi={setApi}
      opts={{ align: "start", dragFree: true, containScroll: "trimSnaps" }}
      className="min-w-0"
    >
      {controls}

      <CarouselContent fade className="-ml-3 px-1 py-3">
        {lights.map((light) => (
          <CarouselItem key={light.id} className="basis-[8.25rem] pl-3">
            {card(light)}
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselDots api={api} className="mt-2" />
    </Carousel>
  );
};
