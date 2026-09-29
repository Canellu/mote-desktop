import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

/**
 * Opens Windows' "Allowed apps" firewall page, where a Mote Desktop blocked by
 * a cancelled firewall prompt can be allowed again.
 */
export const openFirewallSettings = async () => {
  try {
    await invoke("open-firewall-settings");
  } catch (error) {
    toast.error(String(error) || "Windows Firewall settings could not be opened.");
  }
};
