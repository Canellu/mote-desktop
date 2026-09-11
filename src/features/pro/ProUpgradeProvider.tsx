import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ProUpgradeContext,
  registerProUpgradeOpener,
  type ProFeature,
} from "@/features/pro/proUpgrade";
import { usePaywallVariant } from "@/features/pro/proVariants";
import { useProPurchase } from "@/features/pro/useProPurchase";
import { AuroraPaywall } from "@/features/pro/variants/AuroraPaywall";
import { QuietPaywall } from "@/features/pro/variants/QuietPaywall";
import { SplitPaywall } from "@/features/pro/variants/SplitPaywall";
import { SpotlightPaywall } from "@/features/pro/variants/SpotlightPaywall";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Each design also wants a different dialog footprint. */
const SHELL = {
  aurora: "max-h-[min(92vh,48rem)] sm:max-w-[58rem]",
  split: "max-h-[min(92vh,44rem)] sm:max-w-[54rem]",
  quiet: "max-h-[min(92vh,44rem)] sm:max-w-[34rem]",
  spotlight: "max-h-[min(92vh,46rem)] sm:max-w-[42rem]",
} as const;

export const ProUpgradeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [feature, setFeature] = useState<ProFeature | null>(null);
  const variant = usePaywallVariant((state) => state.variant);
  const purchase = useProPurchase(feature !== null);

  const requestPro = useCallback(
    (next: ProFeature = "general") => setFeature(next),
    [],
  );
  const close = useCallback(() => setFeature(null), []);

  // Lets code with no component around it — the global shortcut handler — open
  // this, which is exactly where a refusal happens.
  useEffect(() => registerProUpgradeOpener(requestPro), [requestPro]);

  const value = useMemo(() => ({ requestPro }), [requestPro]);

  const Paywall =
    variant === "split"
      ? SplitPaywall
      : variant === "quiet"
        ? QuietPaywall
        : variant === "spotlight"
          ? SpotlightPaywall
          : AuroraPaywall;

  return (
    <ProUpgradeContext.Provider value={value}>
      {children}

      <Dialog open={feature !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "overflow-hidden p-0 text-foreground",
            "border-black/10 dark:border-white/10",
            SHELL[variant],
          )}
        >
          <Paywall
            feature={feature ?? "general"}
            purchase={purchase}
            onClose={close}
          />
        </DialogContent>
      </Dialog>
    </ProUpgradeContext.Provider>
  );
};
