import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useEntitlements } from "@/context/EntitlementContext";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { useWidgets } from "@/features/widget-screen/useWidgets";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import type { HueRoomZone, HueSettingsSummary } from "@/types/hue";
import type { SyncBoxSession } from "@/types/sync-box";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  automationNavVariants,
  automationRuleInfo,
  useOpenAutomation,
} from "@/features/automations/useOpenAutomation";
import { useHue } from "../../context/HueContext";
import type { ThemeMode } from "../../context/ThemeContext";
import { AddBridgeButton } from "./components/AddBridgeButton";
import { AddDevicesButton } from "./components/AddDevicesButton";
import { AddEntertainmentAreaButton } from "./components/AddEntertainmentAreaButton";
import { AddSpaceButton } from "./components/AddSpaceButton";
import { AddWidgetButton } from "./components/AddWidgetButton";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { settingsTabs } from "./settingsTabs";
import { AboutSupportTab } from "./tabs/AboutSupportTab";
import {
  fetchAppSettings,
  getCachedAppSettings,
  rememberAppSettings,
} from "./appSettingsCache";
import { AutomationsTab } from "./tabs/AutomationsTab";
import { BridgeTab } from "./tabs/BridgeTab";
import { PcSyncTab } from "./tabs/PcSyncTab";
import { SyncBoxTab } from "./tabs/SyncBoxTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { EntertainmentAreasTab } from "./tabs/EntertainmentAreasTab";
import { GeneralTab } from "./tabs/GeneralTab";
import { ShortcutsTab } from "./tabs/ShortcutsTab";
import { ScenesTab } from "./tabs/ScenesTab";
import { SpacesTab } from "./tabs/SpacesTab";
import { WidgetTab } from "./tabs/WidgetTab";
import { ProTag } from "./components/ProTag";
import type {
  AppSettings,
  CloseButtonBehavior,
  DeleteableResourceType,
  RenameableResourceType,
} from "./types";
import { humanize } from "./utils/format";

