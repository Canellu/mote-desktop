import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

const RETRY_MS = 2000;
// The bridge accepts a new credential for 30s after its button is pressed; a
// minute gives the user time to walk to it first.
const TIMEOUT_MS = 60_000;

/**
 * Provisions the PC Sync credential the way pairing does: the bridge refuses
 * (Hue error 101) until its link button is pressed, so keep asking while it
 * says so, until it succeeds, fails another way, times out, or is cancelled.
 */
export const useLinkButtonProvision = (onProvisioned: () => Promise<void>) => {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (retryRef.current) clearTimeout(retryRef.current);
    if (deadlineRef.current) clearTimeout(deadlineRef.current);
    retryRef.current = null;
    deadlineRef.current = null;
    setWaiting(false);
  }, []);

  const start = useCallback(() => {
    stop();
    activeRef.current = true;
    setError(null);
    setWaiting(true);

    deadlineRef.current = setTimeout(() => {
      stop();
      setError(
        "The link button wasn't pressed in time. Press it on your Hue Bridge, then try again.",
      );
    }, TIMEOUT_MS);

    const attempt = async () => {
      try {
        await invoke("provision-host-sync-credentials");
        if (!activeRef.current) return;
        stop();
        await onProvisioned();
      } catch (attemptError) {
        if (!activeRef.current) return;
        const message = String(attemptError) || "Unable to pair PC Sync.";
        if (message.toLowerCase().includes("link button")) {
          retryRef.current = setTimeout(() => void attempt(), RETRY_MS);
          return;
        }
        stop();
        setError(message);
      }
    };

    void attempt();
  }, [onProvisioned, stop]);

  useEffect(() => stop, [stop]);

  return { waiting, error, start, cancel: stop };
};
