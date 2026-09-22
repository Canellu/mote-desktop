import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Pause, TriangleAlert } from "lucide-react";
import type { AutomationSource } from "@/features/automations/model";
import {
  loadAutomations,
  useAutomationStore,
} from "@/features/automations/store";
import { describeCommandError } from "@/lib/entitlement-errors";

const pausedFor: Record<AutomationSource, string> = {
  onAir: "the on-air light",
  away: "the lock automation",
  focus: "a focus session",
  pcSync: "PC Sync",
  calendar: "a calendar automation",
  presence: "the presence automation",
};

/**
 * Says why PC Sync stopped on its own: an automation ranked above it in
 * Automations, Priority needed its lights. It starts again when that
 * automation ends.
 */
export function AutomationSyncNotice() {
  const navigate = useNavigate();
  const coordination = useAutomationStore((state) => state.status?.pcSync);
  useEffect(() => {
    void loadAutomations();
  }, []);
  if (coordination?.pausedFor)
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-sm text-muted-foreground"
      >
        <Pause aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          Paused for {pausedFor[coordination.pausedFor]}, which is higher in
          your{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => void navigate({ to: "/automations", search: {} })}
          >
            automation priority
          </button>
          . PC Sync starts again when it ends.
        </p>
      </div>
    );
  if (coordination?.error)
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-2xl bg-(--warn-surface) p-4 text-sm text-(--warn-text)"
      >
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          PC Sync could not start again after an automation paused it:{" "}
          {describeCommandError(coordination.error)}
        </p>
      </div>
    );
  return null;
}
