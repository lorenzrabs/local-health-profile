import type { TrendCard } from "../../../shared/types";

export function Sparkline({ card }: { card: TrendCard }) {
  const values = card.points.map((point) => point.value).filter((value): value is number => value !== null);
  if (values.length < 2) {
    return <div className="grid h-16 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Noch zu wenig Daten</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 220;
  const height = 64;
  const padding = 6;
  const step = (width - padding * 2) / Math.max(1, card.points.length - 1);
  const points = card.points
    .map((point, index) => {
      if (point.value === null) return null;
      const x = padding + index * step;
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <svg className="h-16 w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${card.title} Verlauf`}>
      <polyline className="fill-none stroke-primary/20" points={`${points} ${width - padding},${height - padding} ${padding},${height - padding}`} />
      <polyline className="fill-none stroke-primary" points={points} strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
    </svg>
  );
}
