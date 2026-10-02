import { SwitchEditor } from "@/features/switch-editor/SwitchEditor";
import { useParams } from "@tanstack/react-router";

export const SwitchEditorRoute = () => {
  const { deviceId } = useParams({ from: "/settings/switch/$deviceId" });
  return <SwitchEditor key={deviceId} deviceId={deviceId} />;
};
