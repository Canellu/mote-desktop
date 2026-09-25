import { Button } from "@/components/ui/button";
import { SettingsRow } from "@/features/settings-screen/components/SettingsList";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useStoreUpdate } from "./useStoreUpdate";

/** Long enough to read, so a fast check does not flash its busy label. */
const MIN_CHECKING_MS = 600;

const formatCheckedAt = (checkedAt: number) => {
  const when = new Date(checkedAt);
  const time = when.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (when.toDateString() === new Date().toDateString()) return `at ${time}`;
  const date = when.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return `on ${date} at ${time}`;
};

/**
 * Both labels share one grid cell and only the active one is visible, so the
 * button keeps the width of its longer label instead of resizing between them.
 */
const StableLabel = ({
  busy,
  idle,
  busyLabel,
}: {
  busy: boolean;
  idle: string;
  busyLabel: string;
}) => (
  <span className="grid">
    <span className={cn("col-start-1 row-start-1", busy && "invisible")}>
      {idle}
    </span>
    <span
      className={cn(
        "col-start-1 row-start-1 flex items-center justify-center gap-1.5",
        !busy && "invisible",
      )}
    >
      <Loader2 className="size-4 animate-spin" />
      {busyLabel}
    </span>
  </span>
);

/**
 * Settings entry point, so an update is still one click away when the title
 * bar is out of mind. Hidden outside a Microsoft Store install, where there is
 * nothing to check.
 */
export const StoreUpdateRow = () => {
  const { status, checkedAt, phase, percent, restart, recheck } =
    useStoreUpdate();
  const [checking, setChecking] = useState(false);

  // Settings can open before the provider's first scheduled check.
  useEffect(() => {
    void recheck();
  }, [recheck]);

  if (!status.supported) return null;

  const checkNow = async () => {
    setChecking(true);
    await Promise.all([
      recheck(),
      new Promise((resolve) => window.setTimeout(resolve, MIN_CHECKING_MS)),
    ]);
    setChecking(false);
  };

  const busy = phase === "downloading" || phase === "restarting";

  // "Up to date" is only as fresh as the last answer, so say when that was. It
  // is also what gives the check button a reason to be there.
  const description =
    phase === "downloading"
      ? "Downloading the update. You can keep using Mote while it does."
      : phase === "ready"
        ? "The update is downloaded. Restart Mote to finish installing it."
        : phase === "restarting"
          ? "Mote is closing to install the update and opens again when it is done."
          : status.available
            ? "A newer version is ready. Mote closes to install it and opens again."
            : checkedAt
              ? `You have the latest version. Last checked ${formatCheckedAt(checkedAt)}.`
              : "The Microsoft Store also installs updates on its own.";

  return (
    <SettingsRow title="Updates" description={description}>
      {status.available || phase !== "idle" ? (
        <Button
          disabled={busy}
          onClick={() => void restart()}
        >
          <StableLabel
            busy={busy}
            idle={phase === "ready" ? "Restart to update" : "Update"}
            busyLabel={
              phase === "restarting"
                ? "Restarting…"
                : percent === null
                  ? "Downloading…"
                  : `Downloading ${percent}%`
            }
          />
        </Button>
      ) : (
        <Button
          variant="outline"
          className="bg-background shadow-none hover:bg-background/75"
          disabled={checking}
          onClick={() => void checkNow()}
        >
          <StableLabel
            busy={checking}
            idle="Check for updates"
            busyLabel="Checking…"
          />
        </Button>
      )}
    </SettingsRow>
  );
};
