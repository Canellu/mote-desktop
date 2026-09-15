import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HueLight, HueRoomZone } from "@/types/hue";
import { reviewOperation, type QueuedHueOperation } from "../hueOperations";

/** The commit point for anything that changes the bridge, shown before saving. */
export function HueChangeReview({
  queue,
  lights,
  roomZones,
  running,
  onRemove,
}: {
  queue: QueuedHueOperation[];
  lights: HueLight[];
  roomZones: HueRoomZone[];
  running: boolean;
  onRemove: (operationId: string) => void;
}) {
  if (queue.length === 0) return null;
  const failed = queue.filter((entry) => entry.status.state === "failed");

  return (
    <section
      aria-label="Hue changes to review"
      className="space-y-3 rounded-xl border border-border bg-card p-3"
    >
      <div>
        <h3 className="text-sm font-medium">Changes to your Hue setup</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          These are sent to the bridge when you save the map. Everything else
          stays local to Mote.
        </p>
      </div>
      <ul className="space-y-3">
        {queue.map((entry) => {
          const review = reviewOperation(entry.operation, {
            lights,
            roomZones,
          });
          const state = entry.status.state;
          return (
            <li key={entry.operation.id} className="space-y-1">
              <div className="flex items-start gap-2">
                {state === "done" ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-label="Done"
                  />
                ) : state === "failed" ? (
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-(--destructive-text)"
                    aria-label="Failed"
                  />
                ) : running ? (
                  <Loader2
                    className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
                    aria-label="Sending"
                  />
                ) : null}
                <p className="min-w-0 flex-1 wrap-anywhere text-sm">
                  {review.summary}
                </p>
                {state !== "done" && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={running}
                    aria-label="Remove this change"
                    onClick={() => onRemove(entry.operation.id)}
                  >
                    <X />
                  </Button>
                )}
              </div>
              <p className="wrap-anywhere text-xs text-muted-foreground">
                {review.lightNames.join(", ")}
              </p>
              {state !== "done" &&
                review.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="wrap-anywhere text-xs text-muted-foreground"
                  >
                    {warning}
                  </p>
                ))}
              {state === "done" && (
                <p className="text-xs text-muted-foreground">
                  Done. This already exists in Hue, so discarding the map draft
                  will not undo it.
                </p>
              )}
              {entry.status.state === "failed" && (
                <p
                  role="alert"
                  className="wrap-anywhere text-xs text-(--destructive-text)"
                >
                  {entry.status.error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {failed.length > 0 && !running && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Saving again retries only what has not succeeded. Remove a change to
          save the map without it.
        </p>
      )}
    </section>
  );
}
