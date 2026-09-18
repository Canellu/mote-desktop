import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ProTag } from "./ProTag";

/**
 * Header action for the Bridge tab. Mirrors {@link AddDevicesButton}: opens the
 * pair-another-bridge flow. Always available since adding a bridge doesn't
 * depend on the current one being connected. The tab only exists once a bridge
 * is paired, so whatever this adds is a second one, which is Pro.
 */
export const AddBridgeButton = ({ onClick }: { onClick: () => void }) => (
  <Button type="button" onClick={onClick} className="shrink-0">
    <Plus size={16} />
    Add bridge
    {/* The button is filled with the primary colour the tag normally uses. */}
    <ProTag className="border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground" />
  </Button>
);
