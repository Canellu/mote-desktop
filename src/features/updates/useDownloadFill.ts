import { useEffect, useState } from "react";

const TICK_MS = 250;
/** Roughly how long a Store download takes, for pacing the estimate. */
const ESTIMATE_TIME_CONSTANT_MS = 15_000;
/** The estimate never claims the download is nearly done. */
const ESTIMATE_CEILING = 90;

/**
 * Width of the download fill. The Store often reports nothing until the
 * package is in, so between reports the fill eases toward a ceiling on its
 * own, and any real report further along takes over.
 */
export const useDownloadFill = (downloading: boolean, percent: number | null) => {
  const [estimate, setEstimate] = useState(0);

  useEffect(() => {
    if (!downloading) {
      setEstimate(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      setEstimate(
        ESTIMATE_CEILING * (1 - Math.exp(-elapsed / ESTIMATE_TIME_CONSTANT_MS)),
      );
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [downloading]);

  return Math.max(estimate, percent ?? 0);
};
