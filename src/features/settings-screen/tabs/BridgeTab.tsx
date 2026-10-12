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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { BridgeListItem } from "@/context/HueContext";
import { cn } from "@/lib/utils";
import type { HueSettingsBridge } from "@/types/hue";
import {
  ArrowLeftRight,
  Check,
  Loader2,
  Pencil,
  Power,
  RefreshCw,
  Router,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { MetaRow } from "../components/MetaRow";
import { Panel } from "../components/Panel";

export const BridgeTab = ({
  bridge,
  connected,
  isLoadingSummary,
  fallbackBridgeId,
  fallbackBridgeIp,
  bridges,
  onSwitchBridge,
  onRemoveBridge,
  onRenameBridge,
  isRefreshing,
  onRefresh,
}: {
  bridge: HueSettingsBridge | undefined;
  connected: boolean;
  isLoadingSummary: boolean;
  fallbackBridgeId: string | null | undefined;
  fallbackBridgeIp: string | null | undefined;
  bridges: BridgeListItem[];
  onSwitchBridge: (bridgeId: string) => void | Promise<void>;
  onRemoveBridge: (bridgeId: string) => void | Promise<void>;
  onRenameBridge: (name: string) => Promise<string>;
  isRefreshing: boolean;
  onRefresh: () => void;
}) => (
  <div className="space-y-10">
    <BridgeHeader
      connected={connected}
      productName={bridge?.productName}
      isLoading={isLoadingSummary && !isRefreshing}
      isRefreshing={isRefreshing}
      onRefresh={onRefresh}
    />

    <Panel title="Bridges">
      <p className="mb-3 text-sm text-muted-foreground">
        Switch between paired bridges, rename the active one, or pair another.
      </p>
      <div className="flex flex-col gap-1">
        {bridges.map((item) => (
          <BridgeRow
            key={item.bridgeId}
            bridge={item}
            canRemove={bridges.length > 1 || item.active}
            onSwitch={() => void onSwitchBridge(item.bridgeId)}
            onRemove={() => void onRemoveBridge(item.bridgeId)}
            onRename={onRenameBridge}
          />
        ))}
      </div>
    </Panel>

    <Panel title="Bridge Details">
      <div className="grid gap-0.5 text-sm">
        <MetaRow label="Name" value={bridge?.name} />
        <MetaRow
          label="Bridge ID"
          value={bridge?.bridgeId ?? fallbackBridgeId}
        />
        <MetaRow
          label="IP address"
          value={bridge?.bridgeIp ?? fallbackBridgeIp}
        />
        <MetaRow label="Product" value={bridge?.productName} />
        <MetaRow label="Model ID" value={bridge?.modelId} />
        <MetaRow label="Firmware" value={bridge?.swVersion} />
        <Separator className="my-1" />
        <MetaRow
          label="Application key"
          value={bridge?.applicationKeySaved ? "Saved securely" : undefined}
        />
      </div>
    </Panel>
  </div>
);

/** A stable label for a bridge that hasn't cached its name yet. */
const bridgeItemLabel = (bridge: BridgeListItem) =>
  bridge.name ?? `Bridge ${bridge.bridgeId.slice(-4).toUpperCase()}`;

/**
 * One row in the Bridges panel. The active bridge can be renamed inline (the
 * name is written to the bridge itself); others show a Switch action. Every
 * bridge can be removed, with a confirmation.
 */
const BridgeRow = ({
  bridge,
  canRemove,
  onSwitch,
  onRemove,
  onRename,
}: {
  bridge: BridgeListItem;
  canRemove: boolean;
  onSwitch: () => void;
  onRemove: () => void;
  onRename: (name: string) => Promise<string>;
}) => {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(bridge.name ?? "");
  const [busy, setBusy] = useState(false);

  const startRename = () => {
    setDraft(bridge.name ?? "");
    setRenaming(true);
  };

  const commitRename = async () => {
    const next = draft.trim();
    if (!next || next === bridge.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setRenaming(false);
    } catch (error) {
      toast.error(String(error) || "Couldn't rename the bridge.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          bridge.active
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Router size={18} />
      </span>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <Input
            autoFocus
            value={draft}
            maxLength={32}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename();
              if (event.key === "Escape") setRenaming(false);
            }}
            aria-label="Bridge name"
            className="h-8"
          />
        ) : (
          <>
            <p className="truncate font-medium">{bridgeItemLabel(bridge)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {bridge.active ? "Active" : bridge.bridgeIp}
            </p>
          </>
        )}
      </div>

      {renaming ? (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel rename"
            disabled={busy}
            onClick={() => setRenaming(false)}
          >
            <X size={16} />
          </Button>
          <Button
            size="icon"
            aria-label="Save name"
            disabled={busy}
            onClick={() => void commitRename()}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {bridge.active ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Rename bridge"
              onClick={startRename}
            >
              <Pencil size={16} />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onSwitch}
            >
              <ArrowLeftRight size={15} />
              Switch
            </Button>
          )}
          {canRemove && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove bridge"
                    className="text-muted-foreground hover:text-(--destructive-text)"
                  />
                }
              >
                <Trash2 size={16} />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Remove {bridgeItemLabel(bridge)}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the bridge and its credentials (including the
                    application key) from this device. Your lights and scenes on
                    the bridge itself are untouched, but you'll need to pair
                    again to control them from here.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel size="xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    size="xl"
                    className="gap-2"
                    onClick={onRemove}
                  >
                    <Power size={18} />
                    Remove bridge
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * The bridge and its connection. Refresh is a fallback: Mote resyncs on its
 * own, so it sits here rather than on Home.
 */
const BridgeHeader = ({
  connected,
  productName,
  isLoading,
  isRefreshing,
  onRefresh,
}: {
  connected: boolean;
  productName: string | null | undefined;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}) => (
  <div className="flex items-center gap-3">
    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Router size={20} />
    </span>
    <div className="min-w-0 flex-1">
      <p className="font-medium">{productName ?? "Hue Bridge"}</p>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span
          className={cn(
            "size-2 rounded-full",
            connected ? "bg-green-500" : "bg-destructive",
          )}
        />
        {connected ? "Connected" : "Disconnected"}
      </p>
    </div>
    {isLoading && (
      <Loader2 size={18} className="animate-spin text-muted-foreground" />
    )}
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={isRefreshing}
      title="Reload every light, room and zone from the bridge"
      onClick={onRefresh}
    >
      <RefreshCw size={15} className={cn(isRefreshing && "animate-spin")} />
      Refresh
    </Button>
  </div>
);
