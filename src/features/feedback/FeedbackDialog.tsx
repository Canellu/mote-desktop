import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronDown, Copy, Loader2, Send } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  feedbackCategories,
  feedbackErrorMessage,
  isFeedbackCategory,
  previewFeedback,
  submitFeedback,
  type ContactPreference,
  type FeedbackCategory,
} from "./api";

const MAX_MESSAGE_LENGTH = 4_000;

type SubmissionState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent"; reportId: string }
  | { phase: "error"; message: string };

/** A read-only, collapsed view of the diagnostics a report will carry. */
const DiagnosticsDetails = ({ lines }: { lines: string[] | null }) => (
  <Collapsible className="rounded-2xl border border-foreground/12 bg-input/30 dark:border-foreground/8">
    <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium">
      What's sent
      <ChevronDown
        size={16}
        className="text-muted-foreground transition-transform group-data-panel-open:rotate-180"
      />
    </CollapsibleTrigger>
    <CollapsibleContent>
      {/* The cap goes on the viewport: it fills the root, so a max-height on
          the root alone never makes the viewport scroll. */}
      <ScrollArea
        className="border-t border-foreground/8"
        viewportClassName="max-h-56"
      >
        {lines === null ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : (
          <pre className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground select-text">
            {lines.join("\n")}
          </pre>
        )}
      </ScrollArea>
    </CollapsibleContent>
  </Collapsible>
);

/**
 * Controlled so more than one surface can open it — the title-bar button, the
 * Settings row, and error screens. Rust owns validation, redaction, transport,
 * and the diagnostics themselves; this component owns the draft and which of
 * the four phases it is in.
 *
 * `mode="diagnostics"` is the error-screen report: its message is written by
 * Rust and read-only, and diagnostics are always attached.
 */
