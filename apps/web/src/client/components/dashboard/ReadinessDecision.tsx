import { Brain, ListChecks } from "lucide-react";
import type { DashboardToday } from "../../../shared/types";
import { labelForAction } from "./format";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function ReadinessDecision({
  dashboard,
  aiBusy,
  onAnalyze
}: {
  dashboard: DashboardToday;
  aiBusy: boolean;
  onAnalyze: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>Heute</CardDescription>
            <CardTitle className="text-2xl">{dashboard.headline}</CardTitle>
          </div>
          <Badge>{labelForAction(dashboard.primaryAction)}</Badge>
        </div>
        {dashboard.riskFlags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {dashboard.riskFlags.map((flag) => (
              <Badge key={flag} variant="destructive">
                {flag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4" />
            Warum
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {dashboard.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4" />
            Nächste Schritte
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {dashboard.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
          <Button onClick={onAnalyze} disabled={aiBusy} variant="secondary">
            <Brain className="h-4 w-4" />
            {aiBusy ? "Analysiere..." : "KI-Analyse speichern"}
          </Button>
          {dashboard.lastAiRecommendation && (
            <p className="text-xs text-muted-foreground">Letzte Analyse: {dashboard.lastAiRecommendation.recommendation.headline}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
