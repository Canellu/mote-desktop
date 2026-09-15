import { Loader2, PencilRuler } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HomeMapBridgeEntry } from "../store";

/** Save and Discard report success only after their durable write. */
export function DraftReviewBar({
  entry,
  hasPublished,
  hueChangeCount,
  hueRunning,
  onSave,
  onDiscard,
  onRetrySave,
}: {
  entry: HomeMapBridgeEntry;
  hasPublished: boolean;
  /** Reviewed Hue changes this save will send to the bridge. */
  hueChangeCount: number;
  hueRunning: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRetrySave: () => void;
}) {
  const busy = entry.saving || entry.pendingAction !== null || hueRunning;
  return (
    <div className="mx-12 mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <PencilRuler
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="wrap-anywhere">
            <strong className="font-medium">Unsaved draft.</strong>{" "}
            <span className="text-muted-foreground">
              {hueRunning
                ? "Sending your Hue changes…"
                : hueChangeCount > 0
                  ? `Saving also sends ${hueChangeCount} ${
                      hueChangeCount === 1 ? "change" : "changes"
                    } to your Hue bridge.`
                  : entry.saving
                    ? "Saving your changes…"
                    : hasPublished
                      ? "Your published map stays in place until you save."
                      : "Save it to start using this map."}
            </span>
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onSave} disabled={busy}>
            {entry.pendingAction === "publish" && (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            )}
            Save map
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDiscard}
            disabled={busy}
          >
            {entry.pendingAction === "discard" && (
              <Loader2 className="animate-spin motion-reduce:animate-none" />
            )}
            Discard draft
          </Button>
        </div>
      </div>
      {entry.error && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <p
            role="alert"
            className="min-w-0 wrap-anywhere text-sm text-(--destructive-text)"
          >
            {entry.error}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={onRetrySave}
            disabled={busy}
          >
            Retry saving
          </Button>
        </div>
      )}
    </div>
  );
}
