import { BuyButton } from "@/features/pro/BuyButton";
import { type ProFeature, useProUpgrade } from "@/features/pro/proUpgrade";

/**
 * Says a tab's feature needs Mote Pro while it can still be set up. It leads
 * the tab, straight under the Settings header and across its full width,
 * instead of sitting inside one of the tab's sections.
 */
export function ProSetupBanner({
  feature,
  children,
}: {
  feature: ProFeature;
  children: React.ReactNode;
}) {
  const { requestPro } = useProUpgrade();

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
      <p className="min-w-0 flex-1 text-sm leading-6">{children}</p>
      <BuyButton size="sm" onClick={() => requestPro(feature)}>
        Get Mote Pro
      </BuyButton>
    </div>
  );
}
