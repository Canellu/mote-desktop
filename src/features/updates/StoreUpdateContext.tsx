import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  checkStoreUpdate,
  downloadStoreUpdate,
  installStoreUpdate,
  STORE_UPDATE_PROGRESS_EVENT,
  type StoreUpdateProgress,
  type StoreUpdateStatus,
} from "./api";
import {
  NO_STORE_UPDATE,
  StoreUpdateContext,
  type StoreUpdatePhase,
} from "./useStoreUpdate";

/** Startup is busy enough; the first Store query can wait a moment. */
const FIRST_CHECK_DELAY_MS = 15_000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Refocusing the window re-checks, but not more often than this. */
const FOCUS_RECHECK_MIN_GAP_MS = 60 * 60 * 1000;

const errorMessage = (error: unknown, fallback: string) =>
  typeof error === "string" && error.trim() ? error : fallback;

/**
 * One owner for the Store update state, so the title bar and Settings show the
 * same answer and never query the Store twice for it. Everything that talks to
 * the Store lives in Rust; this only schedules the questions.
 *
 * An update takes two steps. The download runs while Mote stays open, and only
 * the restart that installs it closes the app, when the customer chooses to.
 */
export const StoreUpdateProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<StoreUpdateStatus>(NO_STORE_UPDATE);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [phase, setPhaseState] = useState<StoreUpdatePhase>("idle");
  const [percent, setPercent] = useState<number | null>(null);
  const lastCheck = useRef(0);
  // The callbacks read this rather than state, so a phase set a moment ago is
  // seen before the next render.
  const phaseRef = useRef<StoreUpdatePhase>("idle");

  const setPhase = useCallback((next: StoreUpdatePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const recheck = useCallback(async () => {
    // A check answered mid-update could report nothing waiting and take the
    // button away from the update it is working on.
    if (phaseRef.current !== "idle") return;
    lastCheck.current = Date.now();
    try {
      const next = await checkStoreUpdate();
      if (phaseRef.current !== "idle") return;
      setStatus(next);
      setCheckedAt(Date.now());
    } catch {
      // A failed check keeps the last known answer rather than hiding a real
      // update or inventing one.
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void recheck(), FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(
      () => void recheck(),
      RECHECK_INTERVAL_MS,
    );
    const onFocus = () => {
      if (Date.now() - lastCheck.current > FOCUS_RECHECK_MIN_GAP_MS) {
        void recheck();
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [recheck]);

  const restart = useCallback(async () => {
    if (phaseRef.current !== "ready") return;
    setPhase("restarting");
    try {
      const outcome = await installStoreUpdate();
      // "installed" rarely arrives, because Windows closes Mote to install it.
      if (outcome === "up_to_date") {
        setPhase("idle");
        toast.success("Mote Desktop is already up to date");
        await recheck();
      } else if (outcome === "canceled") {
        setPhase("ready");
      } else if (outcome === "failed") {
        setPhase("ready");
        toast.error(
          "The update could not be installed. You can also update from the Microsoft Store.",
        );
      }
    } catch (error) {
      setPhase("ready");
      toast.error(errorMessage(error, "The update could not be installed."));
    }
  }, [recheck, setPhase]);

  const download = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    setPhase("downloading");
    setPercent(null);
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<StoreUpdateProgress>(
        STORE_UPDATE_PROGRESS_EVENT,
        ({ payload }) => setPercent(payload.percent),
      );

      const outcome = await downloadStoreUpdate();
      if (outcome === "downloaded") {
        setPhase("ready");
        toast.success("The update is ready", {
          description: "Restart Mote to finish installing it.",
          action: { label: "Restart", onClick: () => void restart() },
        });
        return;
      }

      setPhase("idle");
      if (outcome === "up_to_date") {
        toast.success("Mote Desktop is already up to date");
        await recheck();
      } else if (outcome === "failed") {
        toast.error(
          "The update could not be downloaded. You can also update from the Microsoft Store.",
        );
      }
      // "canceled" means the customer dismissed Microsoft's dialog.
    } catch (error) {
      setPhase("idle");
      toast.error(errorMessage(error, "The update could not be downloaded."));
    } finally {
      unlisten?.();
      setPercent(null);
    }
  }, [recheck, restart, setPhase]);

  const value = useMemo(
    () => ({ status, checkedAt, phase, percent, download, restart, recheck }),
    [status, checkedAt, phase, percent, download, restart, recheck],
  );

  return (
    <StoreUpdateContext.Provider value={value}>
      {children}
    </StoreUpdateContext.Provider>
  );
};
