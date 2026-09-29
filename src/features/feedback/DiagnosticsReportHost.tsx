import { FeedbackDialog } from "./FeedbackDialog";
import { useDiagnosticsReport } from "./diagnosticsReport";

/** The single diagnostics report dialog that error screens open. */
export const DiagnosticsReportHost = () => {
  const open = useDiagnosticsReport((state) => state.open);
  const setOpen = useDiagnosticsReport((state) => state.setOpen);
  return (
    <FeedbackDialog open={open} onOpenChange={setOpen} mode="diagnostics" />
  );
};
