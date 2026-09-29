import { useNavigate } from "@tanstack/react-router";
import { DeviceDiscoveryScreen } from "@/features/settings-screen/DeviceDiscoveryScreen";

export const DeviceDiscoveryRoute: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <DeviceDiscoveryScreen
        onDone={() =>
          // Replace the finished flow so Back doesn't reopen it.
          void navigate({
            to: "/settings",
            search: { tab: "devices" },
            replace: true,
          })
        }
      />
    </section>
  );
};
