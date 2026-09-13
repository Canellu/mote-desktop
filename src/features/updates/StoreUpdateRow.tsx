import { Button } from "@/components/ui/button";
import { SettingsRow } from "@/features/settings-screen/components/SettingsList";
import { useEffect, useState } from "react";
import { useStoreUpdate } from "./useStoreUpdate";
import { UpdateDialog } from "./UpdateButton";

/**
 * Settings entry point, so an update dismissed from the title bar is still one
 * click away. Hidden outside a Microsoft Store install, where there is nothing
 * to check.
 */
export const StoreUpdateRow = () => {
  const { status, installing, install, recheck } = useStoreUpdate();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  // Settings can open before the provider's first scheduled check.
  useEffect(() => {
    void recheck();
  }, [recheck]);

  if (!status.supported) return null;

  return (
    <SettingsRow
      title="Updates"
      description={
        status.available
          ? "A newer version is ready in the Microsoft Store."
          : "Mote Desktop is up to date. The Microsoft Store also installs updates on its own."
      }
    >
      {status.available ? (
        <Button disabled={installing} onClick={() => setOpen(true)}>
          {installing ? "Updating…" : "Install update"}
        </Button>
      ) : (
        <Button
          variant="outline"
          className="bg-background shadow-none hover:bg-background/75"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await recheck();
            setChecking(false);
          }}
        >
          {checking ? "Checking…" : "Check for updates"}
        </Button>
      )}
      <UpdateDialog
        open={open}
        onOpenChange={setOpen}
        mandatory={status.mandatory}
        onInstall={() => {
          setOpen(false);
          void install();
        }}
      />
    </SettingsRow>
  );
};
