export function formatAmount(amount: number) {
  return Number.isInteger(amount) ? String(amount) : String(amount).replace(".", ",");
}

export function formatNutrientAmount(amount: number) {
  if (Number.isInteger(amount)) return String(amount);
  if (amount >= 10) return amount.toFixed(1).replace(".", ",");
  return amount.toFixed(2).replace(".", ",").replace(/0$/, "").replace(/,$/, "");
}

export function formatBpm(value: number | null) {
  return value === null ? "offen" : `${Math.round(value)} bpm`;
}

export function formatDelta(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "±0 bpm";
  return `${rounded > 0 ? "+" : ""}${rounded} bpm`;
}

export function formatZoneRange(low: number | null, high: number | null) {
  if (low === null && high === null) return "offen";
  if (low === null) return `<${(high ?? 0) + 1} bpm`;
  if (high === null) return `${low}+ bpm`;
  return `${low}-${high} bpm`;
}

export function labelForAction(action: string) {
  const labels: Record<string, string> = {
    train: "Trainieren",
    easy_run: "Lockerer Lauf",
    mobility: "Mobility",
    recovery: "Regeneration",
    nutrition_focus: "Ernährung",
    smoking_reduction_focus: "Zigaretten reduzieren"
  };
  return labels[action] ?? action;
}
