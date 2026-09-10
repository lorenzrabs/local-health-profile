import type { TrendCard } from "../../../shared/types";
export function Sparkline({ card }: { card: TrendCard }) {
  const values = card.points
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  if (values.length < 2)
    return (
      <div className="muted-text" style={{ fontSize: 9, paddingTop: 9 }}>
        Noch kein Verlauf
      </div>
    );
  const lo = Math.min(...values),
    hi = Math.max(...values),
    span = hi - lo || 1;
  const segments: string[] = [];
  card.points.forEach((p, i) => {
    if (p.value === null) return;
    const x = 4 + (i / Math.max(1, card.points.length - 1)) * 212,
      y = hi === lo ? 29 : 52 - ((p.value - lo) / span) * 44;
    segments.push(
      `${i === 0 || card.points[i - 1].value === null ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`,
    );
  });
  return (
    <svg
      viewBox="0 0 220 58"
      role="img"
      aria-label={`${card.title}: Verlauf; Lücken sind fehlende Messungen`}
    >
      <path
        d={segments.join(" ")}
        stroke="#789377"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
