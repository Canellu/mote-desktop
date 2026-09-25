import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHue } from "@/context/HueContext";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { getVersion } from "@tauri-apps/api/app";
import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { releaseNotesFor } from "./releaseNotes";
import { markSeen, readLastSeen, useWhatsNewStore } from "./store";

/** Lets Home finish arriving before the dialog opens over it. */
const OPEN_DELAY_MS = 900;

/**
 * Shows the new version's changelog entry once, on the first launch after an
 * update. A fresh install goes through setup instead, so it is marked seen
 * without being shown.
 */
export const WhatsNew = () => {
  const { configured, connected, isLoading, isAddingBridge } = useHue();
  const resourcesHasLoaded = useHueResourcesStore((state) => state.hasLoaded);
  const { notes, open, show, close } = useWhatsNewStore();
  // The same conditions App uses to show Home, so it never covers setup.
  const homeShown =
    configured && connected && resourcesHasLoaded && !isAddingBridge;

  useEffect(() => {
    if (isLoading || configured || readLastSeen() !== null) return;
    void getVersion().then(markSeen);
  }, [isLoading, configured]);

  useEffect(() => {
    if (!homeShown) return;
    let cancelled = false;
    let timer: number | undefined;
    void getVersion().then((version) => {
      if (cancelled || readLastSeen() === version) return;
      const current = releaseNotesFor(version);
      // A version without an entry has nothing to say.
      if (!current) {
        markSeen(version);
        return;
      }
      timer = window.setTimeout(() => {
        if (!cancelled) show(current);
      }, OPEN_DELAY_MS);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [homeShown, show]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="grid max-h-[min(calc(100vh-6rem),40rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-5 sm:max-w-lg">
        <DialogHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/20">
            <Sparkles size={20} />
          </span>
          <DialogTitle>What's new in Mote {notes?.version}</DialogTitle>
          <DialogDescription>
            {notes?.date
              ? `Released ${new Date(`${notes.date}T12:00`).toLocaleDateString(
                  undefined,
                  {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  },
                )}.`
              : "Here's what changed in this update."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-1 min-h-0">
          <div className="grid gap-5 px-1">
            {notes?.sections.map((section) => (
              <section key={section.title} className="grid gap-2">
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {section.title}
                </h3>
                <ul className="grid gap-2.5">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-sm leading-relaxed"
                    >
                      <span
                        aria-hidden
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                      />
                      <span>
                        {/* The changelog bolds a lead phrase with **…**; odd parts are bold. */}
                        {item.split("**").map((part, index) =>
                          index % 2 === 1 ? (
                            <strong key={index} className="font-semibold">
                              {part}
                            </strong>
                          ) : (
                            part
                          ),
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button size="lg" onClick={close}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
