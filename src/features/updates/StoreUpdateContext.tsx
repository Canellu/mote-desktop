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
  installStoreUpdate,
  STORE_UPDATE_PROGRESS_EVENT,
  type StoreUpdateProgress,
  type StoreUpdateStatus,
} from "./api";
import { NO_STORE_UPDATE, StoreUpdateContext } from "./useStoreUpdate";

/** Startup is busy enough; the first Store query can wait a moment. */
const FIRST_CHECK_DELAY_MS = 15_000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Refocusing the window re-checks, but not more often than this. */
const FOCUS_RECHECK_MIN_GAP_MS = 60 * 60 * 1000;
const PROGRESS_TOAST_ID = "store-update-progress";

const progressToast = {
  downloading: {
    title: "Downloading the update",
    description: "Mote will close and reopen to finish.",
  },
  installing: {
    title: "Installing the update",
    description: "Mote will close in a moment and reopen when it is done.",
  },
} satisfies Record<
  StoreUpdateProgress["phase"],
  { title: string; description: string }
>;

/**
 * One owner for the Store update state, so the title bar and Settings show the
 * same answer and never query the Store twice for it. Everything that talks to
 * the Store lives in Rust; this only schedules the questions.
 */
export const StoreUpdateProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<StoreUpdateStatus>(NO_STORE_UPDATE);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<StoreUpdateProgress | null>(null);
  const lastCheck = useRef(0);

  const recheck = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      setStatus(await checkStoreUpdate());
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

  const install = useCallback(async () => {
    setInstalling(true);
    let unlisten: UnlistenFn | undefined;
    try {
      // Progress only starts once the customer accepts Microsoft's dialog, so
      // the first event is also the moment to warn that Mote is about to close.
      let shownPhase: StoreUpdateProgress["phase"] | null = null;
      unlisten = await listen<StoreUpdateProgress>(
        STORE_UPDATE_PROGRESS_EVENT,
        ({ payload }) => {
          setProgress(payload);
          if (payload.phase === shownPhase) return;
          shownPhase = payload.phase;
          const { title, description } = progressToast[payload.phase];
          toast.loading(title, {
            id: PROGRESS_TOAST_ID,
            description,
            duration: Infinity,
          });
        },
      );

      const outcome = await installStoreUpdate();
      if (outcome === "up_to_date") {
        toast.success("Mote Desktop is already up to date");
        await recheck();
      } else if (outcome === "failed") {
        toast.error(
          "The update could not be installed. You can also update from the Microsoft Store.",
        );
      }
      // "installed" rarely arrives, because Windows closes Mote to install it,
      // and "canceled" means the customer chose to dismiss Microsoft's dialog.
    } catch (error) {
      toast.error(
        typeof error === "string" && error.trim()
          ? error
          : "The update could not be installed.",
      );
    } finally {
      unlisten?.();
      toast.dismiss(PROGRESS_TOAST_ID);
      setProgress(null);
      setInstalling(false);
    }
  }, [recheck]);

  const value = useMemo(
    () => ({ status, checkedAt, installing, progress, install, recheck }),
    [status, checkedAt, installing, progress, install, recheck],
  );

  return (
    <StoreUpdateContext.Provider value={value}>
      {children}
    </StoreUpdateContext.Provider>
  );
};
