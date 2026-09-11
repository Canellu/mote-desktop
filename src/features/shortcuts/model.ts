export interface LightShortcut {
  id: string;
  accelerator: string;
  bridgeId: string;
  targetKind: "light" | "room" | "zone" | "scene";
  targetId: string;
  targetName: string;
  action: "toggle" | "on" | "off" | "brightness" | "activate";
  brightness: number;
  enabled: boolean;
}

// Validate structure only; the native registrar decides key support and availability.
export function validAccelerator(value: string): boolean {
  const parts = value.split("+").map((part) => part.trim());
  return (
    parts.every(Boolean) &&
    !!parts.length &&
    parts
      .slice(0, -1)
      .every((part) =>
        /^(ctrl|control|alt|option|shift|super|win|windows|meta|cmd|command|commandorcontrol|cmdorctrl)$/i.test(
          part,
        ),
      ) &&
    !/^(ctrl|control|alt|option|shift|super|win|windows|meta|cmd|command)$/i.test(
      parts[parts.length - 1],
    )
  );
}

export function normalizeAccelerator(value: string): string {
  const parts = value.split("+").map((part) => part.trim());
  const key = parts.pop() ?? "";
  const modifiers = new Set(
    parts.map((part) => {
      if (/^(ctrl|control|commandorcontrol|cmdorctrl)$/i.test(part))
        return "Control";
      if (/^(alt|option)$/i.test(part)) return "Alt";
      if (/^shift$/i.test(part)) return "Shift";
      if (/^(super|win|windows|meta|cmd|command)$/i.test(part)) return "Super";
      return part;
    }),
  );
  let normalizedKey = key.toUpperCase();
  if (/^(key)?[a-z]$/i.test(key))
    normalizedKey = `Key${key.slice(-1).toUpperCase()}`;
  if (/^(digit)?[0-9]$/i.test(key)) normalizedKey = `Digit${key.slice(-1)}`;
  return [
    ...["Control", "Alt", "Shift", "Super"].filter((part) =>
      modifiers.has(part),
    ),
    normalizedKey,
  ].join("+");
}

export function validShortcut(value: unknown): value is LightShortcut {
  if (!value || typeof value !== "object") return false;
  const s = value as LightShortcut;
  return (
    typeof s.id === "string" &&
    !!s.id &&
    typeof s.accelerator === "string" &&
    validAccelerator(s.accelerator) &&
    typeof s.bridgeId === "string" &&
    !!s.bridgeId &&
    typeof s.targetId === "string" &&
    !!s.targetId &&
    typeof s.targetName === "string" &&
    ["light", "room", "zone", "scene"].includes(s.targetKind) &&
    (s.targetKind === "scene"
      ? s.action === "activate"
      : ["toggle", "on", "off", "brightness"].includes(s.action)) &&
    Number.isFinite(s.brightness) &&
    s.brightness >= 1 &&
    s.brightness <= 100 &&
    typeof s.enabled === "boolean"
  );
}

export const shortcutLabel = (value: string) =>
  value
    .replace(/\b(super|windows|meta|cmd|command)\b/gi, "Win")
    .replace("Control", "Ctrl")
    .replace("Key", "")
    .replace("Digit", "")
    .split("+")
    .join(" + ");
