import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SceneLightEditor } from "@/features/settings-screen/components/SceneLightEditor";
import {
  buildSceneBody,
  sceneLightAction,
  sceneLightDraft,
  type SceneLightDraft,
} from "@/features/settings-screen/sceneDraft";
import { ScenePreviewSession } from "@/features/settings-screen/scenePreview";
import { useEntertainmentStore } from "@/stores/EntertainmentStore";
import { useHueResourcesStore } from "@/stores/HueResourcesStore";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Eye, Loader2, Palette } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";

export const CreateSceneRoute = () => {
  const navigate = useNavigate();
  const lights = useHueResourcesStore((state) => state.lights);
  const roomZones = useHueResourcesStore((state) => state.roomZones);
  const syncedLightIds = useEntertainmentStore((state) => state.syncedLightIds);
  const loadAll = useHueResourcesStore((state) => state.loadAll);
  const [name, setName] = useState("");
  const [chosenSpaceId, setChosenSpaceId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SceneLightDraft>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewSession = useRef<ScenePreviewSession | null>(null);
  const previewRestore = useRef<Promise<void> | null>(null);
  const draftSpaceId = useRef<string | null>(null);
  const eligibleSpaces = useMemo(() => {
    const lightIds = new Set(lights.map((light) => light.id));
    return roomZones.filter((item) =>
      item.lightIds.some((id) => lightIds.has(id)),
    );
  }, [lights, roomZones]);
  const space =
    eligibleSpaces.find((item) => item.id === chosenSpaceId) ??
    eligibleSpaces[0];
  const selectedSpaceId = space?.id ?? null;
  const spaceLights = useMemo(
    () =>
      space ? lights.filter((light) => space.lightIds.includes(light.id)) : [],
    [lights, space],
  );
  const previewSyncBlocked = spaceLights.some((light) =>
    syncedLightIds.includes(light.id),
  );
  useEffect(() => {
    if (!space || draftSpaceId.current === space.id) return;
    draftSpaceId.current = space.id;
    setDrafts(
      Object.fromEntries(
        spaceLights.map((light) => [light.id, sceneLightDraft(light)]),
      ),
    );
  }, [space, spaceLights]);
  const items = useMemo(
    () =>
      Object.fromEntries(
        eligibleSpaces.map((item) => [
          item.id,
          `${item.resourceType === "room" ? "Room" : "Zone"} · ${item.name}`,
        ]),
      ),
    [eligibleSpaces],
  );
  const endPreview = useCallback((): Promise<void> => {
    if (previewRestore.current) return previewRestore.current;
    const session = previewSession.current;
    if (!session) return Promise.resolve();
    previewSession.current = null;
    setPreviewActive(false);
    setPreviewBusy(true);
    const restore = session
      .restore()
      .catch(() => session.restore())
      .then(() =>
        useHueResourcesStore
          .getState()
          .loadLights()
          .catch(() => undefined),
      )
      .catch((failure) => {
        const message = String(failure) || "Unable to restore the lights.";
        setPreviewError(message);
        toast.error(`Could not restore lights after preview: ${message}`);
      })
      .finally(() => {
        previewRestore.current = null;
        setPreviewBusy(false);
      });
    previewRestore.current = restore;
    return restore;
  }, []);

  useEffect(() => {
    const session = previewSession.current;
    if (!previewActive || !session) return;
    const timer = window.setTimeout(() => {
      void session.apply(drafts).catch((failure) => {
        if (previewSession.current !== session) return;
        const message = String(failure) || "Unable to preview this scene.";
        setPreviewError(message);
        toast.error(`Could not preview scene: ${message}`);
        void endPreview();
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [drafts, endPreview, previewActive]);

  useEffect(() => {
    if (previewActive && previewSyncBlocked) void endPreview();
  }, [endPreview, previewActive, previewSyncBlocked]);

  useEffect(
    () => () => {
      void previewSession.current?.restore().catch((failure) => {
        toast.error(
          `Could not restore lights after preview: ${String(failure)}`,
        );
      });
    },
    [],
  );

  const togglePreview = (on: boolean) => {
    setPreviewError(null);
    if (!on) {
      void endPreview();
      return;
    }
    if (!space || spaceLights.length === 0 || previewBusy || previewSyncBlocked)
      return;
    previewSession.current = new ScenePreviewSession(
      spaceLights,
      (light, draft) =>
        invoke("update-hue-resource", {
          resourceType: "light",
          id: light.id,
          body: sceneLightAction(light, draft),
        }),
    );
    setPreviewActive(true);
  };
  const details = (
    <section
      aria-label="Scene details"
      className="grid gap-4 rounded-2xl bg-(--settings-surface) p-5 min-[520px]:grid-cols-2 min-[520px]:items-end"
    >
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="scene-name">Scene name</Label>
        <Input
          id="scene-name"
          size="lg"
          className="h-11"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter scene name"
          disabled={isSaving}
        />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="scene-space">Room or zone</Label>
        <Select
          items={items}
          value={selectedSpaceId}
          onValueChange={(value) => {
            void endPreview().then(() => {
              const selected = eligibleSpaces.find((item) => item.id === value);
              const currentLights = useHueResourcesStore.getState().lights;
              draftSpaceId.current = selected?.id ?? null;
              setChosenSpaceId(value as string | null);
              setError(null);
              setDrafts(
                Object.fromEntries(
                  currentLights
                    .filter((light) => selected?.lightIds.includes(light.id))
                    .map((light) => [light.id, sceneLightDraft(light)]),
                ),
              );
            });
          }}
          disabled={isSaving || previewBusy}
        >
          <SelectTrigger id="scene-space" className="w-full">
            <SelectValue placeholder="Choose a space" />
          </SelectTrigger>
          <SelectContent>
            {eligibleSpaces.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.resourceType === "room" ? "Room" : "Zone"} · {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && (
        <p
          role="alert"
          className="col-span-full text-sm text-(--destructive-text)"
        >
          {error}
        </p>
      )}
      {previewSyncBlocked && (
        <p className="col-span-full text-xs text-muted-foreground">
          Stop light sync to preview this scene.
        </p>
      )}
      {previewError && (
        <p
          role="alert"
          className="col-span-full text-sm text-(--destructive-text)"
        >
          {previewError}
        </p>
      )}
    </section>
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !space || spaceLights.length === 0 || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await invoke("create-hue-resource", {
        resourceType: "scene",
        body: buildSceneBody(trimmed, space, lights, drafts),
      });
      await endPreview();
      try {
        await loadAll();
      } catch {
        toast.error("Scene saved, but the scene list could not refresh.");
      }
      toast.success("Scene created");
      void navigate({ to: "/settings", search: { tab: "scenes" } });
    } catch (failure) {
      setError(String(failure) || "Unable to create scene.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className="flex min-h-full w-full flex-1 flex-col gap-4 py-6"
      onSubmit={(event) => void save(event)}
    >
      <div className="mx-auto flex min-h-[520px] w-full max-w-2xl flex-1 flex-col gap-2 px-6 sm:px-12">
        {details}
        {space && spaceLights.length > 0 ? (
          <SceneLightEditor
            key={space.id}
            space={space}
            lights={spaceLights}
            drafts={drafts}
            onChangeMany={(changes) =>
              setDrafts((current) => ({ ...current, ...changes }))
            }
            disabled={isSaving}
            headerEnd={
              <Button
                type="button"
                size="sm"
                variant={previewActive ? "default" : "outline"}
                aria-pressed={previewActive}
                disabled={
                  spaceLights.length === 0 ||
                  previewBusy ||
                  previewSyncBlocked ||
                  isSaving
                }
                onClick={() => togglePreview(!previewActive)}
              >
                <Eye />
                Preview
              </Button>
            }
          />
        ) : (
          <section className="flex min-h-80 min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-(--settings-surface) p-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Palette size={26} />
            </span>
            <h2 className="font-heading text-base font-semibold">
              No rooms or zones with lights
            </h2>
            <p className="max-w-64 text-sm text-muted-foreground">
              Add lights to a room or zone to create a scene.
            </p>
          </section>
        )}
      </div>
      <footer className="w-full shrink-0 border-t border-border pt-4">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-6 sm:px-12">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void endPreview().then(() =>
                navigate({ to: "/settings", search: { tab: "scenes" } }),
              );
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              !name.trim() || !space || spaceLights.length === 0 || isSaving
            }
          >
            {isSaving && <Loader2 className="animate-spin" />}
            Save scene
          </Button>
        </div>
      </footer>
    </form>
  );
};
