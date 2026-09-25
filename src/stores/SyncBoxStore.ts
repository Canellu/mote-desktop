import { openProUpgrade } from "@/features/pro/proUpgrade";
import { isPurchaseRequired } from "@/lib/entitlement-errors";
import type {
  StoredSyncBoxInfo,
  SyncBoxExecutionUpdate,
  SyncBoxMode,
  SyncBoxSession,
  SyncBoxState,
} from "@/types/sync-box";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

interface SyncBoxStore {
  /** Every paired box and the one the Sync screens control. */
  session: SyncBoxSession | null;
  sessionLoading: boolean;
  /** Re-reads the saved boxes and checks the active one. */
  loadSession: () => Promise<SyncBoxSession | null>;
  /** Takes a session a pairing just returned. */
  setSession: (session: SyncBoxSession) => void;
  /**
   * Makes another saved box the active one. A box that is not active is Mote
   * Pro, so a refusal opens the offer instead of failing.
   */
  selectBox: (uniqueId: string) => Promise<void>;
  removeBox: (uniqueId: string) => Promise<void>;
  state: SyncBoxState | null;
  /**
   * Failure applying a user action (start/stop/settings). Persists until the
   * next action starts — the background poll must not wipe it before the user
   * can read it.
   */
  error: string | null;
  /** Failure reading the box state; cleared by the next successful poll. */
  loadError: string | null;
  isLoading: boolean;
  isUpdating: boolean;
  /**
   * Member light ids per entertainment area, keyed by every known alias
   * (v2 UUID, v1 id, box group id). Sync-locked light derivation lives in
   * `EntertainmentStore`; this map only feeds the box screen's area tiles.
   */
  areaLightIds: Record<string, string[]>;
  refresh: () => Promise<void>;
  loadAreaLights: () => Promise<void>;
  updateExecution: (update: SyncBoxExecutionUpdate) => Promise<void>;
  updateMode: (mode: SyncBoxMode) => Promise<void>;
  /**
   * Starts light sync on `areaId`, taking over the bridge's entertainment
   * stream first when another app owns it. The box never steals the stream on
   * its own — it just fails with "invalid state" — so this stops the active
   * stream through the bridge (like the official apps do) and waits for the
   * box to notice before starting.
   */
  startSync: (areaId: string) => Promise<void>;
  clear: () => void;
}

let refreshInFlight: Promise<void> | null = null;

let sessionInFlight: Promise<SyncBoxSession | null> | null = null;

/** Boxes on `bridgeId`, plus any whose bridge is not known yet. */
export const boxesForBridge = (
  session: SyncBoxSession | null,
  bridgeId: string | null,
): StoredSyncBoxInfo[] =>
  (session?.syncBoxes ?? []).filter(
    (syncBox) =>
      !bridgeId ||
      !syncBox.bridgeUniqueId ||
      syncBox.bridgeUniqueId.toLowerCase() === bridgeId.toLowerCase(),
  );

