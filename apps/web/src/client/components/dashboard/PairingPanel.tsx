import { QrCode, Watch } from "lucide-react";
import type { PairingResponse } from "../../../shared/types";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function PairingPanel({
  pairing,
  onCreatePairing
}: {
  pairing: PairingResponse | null;
  onCreatePairing: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Apple Health</CardDescription>
        <CardTitle className="flex items-center gap-2">
          <Watch className="h-5 w-5" />
          iOS Sync koppeln
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Erzeuge einen lokalen Token und scanne den QR-Code mit der iPhone-Kamera. Health Profile öffnet sich direkt
          und übernimmt Server plus Token automatisch.
        </p>
        <Button onClick={onCreatePairing} className="w-full">
          <QrCode className="h-4 w-4" />
          Pairing erzeugen
        </Button>
        {pairing && (
          <div className="grid gap-3">
            <img src={pairing.qrDataUrl} alt="Pairing QR-Code" className="h-36 w-36 rounded-md border bg-background" />
            <div className="space-y-2 text-xs">
              <div>
                <span className="font-medium">App-Link</span>
                <code className="mt-1 block rounded-md bg-muted p-2 text-muted-foreground">{pairing.pairingUrl}</code>
              </div>
              <div>
                <span className="font-medium">Server</span>
                <code className="mt-1 block rounded-md bg-muted p-2 text-muted-foreground">{pairing.serverUrl}</code>
              </div>
              <div>
                <span className="font-medium">Token</span>
                <code className="mt-1 block rounded-md bg-muted p-2 text-muted-foreground">{pairing.token}</code>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
