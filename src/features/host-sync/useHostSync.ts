import {
  describeCommandError,
  parseAuthorizationError,
} from "@/lib/entitlement-errors";
import { useProUpgrade } from "@/features/pro/proUpgrade";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import type {
  HostSyncOverview,
  HostSyncPreferences,
  HostSyncStatus,
  StartHostSyncRequest,
  UpdateHostSyncRequest,
} from "@/types/host-sync";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads the PC sync overview (credentials, displays, audio outputs, areas,
 * preferences) and exposes preference/session actions. Live lifecycle state
 * comes from `EntertainmentStore.pcStatus`, which follows `host-sync-status`
 * events.
 */
export const useHostSync = () => {
  const { requestPro } = useProUpgrade();
  const [overview, setOverview] = useState<HostSyncOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Failure applying a user action; cleared when the next action starts. */
  const [actionError, setActionError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const status = useEntertainmentStore((store) => store.pcStatus);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    return invoke<HostSyncOverview>("get-host-sync-overview")
      .then((next) => {
        if (!mounted.current) return;
        setOverview(next);
        setLoadError(null);
        useEntertainmentStore.getState().setPcStatus(next.status);
      })
      .catch((error) => {
        if (mounted.current) setLoadError(describeCommandError(error));
      })
      .finally(() => {
        if (mounted.current) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Persists a partial preference change on top of the loaded preferences. */
  const savePreferences = useCallback(
    async (update: Partial<HostSyncPreferences>) => {
      const current = overview?.preferences;
      if (!current) return;
      const next = { ...current, ...update };
      setOverview((existing) =>
        existing ? { ...existing, preferences: next } : existing,
      );
      try {
        await invoke("set-host-sync-preferences", { preferences: next });
      } catch (error) {
        setActionError(describeCommandError(error));
        void refresh();
      }
    },
    [overview?.preferences, refresh],
  );

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setIsUpdating(true);
      setActionError(null);
      try {
        await action();
        return true;
      } catch (error) {
        // A refusal because Pro is not owned opens the purchase dialog instead
        // of only writing a sentence nobody can act on. "Could not check" is
        // left as a message on purpose — offering to sell Pro to somebody who
        // already paid, because the Store was unreachable, is the worse
        // mistake, and the copy for that case says to retry.
        if (parseAuthorizationError(error)?.code === "pro_required") {
          requestPro("pc_sync");
        }
        setActionError(describeCommandError(error));
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [requestPro],
  );

  const start = useCallback(
    (request: StartHostSyncRequest) =>
      runAction(() => invoke<HostSyncStatus>("start-host-sync", { request })),
    [runAction],
  );

  const stop = useCallback(
    () => runAction(() => invoke<HostSyncStatus>("stop-host-sync")),
    [runAction],
  );

  /** Live brightness/intensity change; no-op errors when nothing runs. */
  const updateLive = useCallback(async (request: UpdateHostSyncRequest) => {
    try {
      await invoke<HostSyncStatus>("update-host-sync", { request });
    } catch {
      // The session ended between the UI event and the call; the persisted
      // preference still applies on the next start.
    }
  }, []);

  const provisionCredentials = useCallback(
    () =>
      runAction(async () => {
        await invoke("provision-host-sync-credentials");
        await refresh();
      }),
    [refresh, runAction],
  );

  return {
    overview,
    status,
    isLoading,
    isUpdating,
    loadError,
    actionError,
    refresh,
    savePreferences,
    start,
    stop,
    updateLive,
    provisionCredentials,
  };
};
