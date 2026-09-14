export type RenameableResourceType =
  | "light"
  | "room"
  | "zone"
  | "scene"
  | "smart_scene"
  | "entertainment_configuration";

export type DeleteableResourceType = RenameableResourceType | "device";

export type CloseButtonBehavior = "exit" | "minimizeToTray";

export interface AppSettings {
  closeButtonBehavior: CloseButtonBehavior;
  autoStart: boolean;
  autoStartSupported: boolean;
  desktopShortcut: boolean;
  desktopShortcutSupported: boolean;
}

export type RenameResource = (
  resourceType: RenameableResourceType,
  id: string,
  name: string,
  archetype?: string,
) => Promise<void>;

export type DeleteResource = (
  resourceType: DeleteableResourceType,
  id: string,
) => Promise<void>;

export type SaveSwitchConfig = (
  id: string,
  body: Record<string, unknown>,
) => Promise<void>;
