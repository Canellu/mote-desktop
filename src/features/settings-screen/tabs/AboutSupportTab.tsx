import { Button } from "@/components/ui/button";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, Copy, ExternalLink, MessageSquareText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FeedbackDialog } from "@/features/feedback/FeedbackDialog";
import {
  SettingsRow,
  SettingsSection,
  SettingsStack,
} from "../components/SettingsList";

const PUBLIC_LINKS = {
  privacy: "https://motedesktop.com/privacy",
  terms: "https://motedesktop.com/terms",
  support: "https://motedesktop.com/support",
} as const;

const ExternalLinkButton = ({
  label,
  href,
}: {
  label: string;
  href: string;
}) => (
  <Button
    variant="outline"
    className="bg-background shadow-none hover:bg-background/75"
    onClick={() =>
      void openUrl(href).catch(() => toast.error(`Couldn't open ${label}.`))
    }
  >
    {label}
    <ExternalLink data-icon="inline-end" />
  </Button>
);

export const AboutSupportTab = () => {
  const [version, setVersion] = useState("Loading…");
  const [copied, setCopied] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const copyResetRef = useRef<number | null>(null);

  useEffect(() => {
    void getVersion()
      .then(setVersion)
      .catch(() => setVersion("Unavailable"));

    return () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    };
  }, []);

  const diagnostics = useMemo(
    () =>
      [
        "Product: Mote Desktop",
        `Version: ${version}`,
        "Platform: Windows x64",
        `Release channel: ${import.meta.env.DEV ? "development" : "stable"}`,
        "Automatic telemetry: not included",
      ].join("\n"),
    [version],
  );

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 1500);
      toast.success("Diagnostics copied");
    } catch {
      toast.error("Couldn't copy diagnostics");
    }
  };

  return (
    <SettingsStack>
      <SettingsSection title="About">
        <SettingsRow
          title="Mote Desktop"
          description="An unofficial Windows desktop controller for compatible Philips Hue devices. Mote Desktop is not affiliated with or endorsed by Signify."
        >
          <span className="rounded-lg bg-black/5 px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-[inset_0_1px_3px_rgb(0_0_0/0.14)] dark:bg-black/20 dark:shadow-[inset_0_1px_3px_rgb(0_0_0/0.45)]">
            Version {version}
          </span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Help and legal">
        <SettingsRow
          title="Send feedback"
          description="Report a bug, suggest a feature, or say what would make Mote better. Nothing is sent until you press Send, and an email address is only needed if you want a reply."
        >
          <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
            <Button
              variant="outline"
              className="bg-background shadow-none hover:bg-background/75"
              onClick={() => setFeedbackOpen(true)}
            >
              Send feedback
              <MessageSquareText data-icon="inline-end" />
            </Button>
          </FeedbackDialog>
        </SettingsRow>
        <SettingsRow
          title="Support"
          description="Setup help, troubleshooting, known requirements, and contact instructions."
        >
          <ExternalLinkButton label="Get support" href={PUBLIC_LINKS.support} />
        </SettingsRow>
        <SettingsRow
          title="Privacy"
          description="Mote stores bridge metadata locally and Hue credentials in the operating-system keychain. Version 1 does not include automatic analytics or crash uploads."
        >
          <ExternalLinkButton
            label="Privacy policy"
            href={PUBLIC_LINKS.privacy}
          />
        </SettingsRow>
        <SettingsRow
          title="Terms"
          description="Read the application license, acceptable-use, warranty, and third-party terms."
        >
          <ExternalLinkButton label="Terms of use" href={PUBLIC_LINKS.terms} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Diagnostics">
        <SettingsRow
          title="Copy app information"
          description="Copies only the product, version, platform, release channel, and telemetry status. It excludes Hue names, identifiers, addresses, credentials, and personal file paths."
        >
          <Button
            variant="outline"
            className="w-40 bg-background shadow-none hover:bg-background/75"
            onClick={() => void copyDiagnostics()}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy diagnostics"}
          </Button>
        </SettingsRow>
      </SettingsSection>
    </SettingsStack>
  );
};
