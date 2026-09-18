import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEntitlements } from "@/context/EntitlementContext";
import { BuyButton } from "@/features/pro/BuyButton";
import { formatDaysLeft } from "@/features/pro/trial";
import { purchaseLabel, type ProPurchase } from "@/features/pro/useProPurchase";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink, Minus } from "lucide-react";
import type { Ref } from "react";
import { toast } from "sonner";

/** `true` is included, `false` is not, and a string where the tiers differ by amount. */
type PlanValue = boolean | string;

/**
 * Free against Pro, one capability a row. Mirrors the comparison on
 * motedesktop.com/features, so the app and the site never disagree about what
 * was bought; change the two together.
 */
const COMPARISON: { name: string; free: PlanValue; pro: PlanValue }[] = [
  { name: "Rooms, zones, lights, and scenes", free: true, pro: true },
  { name: "Devices and entertainment areas", free: true, pro: true },
  { name: "Color and white temperature inspector", free: true, pro: true },
  { name: "Entertainment area setup and testing", free: true, pro: true },
  { name: "Hue Play HDMI Sync Box", free: "One box", pro: "One box" },
  { name: "Hue Bridges", free: "One", pro: "Multiple" },
  { name: "Desktop widgets", free: "One", pro: "Unlimited" },
  { name: "Multiple controls in one widget", free: false, pro: true },
  {
    name: "Widget theme, size, corners, and placement",
    free: false,
    pro: true,
  },
  { name: "Dashboard layout", free: "Standard", pro: "Custom" },
  { name: "Global keyboard shortcuts", free: false, pro: true },
  { name: "Automations: on air and away", free: false, pro: true },
  { name: "PC Sync: Video, Games, and Music", free: false, pro: true },
];

const COMPARE_URL = "https://motedesktop.com/features";

type Plan = "free" | "trial" | "pro";

/**
 * A tick, a dash, or a short value. The glyph is hidden from assistive
 * technology and the word given instead, so the table reads aloud as
 * "Included" rather than as a run of symbols.
 */
const PlanCell = ({
  value,
  current,
}: {
  value: PlanValue;
  current: boolean;
}) => (
  <td
    className={cn(
      "border-b border-border/70 px-3 py-2.5 text-center leading-5 group-last:border-b-0",
      current
        ? "bg-foreground/4 font-medium text-foreground group-last:rounded-b-xl"
        : "text-muted-foreground",
    )}
  >
    {typeof value === "string" ? (
      value
    ) : (
      <>
        {value ? (
          <Check
            aria-hidden
            size={16}
            strokeWidth={2.5}
            className={cn("mx-auto", current && "text-success")}
          />
        ) : (
          <Minus
            aria-hidden
            size={16}
            className="mx-auto text-muted-foreground/50"
          />
        )}
        <span className="sr-only">{value ? "Included" : "Not included"}</span>
      </>
    )}
  </td>
);

const PlanHeading = ({
  name,
  caption,
}: {
  name: string;
  caption: string | null;
}) => (
  <th
    scope="col"
    className={cn(
      "border-b border-border/70 px-3 pt-3 pb-2.5 text-center align-bottom",
      caption && "rounded-t-xl bg-foreground/4",
    )}
  >
    <span className="block text-sm font-semibold">{name}</span>
    {/* An empty caption still takes its line, so both headings share a baseline. */}
    <span className="block min-h-4 text-[0.6875rem] leading-4 font-medium text-muted-foreground">
      {caption}
    </span>
  </th>
);

const endDate = (endsAt: number) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(
    endsAt,
  );

interface PlanOverviewProps {
  purchase: ProPurchase;
  onClose: () => void;
  /** The footer's main button, which the dialog focuses when it opens. */
  actionRef?: Ref<HTMLButtonElement>;
}

/**
 * The plan this installation is on, beside what each plan includes.
 *
 * Opened from the tier badge, so somebody who bought Pro can see what they
 * bought, and somebody on Free can see what the purchase adds and make it from
 * here. On a trial it is also the welcome: it opens by itself once, as the
 * trial starts, so nobody finds out they had Pro only when it goes.
 */
