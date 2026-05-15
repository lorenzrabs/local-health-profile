import { Gauge } from "lucide-react";
import type { DashboardToday } from "../../../shared/types";
import { formatBpm, formatZoneRange } from "./format";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function HeartRateZones({ dashboard }: { dashboard: DashboardToday }) {
  const zones = dashboard.heartRateZones;
  const confidenceLabel = {
    low: "niedrig",
    medium: "mittel",
    high: "hoch"
  }[zones.confidence];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>Lauf-Herzfrequenz</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Gauge className="h-5 w-5" />
              Deine dynamischen BPM-Zonen
            </CardTitle>
          </div>
          <Badge variant="secondary">Vertrauen: {confidenceLabel}</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{zones.summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Ruhepuls", formatBpm(zones.restingHeartRate)],
            ["geschätzte MaxHF", formatBpm(zones.estimatedMaxHeartRate)],
            ["HF-Reserve", formatBpm(zones.heartRateReserve)],
            ["Läufe/Samples", `${zones.runCount}/${zones.sampleCount.toLocaleString("de-DE")}`]
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border bg-muted/40 p-3">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <strong className="mt-1 block text-xl font-semibold tracking-normal">{value}</strong>
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          {zones.zones.map((zone) => (
            <div key={zone.id} className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[1fr_140px_150px_1fr] md:items-center">
              <div>
                <strong className="block text-sm">{zone.label}</strong>
                <span className="text-sm text-muted-foreground">{zone.description}</span>
              </div>
              <div className="text-lg font-semibold tracking-normal">{formatZoneRange(zone.low, zone.high)}</div>
              <div className="text-sm font-medium text-muted-foreground">
                {zone.sampleShare === null ? "keine Verteilung" : `${zone.sampleShare.toFixed(1).replace(".", ",")} % Samples`}
              </div>
              <small className="text-sm text-muted-foreground">{zone.guidance}</small>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
