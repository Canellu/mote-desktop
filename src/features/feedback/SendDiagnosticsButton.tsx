import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { getDiagnosticsCode } from "./api";
import { useDiagnosticsReport } from "./diagnosticsReport";

/**
 * The error-screen entry point: the latest failure's code, which a user can
 * quote in an email, and a link that opens the diagnostics report.
 */
export const SendDiagnosticsButton = ({
  className,
}: {
  className?: string;
}) => {
  const show = useDiagnosticsReport((state) => state.show);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    void getDiagnosticsCode()
      .then(setCode)
      .catch(() => setCode(null));
  }, []);

  return (
    <div className={className}>
      <div className="flex flex-col items-center gap-0.5">
        <Button
          variant="link"
          className="underline decoration-foreground/60 hover:decoration-foreground"
          onClick={show}
        >
          Send diagnostics
        </Button>
        {code && (
          <span className="font-mono text-xs text-muted-foreground select-text">
            Error code {code}
          </span>
        )}
      </div>
    </div>
  );
};
