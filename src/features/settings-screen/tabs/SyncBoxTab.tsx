import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { cn } from "@/lib/utils";
import { useSyncBoxStore } from "@/stores/SyncBoxStore";
import type { StoredSyncBoxInfo, SyncBoxSession } from "@/types/sync-box";
import { Cable, Loader2, Plus, Power, Tv } from "lucide-react";
import { MetaRow } from "../components/MetaRow";
import { Panel } from "../components/Panel";

export const SyncBoxTab = ({
  session,
  isLoadingSession,
  onAdd,
  onOpenControls,
  onRemove,
}: {
  session: SyncBoxSession | null;
  isLoadingSession: boolean;
  onAdd: () => void;
  onOpenControls: () => void;
  onRemove: (uniqueId: string) => void | Promise<void>;
}) => {
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  const selectBox = useSyncBoxStore((store) => store.selectBox);
  const boxes = session?.syncBoxes ?? [];
  const activeId = session?.syncBox?.uniqueId;

  // Nothing paired yet: mirror the Sync Box screen's empty state with a prompt
  // to run the onboarding wizard instead of an all-"Unknown" details table.
  if (boxes.length === 0 && !isLoadingSession) {
    return (
      <div>
        <Panel title="Sync Box Details">
          <div className="flex flex-col items-center gap-4 py-7 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Tv size={24} />
            </span>
            <div className="space-y-1">
              <p className="font-medium">No Sync Box connected</p>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                Pair your Hue Play HDMI Sync Box to control entertainment
                lighting from here.
              </p>
            </div>
            <Button className="gap-2" onClick={onAdd}>
              <Cable size={16} />
              Set up Sync Box
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  // A second box is Mote Pro. The paywall says so rather than a pairing that
  // fails after the customer has pressed the button on the box.
  const addBox = () => {
    if (!hasPro && boxes.length > 0) {
      requestPro("multiple_sync_boxes");
      return;
    }
    onAdd();
  };

  return (
    <div className="space-y-10">
      {boxes.map((syncBox) => {
        const active = syncBox.uniqueId === activeId;
        return (
          <SyncBoxPanel
            key={syncBox.uniqueId}
            syncBox={syncBox}
            active={active}
            connected={active ? (session?.connected ?? false) : null}
            isLoading={active && isLoadingSession}
            onOpenControls={async () => {
              await selectBox(syncBox.uniqueId);
              if (
                useSyncBoxStore.getState().session?.syncBox?.uniqueId ===
                syncBox.uniqueId
              ) {
                onOpenControls();
              }
            }}
            onRemove={() => onRemove(syncBox.uniqueId)}
          />
        );
      })}

      <div className="flex justify-end">
        <Button variant="outline" className="gap-2" onClick={addBox}>
          <Plus size={16} />
          Add Sync Box
        </Button>
      </div>
    </div>
  );
};

const SyncBoxPanel = ({
  syncBox,
  active,
  connected,
  isLoading,
  onOpenControls,
  onRemove,
}: {
  syncBox: StoredSyncBoxInfo;
  active: boolean;
  /** Only the active box is checked, so the others have no answer. */
  connected: boolean | null;
  isLoading: boolean;
  onOpenControls: () => void;
  onRemove: () => void | Promise<void>;
}) => (
  <Panel title={syncBox.name}>
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Tv size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          Hue Play HDMI Sync Box
          {active && <Badge variant="secondary">Active</Badge>}
        </p>
        {connected != null && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                connected ? "bg-green-500" : "bg-destructive",
              )}
            />
            {connected ? "Connected" : "Disconnected"}
          </p>
        )}
      </div>
      {isLoading && (
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      )}
    </div>

    <div className="mt-5 grid gap-0.5 text-sm">
      <MetaRow label="Unique ID" value={syncBox.uniqueId} />
      <MetaRow label="IP address" value={syncBox.ipAddress} />
      <MetaRow label="Device type" value={syncBox.deviceType} />
      <MetaRow label="Firmware" value={syncBox.firmwareVersion} />
      <MetaRow label="API level" value={String(syncBox.apiLevel)} />
    </div>

    <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-5">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              className="gap-2 text-(--destructive-text)"
            />
          }
        >
          <Power size={16} />
          Remove
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {syncBox.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved Sync Box and its credentials from this
              device. The Sync Box itself is untouched, but you'll need to pair
              again to control it from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="xl"
              className="gap-2"
              onClick={() => void onRemove()}
            >
              <Power size={18} />
              Remove Sync Box
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button className="gap-2" onClick={onOpenControls}>
        <Tv size={16} />
        Open controls
      </Button>
    </div>
  </Panel>
);
