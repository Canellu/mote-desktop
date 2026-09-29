import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { openFirewallSettings } from "@/lib/firewall";

// Underlined up front so it reads as clickable without a hover.
const WizardLink = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) => (
  <Button
    variant="link"
    className="underline decoration-foreground/60 hover:decoration-foreground"
    onClick={onClick}
  >
    {children}
  </Button>
);

export const ManualEntryLink = ({ onClick }: { onClick: () => void }) => (
  <WizardLink onClick={onClick}>Enter the bridge's IP address instead</WizardLink>
);

export const FirewallSettingsLink = () => (
  <WizardLink onClick={() => void openFirewallSettings()}>
    Open Windows Firewall settings
  </WizardLink>
);
