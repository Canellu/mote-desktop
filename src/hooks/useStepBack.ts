import { useRouter } from "@tanstack/react-router";

/**
 * Leaves a child page by stepping back to the entry that opened it. Pushing
 * the parent instead would leave the child as the parent's previous entry, so
 * the parent's own Back would return to it. `fallback` runs when this page is
 * the first history entry, and should navigate with `replace: true`.
 */
export function useStepBack(fallback: () => void) {
  const router = useRouter();
  return () => {
    if (router.history.canGoBack()) router.history.back();
    else fallback();
  };
}
