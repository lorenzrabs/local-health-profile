import type { TrendCard, TrendDashboard } from "../../../shared/types";
import { Sparkline } from "./Sparkline";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";

export function TrendPanel({
  trends,
  selectedRange,
  onRangeChange
}: {
  trends: TrendDashboard;
  selectedRange: 30 | 90 | 365;
  onRangeChange: (range: 30 | 90 | 365) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Langzeittrends</p>
          <h2 className="text-2xl font-semibold tracking-normal">Deine Entwicklung</h2>
        </div>
        <Tabs value={String(selectedRange)} onValueChange={(value) => onRangeChange(Number(value) as 30 | 90 | 365)}>
          <TabsList>
            <TabsTrigger value="30">30 Tage</TabsTrigger>
            <TabsTrigger value="90">90 Tage</TabsTrigger>
            <TabsTrigger value="365">1 Jahr</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {trends.cards.map((card) => (
          <TrendCardView card={card} key={card.id} />
        ))}
      </div>
    </section>
  );
}

function TrendCardView({ card }: { card: TrendCard }) {
  return (
    <Card className={card.status === "watch" ? "border-destructive/30 bg-destructive/5" : card.status === "good" ? "border-primary/20 bg-primary/5" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{card.title}</CardTitle>
          <Badge variant="outline">{card.deltaLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <strong className="block text-3xl font-semibold tracking-normal">{card.value}</strong>
          <small className="text-sm text-muted-foreground">{card.detail}</small>
        </div>
        {card.interpretation && <Badge variant="secondary">{card.interpretation}</Badge>}
        <Sparkline card={card} />
      </CardContent>
    </Card>
  );
}
