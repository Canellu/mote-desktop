import { invoke } from "@tauri-apps/api/core";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { mapFeatureEnabled } from "@/features/home-map/homeView";
import { homeMapStore } from "@/features/home-map/useHomeMapStore";

export interface HueSession {
  configured: boolean;
  connected: boolean;
  bridgeId: string | null;
  bridgeIp: string | null;
  error: string | null;
}

/** One paired bridge, for the switcher. `name` is the cached bridge name. */
export interface BridgeListItem {
  bridgeId: string;
  bridgeIp: string;
  name: string | null;
  active: boolean;
}

interface HueContextType extends HueSession {
  isLoading: boolean;
  /** Every paired bridge plus which one is active. */
  bridges: BridgeListItem[];
  refreshSession: () => Promise<void>;
  refreshBridges: () => Promise<void>;
  applySession: (session: HueSession) => void;
  resetSession: () => Promise<void>;
  /** Makes another paired bridge active: reloads resources and restreams. */
  switchBridge: (bridgeId: string) => Promise<void>;
  /** Removes a bridge and its credentials; promotes the next one if any. */
  removeBridge: (bridgeId: string) => Promise<void>;
  /** Renames the active bridge on the bridge itself. Returns the new name. */
  renameBridge: (name: string) => Promise<string>;
  /** True while the add-a-bridge wizard is being shown over the app. */
  isAddingBridge: boolean;
  beginAddBridge: () => void;
  cancelAddBridge: () => void;
}

const emptySession: HueSession = {
  configured: false,
  connected: false,
  bridgeId: null,
  bridgeIp: null,
  error: null,
};

const HueContext = createContext<HueContextType | undefined>(undefined);

interface HueProviderProps {
  children: ReactNode;
}

export const HueProvider: React.FC<HueProviderProps> = ({ children }) => {
  const [session, setSession] = useState<HueSession>(emptySession);
  const [isLoading, setIsLoading] = useState(true);
  const [bridges, setBridges] = useState<BridgeListItem[]>([]);
  const [isAddingBridge, setIsAddingBridge] = useState(false);

  const refreshBridges = useCallback(async () => {
    try {
      setBridges(await invoke<BridgeListItem[]>("list-hue-bridges"));
    } catch {
      // Non-fatal: the switcher just won't list bridges.
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextSession = await invoke<HueSession>("get-hue-session");
      setSession(nextSession);
    } catch (error) {
      setSession({
        ...emptySession,
        error: String(error),
      });
    } finally {
      setIsLoading(false);
    }
    void refreshBridges();
  }, [refreshBridges]);

  const applySession = useCallback(
    (nextSession: HueSession) => {
      setSession(nextSession);
      setIsLoading(false);
      void refreshBridges();
    },
    [refreshBridges],
  );

  const resetSession = useCallback(async () => {
    await invoke("reset-hue-session");
    setSession(emptySession);
    setBridges([]);
    setIsLoading(false);
  }, []);

  // Swaps which bridge the whole app operates on. The backend stops the old
  // event stream; we blank the resource cache so Home shows a loading state
  // rather than the previous bridge's data, reload, then restream.
  const switchBridge = useCallback(
    async (bridgeId: string) => {
      setIsLoading(true);
      try {
        // Any PC sync session streams to the current bridge; end it before the
        // active bridge changes out from under it.
        await invoke("stop-host-sync").catch(() => {});
        const nextSession = await invoke<HueSession>("set-active-hue-bridge", {
          bridgeId,
        });
        useHueResourcesStore.setState({ hasLoaded: false });
        if (nextSession.connected) {
          await useHueResourcesStore.getState().loadAll();
          await invoke("start-hue-events").catch(() => {});
        }
        setSession(nextSession);
        await refreshBridges();
      } finally {
        setIsLoading(false);
      }
    },
    [refreshBridges],
  );

  const removeBridge = useCallback(
    async (bridgeId: string) => {
      setIsLoading(true);
      try {
        await invoke("stop-host-sync").catch(() => {});
        const nextSession = await invoke<HueSession>("remove-hue-bridge", {
          bridgeId,
        });
        useHueResourcesStore.setState({ hasLoaded: false });
        if (nextSession.configured && nextSession.connected) {
          await useHueResourcesStore.getState().loadAll();
          await invoke("start-hue-events").catch(() => {});
        }
        setSession(nextSession);
        await refreshBridges();
      } finally {
        setIsLoading(false);
      }
    },
    [refreshBridges],
  );

  const renameBridge = useCallback(
    async (name: string) => {
      const renamed = await invoke<string>("rename-hue-bridge", { name });
      await useHueResourcesStore.getState().loadHomeName();
      await refreshBridges();
      return renamed;
    },
    [refreshBridges],
  );

  const beginAddBridge = useCallback(() => setIsAddingBridge(true), []);
  const cancelAddBridge = useCallback(() => setIsAddingBridge(false), []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    // Maps stay available offline; a bridge switch hides the previous selection
    // while its in-flight saves continue under the original bridge ID. A build
    // without the map has no reader for any of it, so it does not load.
    if (!mapFeatureEnabled) return;
    void homeMapStore
      .getState()
      .activateBridge(isLoading ? null : session.bridgeId);
  }, [isLoading, session.bridgeId]);

  return (
    <HueContext.Provider
      value={{
        ...session,
        isLoading,
        bridges,
        refreshSession,
        refreshBridges,
        applySession,
        resetSession,
        switchBridge,
        removeBridge,
        renameBridge,
        isAddingBridge,
        beginAddBridge,
        cancelAddBridge,
      }}
    >
      {children}
    </HueContext.Provider>
  );
};

export const useHue = () => {
  const context = useContext(HueContext);
  if (!context) {
    throw new Error("useHue must be used within a HueProvider");
  }
  return context;
};