export const PlanOverview: React.FC<PlanOverviewProps> = ({
  purchase,
  onClose,
  actionRef,
}) => {
  const { snapshot, hasPro, onTrial, trialDaysLeft, trialEnded } =
    useEntitlements();
  const { offer, phase, buy, retry } = purchase;

  const plan: Plan = onTrial ? "trial" : hasPro ? "pro" : "free";
  const trialEndsAt = snapshot.trial?.endsAt;

  const title =
    plan === "pro"
      ? "Mote Pro"
      : plan === "trial"
        ? "You're trying Mote Pro"
        : "Free";

  const subtitle =
    plan === "pro"
      ? "Bought through the Microsoft Store and yours to keep, on every PC you sign in to with the same account."
      : plan === "trial" && trialEndsAt
        ? `Every Pro feature is on, free, until ${endDate(trialEndsAt)}. No card, and nothing to cancel. When the trial ends you're on Free, and everything you set up with Pro stays saved.`
        : trialEnded
          ? "Your Pro trial has ended. Everything you set up with it is saved, and one purchase switches it back on."
          : "Everyday Hue control, free for good. Mote Pro adds the rest as a one-time purchase, not a subscription.";

  const openCompare = () =>
    void openUrl(COMPARE_URL).catch(() =>
      toast.error("Couldn't open motedesktop.com."),
    );

  const websiteLine = (
    <>
      Every feature is explained on{" "}
      <button
        // On Pro this is all the footer holds, so it takes the opening focus.
        ref={plan === "pro" ? actionRef : undefined}
        type="button"
        onClick={openCompare}
        className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
      >
        motedesktop.com
        <ExternalLink size={12} aria-hidden />
      </button>
      .
    </>
  );

  return (
    <div className="flex min-h-0 flex-col">
      <ScrollArea
        fade
        className="min-h-0 flex-1 overflow-hidden"
        viewportClassName="px-8 pt-8 pb-6"
      >
        <div className="grid gap-6">
          <header className="grid gap-2 pr-8">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {plan === "trial" ? "Free trial" : "Your plan"}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <DialogTitle className="text-[1.75rem] leading-tight font-semibold">
                {title}
              </DialogTitle>
              {plan === "trial" && trialDaysLeft !== null && (
                <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
                  {formatDaysLeft(trialDaysLeft)}
                </span>
              )}
            </div>
            <DialogDescription className="text-sm leading-6">
              {subtitle}
            </DialogDescription>
          </header>

          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="w-[52%] border-b border-border/70 pt-3 pr-3 pb-2.5 align-bottom text-xs font-medium text-muted-foreground"
                >
                  Feature
                </th>
                <PlanHeading
                  name="Free"
                  caption={plan === "free" ? "Your plan" : null}
                />
                <PlanHeading
                  name="Mote Pro"
                  caption={
                    plan === "pro"
                      ? "Your plan"
                      : plan === "trial"
                        ? "On trial"
                        : null
                  }
                />
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.name} className="group">
                  <th
                    scope="row"
                    className="border-b border-border/70 py-2.5 pr-3 leading-5 font-normal group-last:border-b-0"
                  >
                    {row.name}
                  </th>
                  <PlanCell value={row.free} current={plan === "free"} />
                  <PlanCell value={row.pro} current={plan !== "free"} />
                </tr>
              ))}
            </tbody>
          </table>

          {phase === "unavailable" && (
            <p className="rounded-lg bg-muted px-3.5 py-2.5 text-sm leading-6 text-muted-foreground">
              The purchase did not go through, so nothing was charged. Checking
              again will find Mote Pro if you already own it.
            </p>
          )}

          {plan !== "pro" && (
            <p className="text-xs leading-5 text-muted-foreground">
              {plan === "free" &&
                "Already bought Mote Pro on another PC? Sign in to the Microsoft Store with the same account and it restores itself. "}
              {websiteLine}
            </p>
          )}
        </div>
      </ScrollArea>

      <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t px-8 py-5">
        {/* Pro has nothing left to buy or decline, so the footer only says
          where to read more; the close button covers leaving. */}
        {plan === "pro" ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {websiteLine}
          </p>
        ) : (
          <>
            <BuyButton
              ref={actionRef}
              onClick={phase === "unavailable" ? retry : buy}
              disabled={phase === "working"}
              className="px-7 py-3"
            >
              {purchaseLabel(phase)}
            </BuyButton>
            {offer?.formattedPrice && (
              <span className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {offer.formattedPrice}
                </span>{" "}
                once, not a subscription
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
            >
              Not now
            </button>
          </>
        )}
      </footer>
    </div>
  );
};
