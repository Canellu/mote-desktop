import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";

/** A 1-100% slider that commits on release and shows its value beside it. */
export function LevelSlider({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(Math.round(value));
  useEffect(() => {
    setDraft(Math.round(value));
  }, [value]);
  const first = (v: number | readonly number[]) =>
    Array.isArray(v) ? v[0] : (v as number);
  return (
    <div className="flex w-full min-w-48 max-w-full items-center gap-3">
      <Slider
        aria-label={label}
        min={1}
        max={100}
        step={1}
        value={[draft]}
        onValueChange={(next) => setDraft(first(next))}
        onValueCommitted={(next) => onCommit(first(next))}
      />
      <span className="w-10 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
        {draft}%
      </span>
    </div>
  );
}
