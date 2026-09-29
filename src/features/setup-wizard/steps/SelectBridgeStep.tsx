import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { openFirewallSettings } from "@/lib/firewall";
import { overlaySelectionClassName } from "@/lib/selection-styles";
import { cn } from "@/lib/utils";
import type { SelectBridgeStepProps } from "@/types/setup-wizard";
import { BridgeThumb } from "../components/BridgeThumb";
import { ManualEntryLink } from "../components/ManualEntryLink";
import { bridgeIdIsPaired } from "../machine";
import { bridgeKind, bridgeKindLabel } from "../utils/bridge";

const CARD_WIDTH = 192; // w-48
const GAP = 16; // gap-4
const MAX_CONTENT_WIDTH = 1152; // 72rem breakout cap
const VIEWPORT_FRACTION = 0.88; // never spill past the viewport

const getAvailableWidth = () =>
  typeof window === "undefined"
    ? MAX_CONTENT_WIDTH
    : Math.min(window.innerWidth * VIEWPORT_FRACTION, MAX_CONTENT_WIDTH);

// Pick the column count that fits the window, then back it off so the cards
// spread evenly across the fewest rows — avoiding a lone orphan on the last row
// (e.g. 6 bridges become 3+3 instead of 5+1).
const useBalancedColumns = (count: number) => {
  const [available, setAvailable] = useState(getAvailableWidth);

  useEffect(() => {
    const update = () => setAvailable(getAvailableWidth());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const maxColumns = Math.max(
    1,
    Math.floor((available + GAP) / (CARD_WIDTH + GAP)),
  );
  const columnsThatFit = Math.min(count, maxColumns);
  const rows = Math.ceil(count / columnsThatFit);
  return Math.max(1, Math.ceil(count / rows));
};

export const SelectBridgeStep = ({
  state,
  onSelectBridge,
  onContinue,
  onBack,
  onManualEntry,
}: SelectBridgeStepProps) => {
  const isSingle = state.bridges.length === 1;
  const columns = useBalancedColumns(state.bridges.length);
  const rowWidth = columns * CARD_WIDTH + (columns - 1) * GAP;

  const pairedIds = state.alreadyPairedIds ?? [];
  const isPaired = (bridgeId: string) => bridgeIdIsPaired(bridgeId, pairedIds);
  const allPaired =
    state.bridges.length > 0 &&
    state.bridges.every((bridge) => isPaired(bridge.bridgeId));
  const singlePaired = isSingle && isPaired(state.bridges[0].bridgeId);
  const foundOnlyViaCloud =
    state.bridges.length > 0 && state.bridges.every((bridge) => bridge.viaCloud);

  const heading = singlePaired
    ? "Bridge already added"
    : isSingle
      ? "Hue Bridge found"
      : "Choose your Hue Bridge";
  const description = allPaired
    ? isSingle
      ? "This bridge is already connected on this device."
      : "Every bridge found on your network is already added on this device."
    : isSingle
      ? "Press Continue to connect to this bridge."
      : "Select a bridge to connect to. Bridges already added are marked.";

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl font-semibold">{heading}</h1>
        <p className="text-lg text-muted-foreground">{description}</p>
        {foundOnlyViaCloud && (
          <p className="text-sm text-muted-foreground">
            Mote found this through the Philips online lookup because nothing
            answered on your network. If Windows Firewall is blocking Mote
            Desktop, finding Sync Boxes will fail too.{" "}
            <button
              type="button"
              className="font-medium text-foreground underline decoration-foreground/60 underline-offset-4 hover:decoration-foreground"
              onClick={() => void openFirewallSettings()}
            >
              Open Windows Firewall settings
            </button>
          </p>
        )}
      </div>

      <div
        className="flex max-w-[88vw] flex-wrap justify-center gap-4"
        style={{ width: rowWidth }}
      >
        {state.bridges.map((bridge) => {
          const paired = isPaired(bridge.bridgeId);
          const isSelected =
            !paired && bridge.bridgeIp === state.selectedBridgeIp;
          const kind = bridgeKind(bridge.modelId);

          return (
            <Card
              key={bridge.bridgeId}
              size="sm"
              role={paired ? undefined : "button"}
              tabIndex={paired ? undefined : 0}
              aria-pressed={paired ? undefined : isSelected}
              aria-disabled={paired || undefined}
              data-selected={isSelected ? "" : undefined}
              className={cn(
                "w-48 border border-foreground/10 transition-[box-shadow,background-color]",
                paired
                  ? "cursor-not-allowed opacity-55 bg-[oklch(0.97_0_0)] dark:bg-[oklch(0.22_0_0)]"
                  : [
                      "cursor-pointer",
                      "bg-[oklch(0.99_0_0)] hover:bg-[oklch(0.96_0_0)]",
                      "dark:bg-[oklch(0.24_0_0)] dark:hover:bg-[oklch(0.25_0_0)]",
                    ],
                isSelected && overlaySelectionClassName,
              )}
              onClick={
                paired ? undefined : () => onSelectBridge(bridge.bridgeIp)
              }
              onKeyDown={
                paired
                  ? undefined
                  : (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectBridge(bridge.bridgeIp);
                      }
                    }
              }
            >
              <CardContent className="flex min-w-0 flex-col items-center gap-2 text-center">
                <BridgeThumb kind={kind} />
                <span className="font-medium">{bridgeKindLabel(kind)}</span>
                {paired && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    <Check size={12} />
                    Already added
                  </span>
                )}
                <div className="flex w-full min-w-0 flex-col">
                  <span className="truncate text-sm text-muted-foreground">
                    {bridge.bridgeIp}
                  </span>
                  <span className="break-all text-xs text-muted-foreground">
                    {bridge.bridgeId}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button size="xl" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          size="xl"
          disabled={!state.selectedBridgeIp}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
      <ManualEntryLink onClick={onManualEntry} />
    </>
  );
};
