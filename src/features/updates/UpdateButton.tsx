import { ArrowDownToLine, Loader2, RotateCw } from "lucide-react";
import { useStoreUpdate } from "./useStoreUpdate";

/**
 * Title-bar entry point. Renders nothing unless the Store reports a newer
 * package or an update is under way, so a current or development build never
 * shows it.
 *
 * The first click downloads while Mote stays open, filling the pill as it goes.
 * Once the package is in, the pill asks for the restart that installs it.
 */
export const UpdateButton = () => {
  const { status, phase, percent, download, restart } = useStoreUpdate();

  if (!status.supported || (!status.available && phase === "idle")) {
    return null;
  }

  const busy = phase === "downloading" || phase === "restarting";
  const label =
    phase === "downloading"
      ? percent === null
        ? "Downloading…"
        : `Downloading ${percent}%`
      : phase === "ready"
        ? "Restart to update"
        : phase === "restarting"
          ? "Restarting…"
          : "Update";

  return (
    <button
      type="button"
      aria-label={
        phase === "idle" && status.mandatory
          ? "Download required update"
          : undefined
      }
      disabled={busy}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void (phase === "ready" ? restart() : download());
      }}
      className="group flex h-full items-center justify-center px-1.5 outline-none"
    >
      {/* A filled pill, unlike its neighbours, so a pending update is
        noticed rather than read as another title-bar control. */}
      <span className="relative flex h-7 items-center overflow-hidden rounded-md bg-info px-2.5 text-xs font-medium text-info-foreground shadow-xs transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-enabled:group-hover:bg-info/85">
        {phase === "downloading" && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-300 ease-out"
            style={{ width: `${percent ?? 0}%` }}
          />
        )}
        <span className="relative flex items-center gap-1.5">
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : phase === "ready" ? (
            <RotateCw size={15} strokeWidth={2.2} />
          ) : (
            <ArrowDownToLine size={15} strokeWidth={2.2} />
          )}
          {/* Tabular digits keep the pill from twitching as the percent climbs. */}
          <span className="tabular-nums">{label}</span>
        </span>
      </span>
    </button>
  );
};
