import type { DashboardMetric } from "../../../shared/types";
import { Card, CardContent } from "../ui/card";

export function MetricsGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <Card key={metric.label} className={metric.status === "watch" ? "border-destructive/30 bg-destructive/5" : metric.status === "good" ? "border-primary/20 bg-primary/5" : ""}>
          <CardContent className="p-4">
            <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
            <strong className="mt-2 block text-2xl font-semibold tracking-normal">{metric.value}</strong>
            {metric.detail && <small className="mt-1 block text-xs text-muted-foreground">{metric.detail}</small>}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
