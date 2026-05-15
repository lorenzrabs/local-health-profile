import { HeartPulse } from "lucide-react";
import type { DashboardToday } from "../../../shared/types";
import { formatBpm, formatDelta } from "./format";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export function RestingHeartRateCoach({ dashboard }: { dashboard: DashboardToday }) {
  const coach = dashboard.restingHeartRateCoach;
  const stats = [
    { label: "Aktuell", value: formatBpm(coach.latest) },
    { label: "7 Tage", value: formatBpm(coach.sevenDayAverage) },
    { label: "Baseline", value: formatBpm(coach.baseline28DayAverage) },
    { label: "Bestphase", value: formatBpm(coach.bestSevenDayAverage) }
  ];

  return (
    <Card className={coach.status === "elevated" || coach.status === "high" ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Ruhepuls optimieren</p>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <HeartPulse className="h-5 w-5" />
              {coach.statusLabel}
            </CardTitle>
          </div>
          <Badge variant={coach.status === "elevated" || coach.status === "high" ? "destructive" : "secondary"}>
            {coach.deltaFromBaseline === null ? "Baseline offen" : formatDelta(coach.deltaFromBaseline)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-6 text-muted-foreground">{coach.summary}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-md border bg-background p-3">
              <span className="text-xs font-medium text-muted-foreground">{stat.label}</span>
              <strong className="mt-1 block text-xl font-semibold tracking-normal">{stat.value}</strong>
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div>
            <h3 className="text-sm font-semibold">Heute senken wir die Belastung auf den Puls</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {coach.actions.slice(0, 3).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap content-start gap-2">
            {coach.drivers.map((driver) => (
              <Badge key={driver} variant="outline">
                {driver}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
