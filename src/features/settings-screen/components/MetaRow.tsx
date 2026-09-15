import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Shared styling for the copyable detail rows used by the Bridge and Sync Box
// tabs. The rows sit directly on `--settings-surface`; on hover they lift to
// `--settings-surface-hover`, a lighter step in both light and dark.
export const ROW_CLASS =
  "group flex items-center justify-between gap-10 rounded-lg px-3 py-2 text-left transition-colors hover:bg-(--settings-surface-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70";

/**
 * A labelled value in a device-detail list. When the value is present the whole
 * row becomes a copy-to-clipboard button: hovering brightens it and reveals a
 * copy glyph (the affordance), and clicking copies the value and flips to a
 * transient "Copied" check. A toast confirms the copy. Rows with no value (shown
 * as "Unknown") stay inert — there's nothing to copy.
 */
export const MetaRow = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);
  const hasValue = value != null && value !== "";

  useEffect(
    () => () => {
      if (resetRef.current) window.clearTimeout(resetRef.current);
    },
    [],
  );

  const copy = async () => {
    if (!hasValue) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (resetRef.current) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 1500);
      toast.success(`${label} copied`, { id: "device-detail-copy" });
    } catch {
      toast.error("Couldn't copy to clipboard", { id: "device-detail-copy" });
    }
  };

  if (!hasValue) {
    return (
      <div className="flex items-center justify-between gap-10 px-3 py-2">
        <dt className="shrink-0 text-muted-foreground">{label}</dt>
        <dd className="flex min-w-0 items-center justify-end gap-2 text-muted-foreground">
          <span className="truncate text-right font-medium">Unknown</span>
          {/* Reserve the copy-glyph slot so every row's value shares one right edge. */}
          <span className="size-3.5 shrink-0" aria-hidden />
        </dd>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${label}`}
      className={ROW_CLASS}
    >
      <dt className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-right font-medium">{value}</span>
        <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
          <Check
            size={14}
            className={cn(
              "absolute text-(--success-text) transition-all",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />
          <Copy
            size={14}
            className={cn(
              "absolute opacity-0 transition-opacity",
              !copied &&
                "group-hover:opacity-100 group-focus-visible:opacity-100",
            )}
          />
        </span>
      </dd>
    </button>
  );
};
