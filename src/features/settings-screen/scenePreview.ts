import type { HueLight } from "@/types/hue";
import { sceneLightDraft, type SceneLightDraft } from "./sceneDraft";

type WriteLight = (light: HueLight, draft: SceneLightDraft) => Promise<void>;

const sameDraft = (a: SceneLightDraft, b: SceneLightDraft) =>
  a.on === b.on &&
  a.brightness === b.brightness &&
  a.mirek === b.mirek &&
  a.xy?.[0] === b.xy?.[0] &&
  a.xy?.[1] === b.xy?.[1];

/** Serializes preview writes so restoring cannot race a newer wheel edit. */
export class ScenePreviewSession {
  private readonly original: Record<string, SceneLightDraft>;
  private readonly applied: Record<string, SceneLightDraft>;
  private readonly touched = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private restoreTask: Promise<void> | null = null;
  private revision = 0;
  private lastWriteAt = 0;

  constructor(
    private readonly lights: HueLight[],
    private readonly writeLight: WriteLight,
    private readonly minimumWriteGapMs = 110,
  ) {
    this.original = Object.fromEntries(
      lights.map((light) => [light.id, sceneLightDraft(light)]),
    );
    this.applied = { ...this.original };
  }

  apply(drafts: Record<string, SceneLightDraft>): Promise<void> {
    if (this.restoreTask) return this.restoreTask;
    return this.enqueue(drafts, false);
  }

  restore(): Promise<void> {
    if (this.restoreTask) return this.restoreTask;
    const task = this.enqueue(this.original, true).finally(() => {
      if (this.restoreTask === task) this.restoreTask = null;
    });
    this.restoreTask = task;
    return this.restoreTask;
  }

  private enqueue(
    drafts: Record<string, SceneLightDraft>,
    restoring: boolean,
  ): Promise<void> {
    const revision = ++this.revision;
    const task = this.queue.catch(() => undefined).then(async () => {
      for (const light of this.lights) {
        if (revision !== this.revision) return;
        const draft = drafts[light.id] ?? this.original[light.id];
        if (
          restoring
            ? !this.touched.has(light.id)
            : sameDraft(draft, this.applied[light.id])
        ) {
          continue;
        }
        const elapsed = Date.now() - this.lastWriteAt;
        if (elapsed < this.minimumWriteGapMs) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.minimumWriteGapMs - elapsed),
          );
        }
        if (revision !== this.revision) return;
        this.touched.add(light.id);
        this.lastWriteAt = Date.now();
        await this.writeLight(light, draft);
        this.applied[light.id] = draft;
        if (restoring) this.touched.delete(light.id);
      }
    });
    this.queue = task;
    return task;
  }
}
