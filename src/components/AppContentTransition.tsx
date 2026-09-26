import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

export type AppViewKey =
  | "wizard-dev"
  | "component-gallery"
  | "device-gallery"
  | "widget-wizard"
  | "home-preview"
  | "loading"
  | "home"
  | "disconnected"
  | "error-boundary"
  | "sync-box-wizard"
  | "wizard";

type AppContentTransitionKind = "fade" | "setup-to-ready";

const appContentFadeTransition = {
  duration: 0.3,
  ease: "easeOut",
} as const;

const appSetupExitTransition = {
  duration: 0.18,
  ease: "easeOut",
} as const;

const appSetupEnterTransition = {
  duration: 0.34,
  ease: "easeOut",
} as const;

const isSetupView = (viewKey: AppViewKey | null) =>
  viewKey === "wizard" || viewKey === "wizard-dev";

const isReadyView = (viewKey: AppViewKey) =>
  viewKey === "home" || viewKey === "home-preview";

interface AppContentVariantCustom {
  kind: AppContentTransitionKind;
  reduceMotion: boolean;
}

// The incoming view fades in on top (zIndex 2) while the outgoing view stays
// fully opaque beneath it (zIndex 1) until it unmounts. Because there's always
// an opaque layer behind, the page background never shows through mid-fade.
const appContentVariants = {
  initial: ({ kind, reduceMotion }: AppContentVariantCustom) =>
    kind === "setup-to-ready" && !reduceMotion
      ? { opacity: 0, y: 16, scale: 0.995, zIndex: 2 }
      : { opacity: 0, zIndex: 2 },
  animate: ({ kind, reduceMotion }: AppContentVariantCustom) =>
    kind === "setup-to-ready" && !reduceMotion
      ? {
          opacity: 1,
          y: 0,
          scale: 1,
          zIndex: 2,
          transition: appSetupEnterTransition,
        }
      : { opacity: 1, zIndex: 2, transition: appContentFadeTransition },
  exit: ({ kind, reduceMotion }: AppContentVariantCustom) => {
    if (kind === "setup-to-ready") {
      return reduceMotion
        ? { opacity: 0, zIndex: 1, transition: appSetupExitTransition }
        : {
            opacity: 0,
            y: -8,
            scale: 0.985,
            zIndex: 1,
            transition: appSetupExitTransition,
          };
    }

    return { opacity: 1, zIndex: 1, transition: appContentFadeTransition };
  },
};

/**
 * Cross-fades between top-level app views. A plain fade between most views, but
 * a lift-and-scale "setup-to-ready" transition when moving from the wizard into
 * Home so the reveal feels intentional.
 */
export const AppContentTransition = ({
  viewKey,
  children,
}: {
  viewKey: AppViewKey;
  children: ReactNode;
}) => {
  const previousViewKeyRef = useRef<AppViewKey | null>(null);
  const transitionKindRef = useRef<AppContentTransitionKind>("fade");
  const reduceMotion = Boolean(useReducedMotion());

  if (previousViewKeyRef.current !== viewKey) {
    transitionKindRef.current =
      isSetupView(previousViewKeyRef.current) && isReadyView(viewKey)
        ? "setup-to-ready"
        : "fade";
  }

  const transitionKind = transitionKindRef.current;
  const transitionCustom = useMemo(
    () => ({ kind: transitionKind, reduceMotion }),
    [transitionKind, reduceMotion],
  );

  useEffect(() => {
    previousViewKeyRef.current = viewKey;
  }, [viewKey]);

  return (
    <div className="app-content relative isolate h-full overflow-hidden">
      <AnimatePresence
        initial={false}
        mode={transitionKind === "setup-to-ready" ? "wait" : "sync"}
        custom={transitionCustom}
      >
        <motion.div
          key={viewKey}
          data-app-view={viewKey}
          className="absolute inset-0"
          custom={transitionCustom}
          variants={appContentVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
