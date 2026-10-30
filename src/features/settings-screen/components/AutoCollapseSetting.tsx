import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { AUTO_COLLAPSE_SECONDS } from "@/features/widget-screen/useWidgets";
import { useEffect, useState } from "react";
import { SettingsReveal, SettingsRow } from "./SettingsList";

/**
 * Turns auto collapse on or off and sets how many seconds an open widget waits,
 * with the pointer off it, before collapsing. Zero is off. The delay is saved
 * when the slider is let go, so dragging it doesn't save every step.
 */
export const AutoCollapseSetting = ({
  seconds,
  onChange,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
}) => {
  const [draft, setDraft] = useState(seconds);
  useEffect(() => setDraft(seconds), [seconds]);
  const enabled = seconds > 0;

  return (
    <div className="grid min-w-0">
      <SettingsRow
        title="Auto collapse"
        description="Collapse the widget once the pointer has been off it for a few seconds."
        keepControlInline
      >
        <Switch
          checked={enabled}
          onCheckedChange={(checked) =>
            onChange(checked ? AUTO_COLLAPSE_SECONDS.default : 0)
          }
          aria-label="Auto collapse"
        />
      </SettingsRow>
      <SettingsReveal open={enabled}>
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Collapse after</p>
            <span className="text-sm tabular-nums text-muted-foreground">
              {draft} s
            </span>
          </div>
          <Slider
            aria-label="Collapse after, in seconds"
            min={AUTO_COLLAPSE_SECONDS.min}
            max={AUTO_COLLAPSE_SECONDS.max}
            step={1}
            value={[draft]}
            onValueChange={(next) =>
              setDraft(Array.isArray(next) ? next[0] : next)
            }
            onValueCommitted={(next) =>
              onChange(Array.isArray(next) ? next[0] : next)
            }
          />
        </div>
      </SettingsReveal>
    </div>
  );
};
