import { useEffect } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEntitlements } from "@/context/EntitlementContext";
import { useHue } from "@/context/HueContext";
import { useLightGroups } from "@/features/automations/useLightGroups";
import { RitualWizard } from "@/features/focus/RitualWizard";
import { loadFocus, saveRitual } from "@/features/focus/store";

export function FocusWizardRoute() {
  const navigate = useNavigate();
  const router = useRouter();
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
      // Step back to the page that opened the wizard, so Back neither
      // reopens it nor lands on a second copy of Focus.
      onExit={() =>
        router.history.canGoBack()
          ? router.history.back()
          : void navigate({ to: "/focus", replace: true })
      }
    />
  );
}
