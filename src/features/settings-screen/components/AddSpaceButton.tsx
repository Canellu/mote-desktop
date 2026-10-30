import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

/**
 * Header action for the Rooms & Zones tab. Mirrors {@link AddWidgetButton}:
 * opens the create-room/zone wizard. Disabled until a bridge is connected,
 * since a new space has nothing to group without devices or lights.
 */
export const AddSpaceButton = ({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="shrink-0"
  >
    <Plus size={16} />
    Add room or zone
  </Button>
);
