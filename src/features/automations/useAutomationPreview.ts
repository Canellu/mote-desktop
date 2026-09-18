import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { describeCommandError } from "@/lib/entitlement-errors";
import type { AutomationRule, AutomationSettings } from "./model";

// One queue per webview: a late update must never land after its stop request.
let pending: Promise<unknown> = Promise.resolve();
let request = 0;
function enqueue(rule: AutomationRule | null, settings: AutomationSettings) {
  const id = ++request;
  const result = pending
    .catch(() => undefined)
    .then(() => {
      if (id !== request) return;
      return invoke("preview-automation", { rule, settings });
    });
  pending = result;
  return result;
}

export function useAutomationPreview(
  rule: AutomationRule | null,
  settings: AutomationSettings | null,
): { error: string | null } {
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(settings);
  latest.current = settings;
  const generation = useRef(0);

  useEffect(() => {
    if (!settings || !isTauri()) return;
    const current = ++generation.current;
    let disposed = false;
    const send = () => {
      if (disposed) return;
      void enqueue(rule, settings).then(
        () => {
          if (!disposed && generation.current === current) setError(null);
        },
        (reason) => {
          if (!disposed && generation.current === current)
            setError(describeCommandError(reason));
        },
      );
    };
    // Coalesce wheel/slider updates; null stops immediately.
    const timer = setTimeout(send, rule ? 180 : 0);
    // A short backend lease also cleans up if the webview crashes or disappears.
    const renewal = rule ? setInterval(send, 5_000) : undefined;
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (renewal) clearInterval(renewal);
    };
  }, [rule, settings]);

  useEffect(
    () => () => {
      const settings = latest.current;
      if (settings && isTauri())
        void enqueue(null, settings).catch(() => undefined);
    },
    [],
  );

  return { error };
}
