import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, MonitorPlay, TriangleAlert } from "lucide-react";

/**
 * Link-button flow that provisions the entertainment credential for installs
 * whose original pairing predates clientkey capture. The user must press the
 * bridge's button right before provisioning.
 */
export const EnablePcSyncCard = ({
  isUpdating,
  error,
  onProvision,
}: {
  isUpdating: boolean;
  error: string | null;
  onProvision: () => void | Promise<unknown>;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <MonitorPlay className="size-5" /> Enable PC Sync
      </CardTitle>
      <CardDescription>
        PC light sync streams directly from this computer to your Hue Bridge. It
        needs a one-time entertainment credential from the bridge; your existing
        connection is not affected.
      </CardDescription>
    </CardHeader>
    <CardContent className="grid gap-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl bg-destructive/10 p-4 text-sm text-(--destructive-text)"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Press the round link button on your Hue Bridge.</li>
        <li>Click “Enable PC Sync” within 30 seconds.</li>
      </ol>
      <Button
        className="justify-self-start gap-2"
        disabled={isUpdating}
        onClick={() => void onProvision()}
      >
        {isUpdating && <Loader2 className="animate-spin" />}
        Enable PC Sync
      </Button>
    </CardContent>
  </Card>
);
