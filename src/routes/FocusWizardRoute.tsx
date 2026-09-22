import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import { useLightGroups } from "@/features/automations/useLightGroups";
import { RitualWizard } from "@/features/focus/RitualWizard";
import { loadFocus, saveRitual } from "@/features/focus/store";

export function FocusWizardRoute() {
  const navigate = useNavigate();
  const { hasPro } = useEntitlements();
  const { bridgeId } = useHue();
  const { lightGroups } = useLightGroups();
  useEffect(() => {
    void loadFocus();
  }, []);
  return (
    <RitualWizard
      bridgeId={bridgeId}
      lightGroups={lightGroups}
      hasPro={hasPro}
      onSave={saveRitual}
      onExit={() => void navigate({ to: "/focus" })}
    />
  );
}
