import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ProUpgradeContext,
  registerProUpgradeOpener,
  type ProFeature,
} from "@/features/pro/proUpgrade";
import { ProPaywall } from "@/features/pro/ProPaywall";
import { useProPurchase } from "@/features/pro/useProPurchase";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const ProUpgradeProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [feature, setFeature] = useState<ProFeature | null>(null);
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

  return (
    <ProUpgradeContext.Provider value={value}>
      {children}

      <Dialog open={feature !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "overflow-hidden p-0 text-foreground",
            "border-black/10 dark:border-white/10",
            "max-h-[min(92vh,44rem)] sm:max-w-[54rem]",
          )}
        >
          <ProPaywall
            feature={feature ?? "general"}
            purchase={purchase}
            onClose={close}
          />
        </DialogContent>
      </Dialog>
    </ProUpgradeContext.Provider>
  );
};
