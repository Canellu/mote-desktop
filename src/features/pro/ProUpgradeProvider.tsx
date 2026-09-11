import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEntitlements } from "@/context/EntitlementContext";
import { ProUpgradeContext, type ProFeature } from "@/features/pro/proUpgrade";
import { Check } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

/** What the dialog leads with, so it answers the thing the customer just tried. */
const LEAD: Record<ProFeature, string> = {
  pc_sync: "PC Sync needs Mote Pro.",
  multiple_bridges: "Saving a second Hue Bridge needs Mote Pro.",
  advanced_widgets: "This widget setup needs Mote Pro.",
  dashboard_custom_layout: "A custom dashboard layout needs Mote Pro.",
  global_shortcuts: "Global keyboard shortcuts need Mote Pro.",
  general: "Unlock everything with Mote Pro.",
};

/** Everything Pro includes, listed the same way every time it is asked for. */
const INCLUDED = [
  "PC Sync — match your lights to video, games, or system audio",
  "Global keyboard shortcuts that work anywhere in Windows",
  "Several controls, or a multi-target toggle group, in one widget",
  "Widget theme, size, placement, and always-on-top",
  "A custom home dashboard layout you arrange yourself",
  "Save several Hue Bridges and switch between them",
];

type Phase = "offer" | "working" | "unavailable" | "done";

export const ProUpgradeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { purchasePro, syncFromStore } = useEntitlements();
  const [feature, setFeature] = useState<ProFeature | null>(null);
  const [phase, setPhase] = useState<Phase>("offer");

  const requestPro = useCallback((next: ProFeature = "general") => {
    setFeature(next);
    setPhase("offer");
  }, []);

  const close = useCallback(() => setFeature(null), []);

  const buy = useCallback(async () => {
    setPhase("working");
    setPhase((await purchasePro()) ? "done" : "unavailable");
  }, [purchasePro]);

  const retry = useCallback(async () => {
    setPhase("working");
    await syncFromStore();
    setPhase("offer");
  }, [syncFromStore]);

  const value = useMemo(() => ({ requestPro }), [requestPro]);

  return (
    <ProUpgradeContext.Provider value={value}>
      {children}

      <Dialog open={feature !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {phase === "done"
                ? "You have Mote Pro"
                : LEAD[feature ?? "general"]}
            </DialogTitle>
            <DialogDescription>
              {phase === "done"
                ? "Everything below is unlocked. Thank you."
                : phase === "unavailable"
                  ? "The purchase did not complete, so nothing was charged. If you already own Mote Pro, checking again will find it."
                  : "One purchase, once. Not a subscription."}
            </DialogDescription>
          </DialogHeader>

          <ul className="grid gap-2.5 py-1">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-6">
                <Check size={16} className="mt-1 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <DialogFooter>
            {phase === "done" ? (
              <Button onClick={close}>Close</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={close}>
                  Not now
                </Button>
                {phase === "unavailable" ? (
                  <Button onClick={() => void retry()}>Check again</Button>
                ) : (
                  <Button
                    onClick={() => void buy()}
                    disabled={phase === "working"}
                  >
                    {phase === "working"
                      ? "Opening the Store…"
                      : "Get Mote Pro"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProUpgradeContext.Provider>
  );
};
