import { useStoreUpdate } from "@/features/updates/useStoreUpdate";
import { Sparkles } from "lucide-react";
import { useWhatsNewStore } from "./store";

/**
 * Title-bar entry shown for the first launch after an update. Stays out of the
 * way while another update is pending, since the update pill takes that spot.
 */
export const WhatsNewButton = () => {
  const { status, phase } = useStoreUpdate();
  const notes = useWhatsNewStore((state) => state.justUpdated);
  const show = useWhatsNewStore((state) => state.show);

  if (!notes || status.available || phase !== "idle") return null;

  return (
    <button
      type="button"
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        show(notes);
      }}
      className="flex h-full items-center justify-center gap-1.5 px-3 text-xs text-primary transition-colors hover:bg-foreground/5 dark:hover:bg-foreground/10"
    >
      <Sparkles size={16} strokeWidth={2.2} />
      What's new
    </button>
  );
};
