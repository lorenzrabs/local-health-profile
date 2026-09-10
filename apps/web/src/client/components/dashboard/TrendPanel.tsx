import {
  Moon,
  Footprints,
  HeartPulse,
  Activity,
  Flame,
  Timer,
} from "lucide-react";
import type { TrendDashboard } from "../../../shared/types";
import { Sparkline } from "./Sparkline";
export function TrendPanel({
  trends,
}: {
  trends: TrendDashboard;
  selectedRange: 30 | 90 | 365;
  onRangeChange: (n: 30 | 90 | 365) => void;
}) {
  const icons: Record<string, typeof HeartPulse> = {
    resting_hr: HeartPulse,
    hrv: Activity,
    sleep: Moon,
    activity: Footprints,
    running: Timer,
    vo2max: Flame,
  };
  return (
    <section className="trend-overview" aria-label="Gesundheitstrends">
      {trends.cards.map((card, i) => {
        const Icon = icons[card.id] ?? Activity;
        return (
          <article className="trend-tile" key={card.id}>
            <div className="trend-label">
              <Icon size={16} />
              <span>{card.title}</span>
            </div>
            <div className="trend-number">{card.value}</div>
            <div className="trend-detail">{card.deltaLabel}</div>
            <div className="trend-spark">
              <Sparkline card={card} />
            </div>
            <div className="trend-caption">{card.detail}</div>
          </article>
        );
      })}
    </section>
  );
}
