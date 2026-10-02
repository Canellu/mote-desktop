import { MotionEditor } from "@/features/switch-editor/MotionEditor";
import { useParams } from "@tanstack/react-router";

export const MotionEditorRoute = () => {
  const { deviceId } = useParams({ from: "/settings/motion/$deviceId" });
  return <MotionEditor key={deviceId} deviceId={deviceId} />;
};
