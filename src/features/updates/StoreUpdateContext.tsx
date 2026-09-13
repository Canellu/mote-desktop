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
  type StoreUpdateStatus,
} from "./api";
import { NO_STORE_UPDATE, StoreUpdateContext } from "./useStoreUpdate";

/** Startup is busy enough; the first Store query can wait a moment. */
const FIRST_CHECK_DELAY_MS = 15_000;
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Refocusing the window re-checks, but not more often than this. */
const FOCUS_RECHECK_MIN_GAP_MS = 60 * 60 * 1000;

/**
 * One owner for the Store update state, so the title bar and Settings show the
 * same answer and never query the Store twice for it. Everything that talks to
 * the Store lives in Rust; this only schedules the questions.
 */
export const StoreUpdateProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<StoreUpdateStatus>(NO_STORE_UPDATE);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
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
    try {
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
      setInstalling(false);
    }
  }, [recheck]);

  const value = useMemo(
    () => ({ status, checkedAt, installing, install, recheck }),
    [status, checkedAt, installing, install, recheck],
  );

  return (
    <StoreUpdateContext.Provider value={value}>
      {children}
    </StoreUpdateContext.Provider>
  );
};
