import { Button } from "@/components/ui/button";
import type { ErrorStepProps } from "@/types/setup-wizard";
import { errorHelp, errorTitles } from "../constants";
import { BridgeStatus } from "@/components/BridgeStatus";
import { bridgeKind } from "../utils/bridge";
import {
  FirewallSettingsLink,
  ManualEntryLink,
} from "../components/ManualEntryLink";

export const ErrorStep = ({
  state,
  selectedBridge,
  onReset,
  onRetry,
  onManualEntry,
}: ErrorStepProps) => (
  <>
    <BridgeStatus
      kind={bridgeKind((state.bridge ?? selectedBridge)?.modelId)}
      status="error"
    />
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-3xl font-semibold">
        {errorTitles[state.reason]}
      </h1>
      <p className="text-lg text-muted-foreground">{state.message}</p>
      <p className="text-muted-foreground">{errorHelp[state.reason]}</p>
    </div>
    <div className="flex gap-3">
      <Button size="xl" variant="outline" onClick={onReset}>
        Start over
      </Button>
      <Button size="xl" onClick={onRetry}>
        Try again
      </Button>
    </div>
    {(state.reason === "discovery" || state.reason === "no-bridges") && (
      <div className="flex flex-col items-center gap-1">
        <ManualEntryLink onClick={onManualEntry} />
        <FirewallSettingsLink />
      </div>
    )}
  </>
);
