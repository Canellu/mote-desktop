import { create } from "zustand";

interface DiagnosticsReportState {
  open: boolean;
  show: () => void;
  setOpen: (open: boolean) => void;
}

/**
 * Lets any error screen open the diagnostics report without owning a dialog.
 * One `DiagnosticsReportHost` in the title bar renders it.
 */
export const useDiagnosticsReport = create<DiagnosticsReportState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  setOpen: (open) => set({ open }),
}));
