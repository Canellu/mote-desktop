import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManualEntryStepProps } from "@/types/setup-wizard";

export const ManualEntryStep = ({
  state,
  isBusy,
  onConnect,
  onBack,
}: ManualEntryStepProps) => {
  const [ip, setIp] = useState(state.ip ?? "");
  const canSubmit = ip.trim().length > 0 && !isBusy;

  return (
    <form
      className="flex w-full flex-col items-center gap-10"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onConnect(ip.trim());
      }}
    >
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-3xl font-semibold">
          Enter your bridge's IP address
        </h1>
        <p className="text-lg text-muted-foreground">
          If Mote can't find your bridge automatically, enter its address. In
          the Hue app, go to{" "}
          <strong className="font-semibold text-foreground">
            Settings → Bridges → your bridge → Info
          </strong>
          .
        </p>
        <p className="text-sm text-muted-foreground">
          You can also find it in your router's list of connected devices.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2 text-left">
        <Input
          size="xl"
          autoFocus
          inputMode="decimal"
          spellCheck={false}
          autoComplete="off"
          placeholder="192.168.1.20"
          aria-label="Bridge IP address"
          aria-invalid={state.message ? true : undefined}
          value={ip}
          onChange={(event) => setIp(event.target.value)}
        />
        {state.message && (
          <p role="alert" className="px-5 text-sm text-destructive">
            {state.message}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="button" size="xl" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" size="xl" disabled={!canSubmit}>
          {isBusy ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </form>
  );
};