export const useSyncBoxStore = create<SyncBoxStore>((set, get) => ({
  session: null,
  sessionLoading: true,
  loadSession: () => {
    if (sessionInFlight) return sessionInFlight;
    sessionInFlight = invoke<SyncBoxSession>("get-sync-box-session")
      .then((session) => {
        get().setSession(session);
        return session;
      })
      .catch(() => null)
      .finally(() => {
        sessionInFlight = null;
        set({ sessionLoading: false });
      });
    return sessionInFlight;
  },
  setSession: (session) => {
    const previous = get().session?.syncBox?.uniqueId;
    // Another box's state must not show under this one's name, even briefly.
    if (previous !== session.syncBox?.uniqueId) get().clear();
    set({ session, sessionLoading: false });
  },
  selectBox: async (uniqueId) => {
    if (get().session?.syncBox?.uniqueId === uniqueId) return;
    try {
      get().setSession(
        await invoke<SyncBoxSession>("set-active-sync-box", { uniqueId }),
      );
      void get()
        .refresh()
        .then(() => get().loadAreaLights());
    } catch (error) {
      if (isPurchaseRequired(error)) {
        openProUpgrade("multiple_sync_boxes");
        return;
      }
      set({ error: String(error) });
    }
  },
  removeBox: async (uniqueId) => {
    get().setSession(
      await invoke<SyncBoxSession>("remove-sync-box", { uniqueId }),
    );
  },
  state: null,
  error: null,
  loadError: null,
  isLoading: false,
  isUpdating: false,
  areaLightIds: {},
  refresh: () => {
    if (refreshInFlight) return refreshInFlight;
    set((current) => ({ isLoading: current.state == null }));
    const boxId = get().session?.syncBox?.uniqueId;
    // A read that started before a switch belongs to the previous box.
    const current = () => get().session?.syncBox?.uniqueId === boxId;
    refreshInFlight = invoke<SyncBoxState>("get-sync-box-state")
      .then((state) => {
        if (current()) set({ state, loadError: null });
      })
      .catch((error) => {
        if (current()) set({ loadError: String(error) });
      })
      .finally(() => {
        refreshInFlight = null;
        set({ isLoading: false });
      });
    return refreshInFlight;
  },
  loadAreaLights: async () => {
    type Ref = { rid?: string; rtype?: string };
    type Configuration = {
      id?: string;
      id_v1?: string;
      name?: string;
      metadata?: { name?: string };
      light_services?: Ref[];
      locations?: { service_locations?: { service?: Ref }[] };
      channels?: { members?: { service?: Ref }[] }[];
    };
    type Entertainment = {
      id?: string;
      renderer_reference?: Ref;
    };
    try {
      const [configurations, services] = await Promise.all([
        invoke<Configuration[]>("get-hue-resource", {
          resourceType: "entertainment_configuration",
          id: null,
        }),
        invoke<Entertainment[]>("get-hue-resource", {
          resourceType: "entertainment",
          id: null,
        }),
      ]);
      const lightByService = new Map(
        services.flatMap((service) =>
          service.id &&
          service.renderer_reference?.rtype === "light" &&
          service.renderer_reference.rid
            ? [[service.id, service.renderer_reference.rid] as const]
            : [],
        ),
      );
      const syncGroups: SyncBoxState["hue"]["groups"] =
        get().state?.hue.groups ?? {};
      const entries: [string, string[]][] = [];
      for (const configuration of configurations) {
        if (!configuration.id) continue;
        const direct = (configuration.light_services ?? []).flatMap(
          (reference) =>
            reference.rtype === "light" && reference.rid ? [reference.rid] : [],
        );
        const resolved = (
          configuration.locations?.service_locations ?? []
        ).flatMap(({ service }) => {
          if (!service?.rid) return [];
          if (service.rtype === "light") return [service.rid];
          const lightId = lightByService.get(service.rid);
          return lightId ? [lightId] : [];
        });
        const channelLights = (configuration.channels ?? []).flatMap(
          (channel) =>
            (channel.members ?? []).flatMap(({ service }) => {
              if (!service?.rid) return [];
              if (service.rtype === "light") return [service.rid];
              const lightId = lightByService.get(service.rid);
              return lightId ? [lightId] : [];
            }),
        );
        const lightIds = [
          ...new Set([...direct, ...resolved, ...channelLights]),
        ];
        const aliases = new Set([configuration.id]);
        if (configuration.id_v1) {
          aliases.add(configuration.id_v1);
          const v1Id = configuration.id_v1.match(/\/groups\/([^/]+)$/)?.[1];
          if (v1Id) aliases.add(v1Id);
        }
        const configurationName = (
          configuration.metadata?.name ??
          configuration.name ??
          ""
        )
          .trim()
          .toLocaleLowerCase();
        for (const [groupId, group] of Object.entries(syncGroups)) {
          if (
            configurationName &&
            group.name.trim().toLocaleLowerCase() === configurationName
          ) {
            aliases.add(groupId);
          }
        }
        aliases.forEach((alias) => entries.push([alias, lightIds]));
      }
      set({ areaLightIds: Object.fromEntries(entries) });
    } catch {
      set({ areaLightIds: {} });
    }
  },
  updateExecution: async (update) => {
    set({ isUpdating: true, error: null });
    try {
      const state = await invoke<SyncBoxState>("set-sync-box-execution", {
        update,
      });
      set({ state });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isUpdating: false });
    }
  },
  updateMode: async (mode) => {
    set({ isUpdating: true, error: null });
    try {
      const current = get().state;
      if (!current) throw new Error("Sync Box state is unavailable.");
      const state = current.execution.syncActive
        ? await invoke<SyncBoxState>("set-sync-box-execution", {
            update: { mode },
          })
        : await invoke<SyncBoxState>("set-sync-box-source-mode", {
            source: current.execution.hdmiSource,
            mode,
          });
      set({ state });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isUpdating: false });
    }
  },
  startSync: async (areaId) => {
    set({ isUpdating: true, error: null });
    try {
      const boxState = get().state;
      const conflict =
        boxState != null &&
        (boxState.hue.connectionState === "busy" ||
          Object.entries(boxState.hue.groups).some(
            ([id, group]) =>
              group.active &&
              !(
                boxState.execution.syncActive &&
                boxState.execution.hueTarget === id
              ),
          ));
      if (conflict) {
        // Stop whatever is streaming through the bridge (we're paired with it
        // too), since the box can't free the bridge itself.
        type Configuration = { id?: string; status?: string };
        const configurations = await invoke<Configuration[]>(
          "get-hue-resource",
          { resourceType: "entertainment_configuration", id: null },
        );
        for (const configuration of configurations) {
          if (configuration.status === "active" && configuration.id) {
            await invoke("update-hue-resource", {
              resourceType: "entertainment_configuration",
              id: configuration.id,
              body: { action: "stop" },
            });
          }
        }
        // The box only learns the bridge is free on its own poll; starting
        // while it still reports "busy" fails with the same invalid-state
        // error the takeover is meant to avoid.
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          await get().refresh();
          if (get().state?.hue.connectionState !== "busy") break;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      let state = get().state;
      if (state?.execution.hueTarget !== areaId) {
        state = await invoke<SyncBoxState>("set-sync-box-execution", {
          update: { hueTarget: areaId },
        });
      }
      if (!state?.execution.hdmiActive) {
        state = await invoke<SyncBoxState>("set-sync-box-execution", {
          update: { hdmiActive: true },
        });
      }
      state = await invoke<SyncBoxState>("set-sync-box-execution", {
        update: { syncActive: true },
      });
      set({ state });
    } catch (error) {
      set({ error: String(error) });
    } finally {
      set({ isUpdating: false });
    }
  },
  clear: () =>
    set({
      state: null,
      error: null,
      loadError: null,
      isLoading: false,
      areaLightIds: {},
    }),
}));
