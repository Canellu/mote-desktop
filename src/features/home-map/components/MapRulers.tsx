import { convertLength } from "../measurements";
import { niceStep, toScreen, type MapViewport } from "../viewport";

export const RULER_SIZE = 22;

function ticks(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  const start = Math.floor(from / step) * step;
  for (let value = start; value <= to && values.length < 200; value += step)
    values.push(Math.round(value / step) * step);
  return values;
}

/**
 * Rulers along the top and left edges, like a drawing tool. They read the same
 * viewport as the plan, so ticks stay put while panning and zooming.
 */
export function MapRulers({
  view,
  size,
  units,
}: {
  view: MapViewport;
  size: { width: number; height: number };
  units: "metric" | "imperial";
}) {
  const unit = units === "metric" ? "m" : "ft";
  const step = niceStep(view.scale, 64);
  const label = (value: number) => {
    const shown = convertLength(value, "m", unit);
    return Math.abs(shown) < 0.005
      ? "0"
      : shown.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
  const worldX = (x: number) => (x - view.offsetX) / view.scale;
  const worldY = (y: number) => (y - view.offsetY) / view.scale;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute top-0 left-0 border-b border-border/60 bg-background/80"
        style={{ height: RULER_SIZE, width: size.width }}
      >
        <svg width={size.width} height={RULER_SIZE}>
          {ticks(worldX(RULER_SIZE), worldX(size.width), step).map((value) => {
            const x = toScreen({ x: value, y: 0 }, view).x;
            if (x < RULER_SIZE) return null;
            return (
              <g key={value}>
                <line
                  x1={x}
                  y1={RULER_SIZE - 5}
                  x2={x}
                  y2={RULER_SIZE}
                  className="stroke-foreground/30"
                />
                <text
                  x={x + 3}
                  y={RULER_SIZE - 8}
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {label(value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div
        className="absolute top-0 left-0 border-r border-border/60 bg-background/80"
        style={{ width: RULER_SIZE, height: size.height }}
      >
        <svg width={RULER_SIZE} height={size.height}>
          {ticks(worldY(RULER_SIZE), worldY(size.height), step).map((value) => {
            const y = toScreen({ x: 0, y: value }, view).y;
            if (y < RULER_SIZE) return null;
            return (
              <g key={value}>
                <line
                  x1={RULER_SIZE - 5}
                  y1={y}
                  x2={RULER_SIZE}
                  y2={y}
                  className="stroke-foreground/30"
                />
                <text
                  x={RULER_SIZE - 8}
                  y={y - 3}
                  transform={`rotate(-90 ${RULER_SIZE - 8} ${y - 3})`}
                  className="fill-muted-foreground text-[9px] tabular-nums"
                >
                  {label(value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div
        className="absolute top-0 left-0 flex items-center justify-center border-r border-b border-border/60 bg-background text-[9px] text-muted-foreground"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      >
        {unit}
      </div>
    </div>
  );
}
