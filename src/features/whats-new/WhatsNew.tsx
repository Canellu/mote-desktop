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
import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { detectUpdate, useWhatsNewStore } from "./store";

/**
 * The changelog dialog. It opens only on request, from the title-bar entry
 * shown after an update or from Settings.
 */
export const WhatsNew = () => {
  const { notes, open, close } = useWhatsNewStore();
  const { configured, isLoading } = useHue();

  useEffect(() => {
    // Waits for the saved bridge, which tells an old install from a new one.
    if (!isLoading) void detectUpdate(configured);
  }, [isLoading, configured]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="grid max-h-[min(var(--overlay-max-height),40rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-5 sm:max-w-lg">
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
