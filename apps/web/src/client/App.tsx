import { useEffect, useState } from "react";
import type { DashboardToday, PairingResponse, Recipe, TrendDashboard } from "../shared/types";
import { DashboardHeader } from "./components/dashboard/DashboardHeader";
import { HeartRateZones } from "./components/dashboard/HeartRateZones";
import { HabitsSection } from "./components/dashboard/HabitSummary";
import { MetricsGrid } from "./components/dashboard/MetricsGrid";
import { PairingPanel } from "./components/dashboard/PairingPanel";
import { ReadinessDecision } from "./components/dashboard/ReadinessDecision";
import { RecipesSection } from "./components/dashboard/RecipesSection";
import { RestingHeartRateCoach } from "./components/dashboard/RestingHeartRateCoach";
import { TrendPanel } from "./components/dashboard/TrendPanel";

const today = new Date().toISOString().slice(0, 10);

export function App() {
  const [dashboard, setDashboard] = useState<DashboardToday | null>(null);
  const [trends, setTrends] = useState<TrendDashboard | null>(null);
  const [trendRange, setTrendRange] = useState<30 | 90 | 365>(90);
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  async function refresh() {
    const [dashboardResponse, trendResponse, recipesResponse] = await Promise.all([
      fetch(`/api/dashboard/today?date=${today}`),
      fetch(`/api/dashboard/trends?date=${today}&rangeDays=${trendRange}`),
      fetch("/api/recipes?servings=1")
    ]);
    setDashboard(await dashboardResponse.json());
    setTrends(await trendResponse.json());
    setRecipes(await recipesResponse.json());
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [trendRange]);

  async function createPairing() {
    const response = await fetch("/api/pairing");
    setPairing(await response.json());
  }

  async function runAiAnalysis() {
    setAiBusy(true);
    await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: today })
    });
    await refresh();
    setAiBusy(false);
  }

  if (!dashboard) {
    return <main className="grid min-h-screen place-items-center bg-background text-foreground">Health Profile wird geladen...</main>;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:py-8">
        <DashboardHeader dashboard={dashboard} />
        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <ReadinessDecision dashboard={dashboard} aiBusy={aiBusy} onAnalyze={runAiAnalysis} />
          <PairingPanel pairing={pairing} onCreatePairing={createPairing} />
        </section>
        <MetricsGrid metrics={dashboard.metrics} />
        <section className="grid gap-6 xl:grid-cols-2">
          <RestingHeartRateCoach dashboard={dashboard} />
          <HeartRateZones dashboard={dashboard} />
        </section>
        {trends && <TrendPanel trends={trends} selectedRange={trendRange} onRangeChange={setTrendRange} />}
        <HabitsSection initialHabits={dashboard.habits} today={today} onTodayChanged={refresh} />
        <RecipesSection recipes={recipes} />
      </div>
    </main>
  );
}
