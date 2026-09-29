import { Button } from "@/components/ui/button";

// Underlined up front so it reads as clickable without a hover.
export const ManualEntryLink = ({ onClick }: { onClick: () => void }) => (
  <Button
    variant="link"
    className="underline decoration-foreground/60 hover:decoration-foreground"
    onClick={onClick}
  >
    Enter the bridge's IP address instead
  </Button>
);
