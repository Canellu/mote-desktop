import type {
  WidgetExpandHorizontal,
  WidgetExpandVertical,
} from "@/features/widget-screen/types";
import { cn } from "@/lib/utils";
import { useRef } from "react";

type Direction = {
  vertical: WidgetExpandVertical;
  horizontal: WidgetExpandHorizontal;
  label: string;
  /** Where the quarter sits, in SVG degrees: 0 is right, 90 is down. */
  from: number;
};

// Clockwise from the top right, so arrow keys step round the ring in order.
const DIRECTIONS: Direction[] = [
  { vertical: "up", horizontal: "right", label: "Up and right", from: -90 },
  { vertical: "down", horizontal: "right", label: "Down and right", from: 0 },
  { vertical: "down", horizontal: "left", label: "Down and left", from: 90 },
  { vertical: "up", horizontal: "left", label: "Up and left", from: 180 },
];

/** The middle: open evenly every way, centred over the mascot. Last, so the
 * arrow keys reach it after going round the ring. */
const MIDDLE = {
  vertical: "center",
  horizontal: "center",
  label: "Evenly around the mascot",
} as const;
const CHOICES = [...DIRECTIONS, MIDDLE];

const SIZE = 84;
const CENTER = SIZE / 2;
const OUTER = 38;
/** The ring's hole, which the middle button sits in with a gap around it. */
const INNER = 16;
const MIDDLE_RADIUS = 11;
/** How far each slice sits out from the centre, along its diagonal. Moving the
 * slices apart, rather than trimming their angles, keeps the gap between them
 * the same width all the way in (about 1.4x this). */
const NUDGE = 2.2;

const point = (radius: number, degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return `${CENTER + radius * Math.cos(radians)} ${CENTER + radius * Math.sin(radians)}`;
};

/** One quarter of the ring. */
const quarterPath = (from: number) =>
  [
    `M ${point(INNER, from)}`,
    `L ${point(OUTER, from)}`,
    `A ${OUTER} ${OUTER} 0 0 1 ${point(OUTER, from + 90)}`,
    `L ${point(INNER, from + 90)}`,
    `A ${INNER} ${INNER} 0 0 0 ${point(INNER, from)}`,
    "Z",
  ].join(" ");

/**
 * Picks which way a collapsed widget prefers to expand: a ring cut into four
 * slices, each pointing out at a corner, around a middle button that opens it
 * evenly every way. Choosing one sets both the vertical and the horizontal
 * preference. A radio group, so arrow keys move round the circle.
 */
export const OpenDirectionRing = ({
  vertical,
  horizontal,
  onChange,
}: {
  vertical: WidgetExpandVertical;
  horizontal: WidgetExpandHorizontal;
  onChange: (
    vertical: WidgetExpandVertical,
    horizontal: WidgetExpandHorizontal,
  ) => void;
}) => {
  const selectedIndex = CHOICES.findIndex(
    (choice) =>
      choice.vertical === vertical && choice.horizontal === horizontal,
  );

  const quarterRefs = useRef<Array<SVGGElement | null>>([]);
  const select = (index: number, { moveFocus = false } = {}) => {
    const wrapped = (index + CHOICES.length) % CHOICES.length;
    const choice = CHOICES[wrapped];
    onChange(choice.vertical, choice.horizontal);
    // Arrow keys carry focus with the selection, as in any radio group.
    if (moveFocus) quarterRefs.current[wrapped]?.focus();
  };
  const onKey = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      select(index + 1, { moveFocus: true });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      select(index - 1, { moveFocus: true });
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      select(index);
    }
  };
  const middleIndex = CHOICES.length - 1;
  const middleSelected = selectedIndex === middleIndex;

  return (
    <svg
      role="radiogroup"
      aria-label="Preferred expand direction"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="shrink-0 overflow-visible"
    >
      {DIRECTIONS.map((direction, index) => {
        const selected = index === selectedIndex;
        const middle = direction.from + 45;
        const [x, y] = point((INNER + OUTER) / 2, middle).split(" ");
        const radians = (middle * Math.PI) / 180;
        const nudge = `translate(${NUDGE * Math.cos(radians)} ${NUDGE * Math.sin(radians)})`;
        return (
          <g
            key={direction.label}
            ref={(element) => {
              quarterRefs.current[index] = element;
            }}
            role="radio"
            aria-checked={selected}
            aria-label={direction.label}
            tabIndex={
              selected || (selectedIndex === -1 && index === 0) ? 0 : -1
            }
            className="group cursor-pointer outline-none"
            transform={nudge}
            onClick={() => select(index)}
            onKeyDown={(event) => onKey(event, index)}
          >
            <path
              d={quarterPath(direction.from)}
              className={cn(
                "transition-colors",
                selected
                  ? "fill-primary"
                  : "fill-foreground/8 group-hover:fill-foreground/15",
                "group-focus-visible:stroke-ring group-focus-visible:stroke-2",
              )}
            />
            {/* A chevron pointing out at the corner the widget grows toward. */}
            <path
              d="M -3 -4.5 L 2 0 L -3 4.5"
              transform={`translate(${x} ${y}) rotate(${middle})`}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "pointer-events-none transition-colors",
                selected
                  ? "stroke-primary-foreground"
                  : "stroke-muted-foreground group-hover:stroke-foreground",
              )}
            />
          </g>
        );
      })}
      <g
        ref={(element) => {
          quarterRefs.current[middleIndex] = element;
        }}
        role="radio"
        aria-checked={middleSelected}
        aria-label={MIDDLE.label}
        tabIndex={middleSelected ? 0 : -1}
        className="group cursor-pointer outline-none"
        onClick={() => select(middleIndex)}
        onKeyDown={(event) => onKey(event, middleIndex)}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={MIDDLE_RADIUS}
          className={cn(
            "transition-colors",
            middleSelected
              ? "fill-primary"
              : "fill-foreground/8 group-hover:fill-foreground/15",
            "group-focus-visible:stroke-ring group-focus-visible:stroke-2",
          )}
        />
        {/* A dot: it opens from right here, every way at once. */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={2.5}
          className={cn(
            "pointer-events-none transition-colors",
            middleSelected
              ? "fill-primary-foreground"
              : "fill-muted-foreground group-hover:fill-foreground",
          )}
        />
      </g>
    </svg>
  );
};