export const FeedbackDialog = ({
  open,
  onOpenChange,
  mode = "feedback",
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  mode?: "feedback" | "diagnostics";
  children?: ReactNode;
}) => {
  const isReport = mode === "diagnostics";
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [keepUpdated, setKeepUpdated] = useState(false);
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [diagnosticsLines, setDiagnosticsLines] = useState<string[] | null>(
    null,
  );
  const [state, setState] = useState<SubmissionState>({ phase: "idle" });
  const [copied, setCopied] = useState(false);

  const sending = state.phase === "sending";

  // Capture the diagnostics when the dialog opens. Sending reuses this exact
  // snapshot, so what the reporter can expand is what leaves the PC.
  useEffect(() => {
    if (!open) return;
    // Reset on open, not on close: resetting while the dialog fades out
    // flashed the empty form over the "sent" confirmation.
    setCategory("general");
    setMessage("");
    setEmail("");
    setKeepUpdated(false);
    setIncludeDiagnostics(true);
    setState({ phase: "idle" });
    setCopied(false);
    let cancelled = false;
    setDiagnosticsLines(null);
    void previewFeedback({
      category: "bug",
      message: "",
      contactPreference: "none",
      diagnosticsReport: true,
    })
      .then((preview) => {
        if (cancelled) return;
        setDiagnosticsLines(preview.diagnosticsLines);
      })
      .catch(() => {
        if (!cancelled) setDiagnosticsLines([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const contactPreference: ContactPreference = !email.trim()
    ? "none"
    : keepUpdated
      ? "updates"
      : "reply";

  const handleOpenChange = (next: boolean) => {
    // Closing mid-send would orphan a request whose result the reporter still
    // needs to see, so the dialog stays put until it resolves.
    if (!next && sending) return;

    onOpenChange(next);
  };

  const send = async () => {
    const trimmed = message.trim();
    if (!isReport && !trimmed) return;

    setState({ phase: "sending" });

    try {
      const { reportId } = await submitFeedback({
        category: isReport ? "bug" : category,
        message: trimmed,
        email: email.trim() || undefined,
        contactPreference,
        includeDiagnostics: isReport || includeDiagnostics,
        diagnosticsReport: isReport,
      });
      setState({ phase: "sent", reportId });
    } catch (error) {
      // The draft stays exactly where it was, so Try again costs nothing.
      setState({ phase: "error", message: feedbackErrorMessage(error) });
    }
  };

  const copyReportId = async (reportId: string) => {
    try {
      await navigator.clipboard.writeText(reportId);
      setCopied(true);
      toast.success("Reference copied");
    } catch {
      toast.error("Couldn't copy the reference");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children}

      <DialogContent className="sm:max-w-lg">
        {state.phase === "sent" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {isReport ? "Diagnostics sent" : "Feedback sent"}
              </DialogTitle>
              <DialogDescription>
                Quote this reference if you get in touch about it.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/12 bg-input/30 px-4 py-3 dark:border-foreground/8">
              <code className="text-sm font-medium">{state.reportId}</code>
              <Button
                type="button"
                variant="outline"
                className="bg-background shadow-none hover:bg-background/75"
                onClick={() => void copyReportId(state.reportId)}
              >
                {copied ? <Check /> : <Copy />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <DialogFooter>
              <DialogClose render={<Button />}>Done</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {isReport ? "Send diagnostics" : "Send feedback"}
              </DialogTitle>
              <DialogDescription>
                {isReport
                  ? "Sends a technical summary of what Mote tried and where it stopped, so we can see what went wrong. It never includes names, addresses, or credentials."
                  : "Tell us what happened or what would make Mote better."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-5">
              {isReport && (
                <div className="grid gap-2">
                  <Label htmlFor="diagnostics-note">
                    Add a note (optional)
                  </Label>
                  <textarea
                    id="diagnostics-note"
                    value={message}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={3}
                    disabled={sending}
                    placeholder="What were you doing when it happened?"
                    className="min-h-20 w-full resize-none rounded-2xl border border-foreground/12 bg-input/30 px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:border-foreground/8"
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <DiagnosticsDetails lines={diagnosticsLines} />
                </div>
              )}

              {!isReport && (
                <div className="grid gap-2">
                  <Label htmlFor="feedback-category">Feedback type</Label>
                  <Select
                    value={category}
                    disabled={sending}
                    onValueChange={(value) => {
                      if (isFeedbackCategory(value)) setCategory(value);
                    }}
                  >
                    <SelectTrigger id="feedback-category" className="w-full">
                      <SelectValue>
                        {() => feedbackCategories[category]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(feedbackCategories).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isReport && (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="feedback-message">Your feedback</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {message.length}/{MAX_MESSAGE_LENGTH}
                    </span>
                  </div>
                  <textarea
                    id="feedback-message"
                    value={message}
                    maxLength={MAX_MESSAGE_LENGTH}
                    rows={7}
                    disabled={sending}
                    placeholder="What should we know?"
                    className="min-h-36 w-full resize-none rounded-2xl border border-foreground/12 bg-input/30 px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:border-foreground/8"
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Please leave out personal details, credentials, bridge
                    addresses, and Hue names. Anything that looks like one is
                    removed before the report is sent.
                  </p>
                </div>
              )}

              {!isReport && (
                <div className="grid gap-2">
                  <Label className="flex items-center gap-2.5 font-normal">
                    <Checkbox
                      checked={includeDiagnostics}
                      disabled={sending}
                      onCheckedChange={(checked) =>
                        setIncludeDiagnostics(checked)
                      }
                    />
                    Include diagnostics
                  </Label>
                  {includeDiagnostics && (
                    <DiagnosticsDetails lines={diagnosticsLines} />
                  )}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="feedback-email">Email (optional)</Label>
                <Input
                  id="feedback-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  maxLength={254}
                  disabled={sending}
                  placeholder="Only if you want a reply"
                  onChange={(event) => setEmail(event.target.value)}
                />
                {email.trim() && (
                  <Label className="mt-1 flex items-center gap-2.5 font-normal text-muted-foreground">
                    <Checkbox
                      checked={keepUpdated}
                      disabled={sending}
                      onCheckedChange={(checked) => setKeepUpdated(checked)}
                    />
                    Also keep me updated on this report
                  </Label>
                )}
              </div>

              {state.phase === "error" && (
                <p
                  role="alert"
                  className="rounded-2xl bg-(--destructive)/10 px-4 py-3 text-sm text-(--destructive-text)"
                >
                  {state.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose
                render={<Button variant="ghost" />}
                disabled={sending}
              >
                Cancel
              </DialogClose>
              <Button
                type="button"
                disabled={(!isReport && !message.trim()) || sending}
                onClick={() => void send()}
              >
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
                {sending
                  ? "Sending…"
                  : isReport && state.phase !== "error"
                    ? "Send diagnostics"
                    : state.phase === "error"
                      ? "Try again"
                      : "Send feedback"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