interface SettingsScreenProps {
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  themeMode,
  onThemeModeChange,
}) => {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const {
    bridgeId,
    bridgeIp,
    connected,
    bridges,
    switchBridge,
    removeBridge,
    renameBridge,
    beginAddBridge,
  } = useHue();
  const lights = useHueResourcesStore((state) => state.lights);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const scenes = useHueResourcesStore((state) => state.scenes);
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const [summary, setSummary] = useState<HueSettingsSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [syncBoxSession, setSyncBoxSession] = useState<SyncBoxSession | null>(
    null,
  );
  const [isLoadingSyncBox, setIsLoadingSyncBox] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(
    getCachedAppSettings,
  );
  const [isLoadingAppSettings, setIsLoadingAppSettings] = useState(
    () => getCachedAppSettings() === null,
  );
  const [isSavingAppSettings, setIsSavingAppSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const {
    widgets,
    openWidget,
    closeWidget,
    removeWidget,
    setPinned: setWidgetPinned,
    setAlwaysOnTop: setWidgetAlwaysOnTop,
    setConfig: setWidgetConfig,
  } = useWidgets();
  const { hasPro } = useEntitlements();
  const { requestPro } = useProUpgrade();
  // Free holds one widget. Past it, adding one is the moment to offer Pro, so
  // the wizard never opens only for creation to be refused at the end.
  const widgetLimitReached = !hasPro && widgets.length > 0;

  // Surface a "scroll to top" affordance once the shared settings viewport has
  // been scrolled down past a threshold and still has room to scroll.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      setShowScrollTop(scrollTop > 240 && scrollHeight - clientHeight > 240);
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const scrollToTop = () => {
    viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeTab = settingsTabs.some((tab) => tab.value === search.tab)
    ? search.tab!
    : "general";
  const activeTabDetails =
    settingsTabs.find((tab) => tab.value === activeTab) ?? settingsTabs[0];
  const { automation, setAutomation } = useOpenAutomation();
  const openAutomation = activeTab === "automations" ? automation : null;
  const reduceMotion = useReducedMotion();
  // Forward into an automation, backward out of it; 0 is a plain crossfade.
  const headerDirection = reduceMotion ? 0 : openAutomation ? 1 : -1;
  // A detail view is much taller than the list, so land at the top of whichever
  // one just opened rather than partway down it.
  useEffect(() => {
    viewportRef.current?.scrollTo({ top: 0 });
  }, [openAutomation]);
  const loadSettingsSummary = async () => {
    setSettingsError(null);
    try {
      const nextSummary = await invoke<HueSettingsSummary>(
        "get-hue-settings-summary",
      );
      setSummary(nextSummary);
    } catch (error) {
      setSettingsError(String(error) || "Unable to load bridge settings.");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const loadAppSettings = async () => {
    try {
      setAppSettings(await fetchAppSettings());
    } catch (error) {
      setSettingsError(String(error) || "Unable to load app settings.");
    } finally {
      setIsLoadingAppSettings(false);
    }
  };

  const loadSyncBoxSession = async () => {
    try {
      const session = await invoke<SyncBoxSession>("get-sync-box-session");
      setSyncBoxSession(session);
    } catch (error) {
      setSettingsError(String(error) || "Unable to load Sync Box settings.");
    } finally {
      setIsLoadingSyncBox(false);
    }
  };

  const resetSyncBoxSession = async () => {
    try {
      await invoke("reset-sync-box-session");
      setSyncBoxSession({
        configured: false,
        connected: false,
        syncBox: null,
        error: null,
      });
      toast.success("Sync Box removed");
    } catch (error) {
      setSettingsError(String(error) || "Unable to remove Sync Box.");
    }
  };

  useEffect(() => {
    void loadAppSettings();
    void loadSyncBoxSession();
  }, []);

  // Re-fetch the bridge summary whenever the active bridge changes (including
  // the initial load) so Bridge Details always reflects the current bridge.
  useEffect(() => {
    setIsLoadingSummary(true);
    void loadSettingsSummary();
  }, [bridgeId]);

  const refreshSettings = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await Promise.all([loadAll(), loadSettingsSummary()]);
    setIsRefreshing(false);
  };

  const renameResource = async (
    resourceType: RenameableResourceType,
    id: string,
    name: string,
    archetype?: string,
  ) => {
    await invoke("rename-hue-resource", { resourceType, id, name, archetype });
    await refreshSettings();
    toast.success("Name updated");
  };

  const deleteResource = async (
    resourceType: DeleteableResourceType,
    id: string,
  ) => {
    await invoke("delete-hue-resource", { resourceType, id });
    await refreshSettings();
    toast.success(`${humanize(resourceType)} deleted`);
  };

  const updateMembers = async (roomZone: HueRoomZone, ids: string[]) => {
    if (roomZone.resourceType === "room") {
      await invoke("update-room-members", {
        roomId: roomZone.id,
        deviceIds: ids,
      });
    } else {
      await invoke("update-zone-members", {
        zoneId: roomZone.id,
        lightIds: ids,
      });
    }
    await refreshSettings();
    toast.success("Membership updated");
  };

  const createScene = async (name: string, space: HueRoomZone) => {
    setSettingsError(null);
    try {
      await invoke("create-hue-scene", {
        name,
        groupId: space.id,
        groupType: space.resourceType,
      });
      await refreshSettings();
      toast.success("Scene created from current light state");
    } catch (error) {
      setSettingsError(String(error) || "Unable to create scene.");
      throw error;
    }
  };

  const saveSwitchConfig = async (
    id: string,
    body: Record<string, unknown>,
  ) => {
    await invoke("set-switch-input-configuration", { id, body });
    await refreshSettings();
    toast.success("Switch input configuration updated");
  };

  const updateCloseButtonBehavior = async (behavior: CloseButtonBehavior) => {
    if (!appSettings || behavior === appSettings.closeButtonBehavior) return;
    setIsSavingAppSettings(true);
    setSettingsError(null);
    try {
      const nextSettings = await invoke<AppSettings>(
        "set-close-button-behavior",
        { behavior },
      );
      setAppSettings(rememberAppSettings(nextSettings));
      toast.success("General settings updated");
    } catch (error) {
      setSettingsError(String(error) || "Unable to update close behavior.");
    } finally {
      setIsSavingAppSettings(false);
    }
  };

  const updateAutoStart = async (enabled: boolean) => {
    if (!appSettings || enabled === appSettings.autoStart) return;
    setIsSavingAppSettings(true);
    setSettingsError(null);
    try {
      const nextSettings = await invoke<AppSettings>("set-auto-start", {
        enabled,
      });
      setAppSettings(rememberAppSettings(nextSettings));
      toast.success("General settings updated");
    } catch (error) {
      setSettingsError(String(error) || "Unable to update auto start.");
    } finally {
      setIsSavingAppSettings(false);
    }
  };

  const updateDesktopShortcut = async (enabled: boolean) => {
    if (!appSettings || enabled === appSettings.desktopShortcut) return;
    setIsSavingAppSettings(true);
    setSettingsError(null);
    try {
      const nextSettings = await invoke<AppSettings>("set-desktop-shortcut", {
        enabled,
      });
      setAppSettings(rememberAppSettings(nextSettings));
      toast.success("General settings updated");
    } catch (error) {
      setSettingsError(
        String(error) || "Unable to update the desktop shortcut.",
      );
    } finally {
      setIsSavingAppSettings(false);
    }
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={(tab) =>
        // Tabs are lateral within Settings — replace so Back exits Settings
        // rather than stepping back through every tab you visited.
        void navigate({ to: "/settings", search: { tab }, replace: true })
      }
      orientation="horizontal"
      className="@container flex min-h-0 w-full flex-1 flex-col gap-0"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <Card className="relative flex min-h-0 flex-1 flex-row overflow-hidden rounded-2xl border border-border p-0 shadow-none ring-0 dark:shadow-none">
          <SettingsSidebar
            activeTab={activeTab}
            onSelect={(tab) =>
              void navigate({ to: "/settings", search: { tab }, replace: true })
            }
          />
          <ScrollArea
            fade
            className="min-h-0 min-w-0 flex-1"
            // The bottom padding clears the floating scroll-to-top button (40px,
            // 16px off the edge), so the last row never ends up underneath it.
            viewportClassName="overflow-x-hidden pt-4 pr-4 pb-18 @2xl:pt-6 @2xl:pr-6"
            viewportRef={viewportRef}
          >
            <div className="mx-auto w-full max-w-3xl pt-8">
              <div className="flex flex-col items-start justify-between gap-4 pb-8 @2xl:flex-row @2xl:items-center @2xl:pb-10">
                {/* An open automation takes the page title, with a back button
                    beside it — the same shape as the app header one level up.
                    Both halves stack in one grid cell so the swap slides across
                    instead of collapsing the header for a frame. */}
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {openAutomation && (
                    <Button
                      variant="ghost"
                      size="icon"
                      // No negative margin: the viewport clips horizontally and has
                      // no left padding, so pulling it left cut the button off.
                      className="shrink-0"
                      aria-label="Back to automations"
                      onClick={() => setAutomation(null)}
                    >
                      <ArrowLeft />
                    </Button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="grid min-w-0">
                      <AnimatePresence
                        initial={false}
                        mode="sync"
                        custom={headerDirection}
                      >
                        <motion.div
                          key={openAutomation ?? "tab"}
                          className="col-start-1 row-start-1 min-w-0 space-y-2"
                          custom={headerDirection}
                          variants={automationNavVariants}
                          initial="initial"
                          animate="animate"
                          exit="exit"
                        >
                          <h1 className="flex items-center gap-2.5 font-heading text-2xl font-semibold tracking-tight">
                            {openAutomation
                              ? automationRuleInfo[openAutomation].title
                              : activeTabDetails.label}
                            {activeTabDetails.pro && <ProTag />}
                          </h1>
                          <p className="text-sm text-muted-foreground">
                            {openAutomation
                              ? automationRuleInfo[openAutomation].description
                              : activeTabDetails.description}
                          </p>
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    {settingsError && (
                      <p className="pt-2 text-sm text-(--destructive-text)">
                        {settingsError}
                      </p>
                    )}
                  </div>
                </div>
                {activeTab === "bridge" && (
                  <AddBridgeButton onClick={beginAddBridge} />
                )}
                {activeTab === "devices" && (
                  <AddDevicesButton
                    disabled={!summary?.deviceDiscoverySupported}
                    onClick={() =>
                      void navigate({ to: "/settings/device-discovery" })
                    }
                  />
                )}
                {activeTab === "spaces" && (
                  <AddSpaceButton
                    disabled={!connected}
                    onClick={() =>
                      void navigate({ to: "/settings/spaces-wizard" })
                    }
                  />
                )}
                {activeTab === "entertainment" && (
                  <AddEntertainmentAreaButton
                    disabled={!connected}
                    onClick={() =>
                      void navigate({
                        to: "/settings/entertainment-wizard",
                        search: { from: undefined },
                      })
                    }
                  />
                )}
                {activeTab === "widget" && (
                  <AddWidgetButton
                    // Tagged from the second widget on, trial included, and
                    // offering Pro only where Free actually stops.
                    pro={widgets.length > 0}
                    onClick={() =>
                      widgetLimitReached
                        ? requestPro("advanced_widgets")
                        : void navigate({ to: "/settings/widget-wizard" })
                    }
                  />
                )}
              </div>

              <TabsContent value="bridge">
                <BridgeTab
                  bridge={summary?.bridge}
                  connected={connected}
                  isLoadingSummary={isLoadingSummary}
                  fallbackBridgeId={bridgeId}
                  fallbackBridgeIp={bridgeIp}
                  bridges={bridges}
                  onSwitchBridge={switchBridge}
                  onRemoveBridge={removeBridge}
                  onRenameBridge={renameBridge}
                />
              </TabsContent>

              <TabsContent value="pc-sync">
                <PcSyncTab
                  onOpenSync={() =>
                    void navigate({
                      to: "/sync",
                      search: { source: undefined },
                    })
                  }
                />
              </TabsContent>

              <TabsContent value="sync-box">
                <SyncBoxTab
                  syncBox={syncBoxSession?.syncBox}
                  configured={syncBoxSession?.configured ?? false}
                  connected={syncBoxSession?.connected ?? false}
                  isLoadingSession={isLoadingSyncBox}
                  onSetUp={() =>
                    void navigate({
                      to: "/sync",
                      search: {
                        source: syncBoxSession?.configured ? undefined : "box",
                      },
                    })
                  }
                  onResetSession={resetSyncBoxSession}
                />
              </TabsContent>

              <TabsContent value="devices">
                <DevicesTab
                  summary={summary}
                  isLoadingSummary={isLoadingSummary}
                  lights={lights}
                  roomZones={roomZones}
                  onRename={renameResource}
                  onDelete={deleteResource}
                  onSaveSwitchConfig={saveSwitchConfig}
                  onRefresh={refreshSettings}
                />
              </TabsContent>

              <TabsContent value="spaces">
                <SpacesTab
                  lights={lights}
                  roomZones={roomZones}
                  devices={summary?.devices ?? []}
                  onRename={renameResource}
                  onDelete={deleteResource}
                  onUpdateMembers={updateMembers}
                />
              </TabsContent>

              <TabsContent value="entertainment">
                <EntertainmentAreasTab lights={lights} />
              </TabsContent>

              <TabsContent value="scenes">
                <ScenesTab
                  roomZones={roomZones}
                  scenes={scenes}
                  onRename={renameResource}
                  onDelete={deleteResource}
                  onCreateScene={createScene}
                />
              </TabsContent>

              <TabsContent value="general">
                <GeneralTab
                  themeMode={themeMode}
                  onThemeModeChange={onThemeModeChange}
                  appSettings={appSettings}
                  isLoadingAppSettings={isLoadingAppSettings}
                  isSavingAppSettings={isSavingAppSettings}
                  onUpdateCloseButtonBehavior={(behavior) =>
                    void updateCloseButtonBehavior(behavior)
                  }
                  onUpdateAutoStart={(enabled) => void updateAutoStart(enabled)}
                  onUpdateDesktopShortcut={(enabled) =>
                    void updateDesktopShortcut(enabled)
                  }
                />
              </TabsContent>

              <TabsContent value="shortcuts">
                <ShortcutsTab />
              </TabsContent>

              <TabsContent value="automations">
                <AutomationsTab />
              </TabsContent>

              <TabsContent value="widget">
                <WidgetTab
                  widgets={widgets}
                  focusedWidgetId={search.widgetId}
                  focusRequest={search.widgetRequest}
                  onReopen={(id) => void openWidget(id)}
                  onClose={(id) => void closeWidget(id)}
                  onRemove={removeWidget}
                  onSetPinned={(id, pinned) => void setWidgetPinned(id, pinned)}
                  onSetAlwaysOnTop={(id, alwaysOnTop) =>
                    void setWidgetAlwaysOnTop(id, alwaysOnTop)
                  }
                  onSetConfig={(id, config) => void setWidgetConfig(id, config)}
                />
              </TabsContent>

              <TabsContent value="about">
                <AboutSupportTab />
              </TabsContent>
            </div>
          </ScrollArea>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Scroll to top"
            onClick={scrollToTop}
            className={`absolute bottom-4 right-4 z-20 rounded-full shadow-md transition-all duration-200 ${
              showScrollTop
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-2 opacity-0"
            }`}
          >
            <ArrowUp />
          </Button>
        </Card>
      </div>
    </Tabs>
  );
};
