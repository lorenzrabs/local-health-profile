import { Activity, ShieldCheck } from "lucide-react";
import type { DashboardToday } from "../../../shared/types";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";

export function DashboardHeader({ dashboard }: { dashboard: DashboardToday }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_220px]">
      <Card className="border-primary/10">
        <CardContent className="flex h-full flex-col justify-between gap-6 p-6">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Local Health Profile
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">Was soll ich heute tun?</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">{dashboard.summary}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 bg-primary text-primary-foreground">
        <CardContent className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <ShieldCheck className="h-7 w-7 opacity-80" />
          <span className="text-sm opacity-80">Readiness</span>
          <strong className="text-5xl font-semibold tracking-normal">{dashboard.readinessScore}</strong>
          <small className="opacity-80">/100</small>
        </CardContent>
      </Card>
    </section>
  );
}
