import { HueBridgeBody } from "@/components/HueBridgeIllustration";
import { HueBridgeProBody } from "@/components/HueBridgeProIllustration";
import { HueSyncBoxBody } from "@/components/HueSyncBoxIllustration";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DimmerModel3D,
  type DimmerButton,
} from "@/features/switch-editor/DimmerModel3D";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/context/ThemeContext";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";

// The hardware illustrations rendered in the wizard, shown together so each can
// be tuned against the others and checked in both themes / pairing states.
const DEVICES: { name: string; subtitle: string; render: (pulse: boolean) => ReactNode }[] = [
  {
    name: "Bridge",
    subtitle: "Classic white v2",
    render: (pulse) => <HueBridgeBody pulse={pulse} />,
  },
  {
    name: "Bridge Pro",
    subtitle: "Black, large center button",
    render: (pulse) => <HueBridgeProBody pulse={pulse} />,
  },
  {
    name: "Sync Box",
    subtitle: "Play HDMI Sync Box",
    render: (pulse) => <HueSyncBoxBody pulse={pulse} />,
  },
  {
    name: "Dimmer switch",
    subtitle: "3D model from the switch editor",
    render: () => <DimmerPreview />,
  },
];

/** The switch editor's dimmer, clickable, at the size of a gallery card. */
const DimmerPreview = () => {
  const [selected, setSelected] = useState<DimmerButton>(1);
  return (
    <div className="h-52 w-40" onClick={(event) => event.stopPropagation()}>
      <DimmerModel3D
        className="h-full w-full"
        selected={selected}
        configurable={() => true}
        onSelect={setSelected}
      />
    </div>
  );
};

/**
 * Dev-only showcase of the hardware illustrations used in the setup wizard.
 * Reached from the dev toolbar's "Design" group (VITE_DEV_VIEWS). Lets the new
 * Sync Box illustration be inspected next to the two bridges, with a pulse
 * toggle (the pairing/busy state) and a theme switch.
 */
export const DeviceGallery = () => {
  const { resolvedThemeMode, toggleTheme } = useTheme();
  const [pulse, setPulse] = useState(false);
  const [focusedName, setFocusedName] = useState<string | null>(null);

  const focusedDevice = DEVICES.find((device) => device.name === focusedName);

  const themeButton = (
    <Button variant="outline" size="lg" onClick={toggleTheme}>
      {resolvedThemeMode === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
      {resolvedThemeMode === "dark" ? "Light" : "Dark"} mode
    </Button>
  );

  const pulseToggle = (
    <Label className="gap-2.5">
      <Switch checked={pulse} onCheckedChange={setPulse} />
      Pulse
    </Label>
  );

  if (focusedDevice) {
    return (
      <ScrollArea className="h-full" viewportClassName="px-8 py-20" fade>
        <div className="mx-auto max-w-5xl pb-24">
          <header className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setFocusedName(null)}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <div className="flex items-center gap-4">
              {pulseToggle}
              {themeButton}
            </div>
          </header>

          <div className="flex flex-col items-center gap-8 py-28">
            <div className="scale-150 py-10">{focusedDevice.render(pulse)}</div>
            <div className="space-y-1 pt-8 text-center">
              <h1 className="font-heading text-3xl font-semibold">
                {focusedDevice.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {focusedDevice.subtitle}
              </p>
            </div>
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full" viewportClassName="px-8 py-20" fade>
      <div className="mx-auto max-w-5xl space-y-8 pb-24">
        <header className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-heading text-3xl font-semibold">Devices</h1>
            <p className="text-sm text-muted-foreground">
              The hardware illustrations shown in the setup wizard. Toggle pulse
              to preview the pairing/busy state. Click a device to focus it.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {pulseToggle}
            {themeButton}
          </div>
        </header>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DEVICES.map((device) => (
            <button
              key={device.name}
              type="button"
              onClick={() => setFocusedName(device.name)}
              className="flex flex-col items-center gap-4 rounded-3xl border border-border/60 bg-card/40 p-8 text-center transition-colors hover:border-border hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex h-52 items-center justify-center">
                {device.render(pulse)}
              </div>
              <div className="space-y-0.5">
                <h2 className="font-heading text-lg font-semibold">
                  {device.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {device.subtitle}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
};
