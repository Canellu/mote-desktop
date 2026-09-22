import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { describeCommandError } from "@/lib/entitlement-errors";
import type { FocusLook, FocusRitual, FocusStatus } from "./model";

// One queue per webview: a late update must never land after its stop request.
let pending: Promise<unknown> = Promise.resolve();
let request = 0;
function enqueue(ritual: FocusRitual | null, look: FocusLook | null) {
  const id = ++request;
  const result = pending
    .catch(() => undefined)
    .then(() => {
      if (id !== request) return;
      return invoke("preview-focus-look", { ritual, look });
    });
  pending = result;
  return result;
}

/**
 * Shows one of a ritual's looks on its lights while `look` is set, renewing
 * the backend's short lease, and puts the lights back when it clears or the
 * editor closes.
 */
export function useFocusPreview(
  ritual: FocusRitual | null,
  look: FocusLook | null,
): { error: string | null } {
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const active = !!ritual && !!look && ritual.targets.length > 0;

  useEffect(() => {
    if (!isTauri()) return;
    const current = ++generation.current;
    let disposed = false;
    const send = () => {
      if (disposed) return;
      void enqueue(active ? ritual : null, active ? look : null).then(
        () => {
          if (!disposed && generation.current === current) setError(null);
        },
        (reason) => {
          if (!disposed && generation.current === current)
            setError(describeCommandError(reason));
        },
      );
    };
    // Coalesce wheel and slider updates; stopping is immediate.
    const timer = setTimeout(send, active ? 180 : 0);
    const renewal = active ? setInterval(send, 5_000) : undefined;
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (renewal) clearInterval(renewal);
    };
  }, [active, ritual, look]);

  useEffect(
    () => () => {
      if (isTauri()) void enqueue(null, null).catch(() => undefined);
    },
    [],
  );

  return { error: active ? error : null };
}

/** Milliseconds left in the current stage, ticking while the clock runs. */
export function useCountdown(status: FocusStatus): number {
  const [now, setNow] = useState(() => Date.now());
  const running = status.endsAt !== null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  return status.endsAt !== null
    ? Math.max(0, status.endsAt - now)
    : status.remainingMs;
}
