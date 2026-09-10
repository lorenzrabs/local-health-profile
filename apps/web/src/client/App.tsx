import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, RefreshCw } from "lucide-react";
import type {
  DashboardToday,
  HabitAnalysis,
  PairingResponse,
  Recipe,
  TrendDashboard,
} from "../shared/types";
import { localDate } from "../shared/dates";
import { HabitsSection } from "./components/dashboard/HabitSummary";
import { PairingPanel } from "./components/dashboard/PairingPanel";
import { RecipesSection } from "./components/dashboard/RecipesSection";
import { RestingHeartRateCoach } from "./components/dashboard/RestingHeartRateCoach";
import { TrendPanel } from "./components/dashboard/TrendPanel";

type Context = {
  lastHealthDate: string | null;
  lastHabitDate: string | null;
  lastSyncAt: string | null;
};
type Data = {
  dashboard: DashboardToday;
  trends: TrendDashboard;
  analysis: HabitAnalysis;
  recipes: Recipe[];
  context: Context;
};
async function get<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok)
    throw Error(
      r.status === 401
        ? "Bitte erneut anmelden und die Seite neu laden."
        : "Daten konnten nicht geladen werden. Bitte erneut versuchen.",
    );
  return r.json();
}
export function App() {
  const [date, setDate] = useState(localDate()),
    [range, setRange] = useState<30 | 90 | 365>(90),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [pairing, setPairing] = useState<PairingResponse | null>(null);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    Promise.all([
      get<DashboardToday>(`/api/dashboard/today?date=${date}`),
      get<TrendDashboard>(
        `/api/dashboard/trends?date=${date}&rangeDays=${range}`,
      ),
      get<HabitAnalysis>(
        `/api/habits/analysis?date=${date}&rangeDays=${range}`,
      ),
      get<Recipe[]>("/api/recipes?servings=1"),
      get<Context>("/api/dashboard/context"),
    ])
      .then(([dashboard, trends, analysis, recipes, context]) => {
        if (current) setData({ dashboard, trends, analysis, recipes, context });
      })
      .catch((e) => {
        if (current) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [date, range, revision]);
  async function refresh() {
    setRevision((r) => r + 1);
  }
  const stale =
    data?.context.lastHealthDate && data.context.lastHealthDate < date;
  return (
    <main className="health-app">
      <header className="app-bar">
        <a href="#" className="brand">
          <span>
            <Activity size={21} />
          </span>{" "}
          health<span className="brand-light"> / profile</span>
        </a>
        <nav aria-label="Dashboard-Bereiche">
          <a href="#ueberblick">Überblick</a>
          <a href="#ruhepuls">Ruhepuls</a>
          <a href="#habits">Habits</a>
          <a href="#ernaehrung">Ernährung</a>
        </nav>
        <PairingPanel
          pairing={pairing}
          onCreatePairing={async () =>
            setPairing(await get<PairingResponse>("/api/pairing"))
          }
        />
      </header>
      <div className="dashboard-shell">
        <section className="page-intro" id="ueberblick">
          <div>
            <div className="section-kicker">
              <span className="live-dot" /> DEIN PERSÖNLICHER GESUNDHEITSBLICK
            </div>
            <h1>
              Mehr verstehen.
              <br />
              <em>Besser für dich sorgen.</em>
            </h1>
            <p>
              Deine Entwicklung, deine Gewohnheiten und die Muster dazwischen.
            </p>
          </div>
          <div className="intro-meta">
            <span>Datenstand</span>
            <strong>
              {data?.context.lastHealthDate
                ? new Date(
                    data.context.lastHealthDate + "T12:00:00",
                  ).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "Noch keine Messdaten"}
            </strong>
            <button
              onClick={refresh}
              className="quiet-button"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />{" "}
              Aktualisieren
            </button>
          </div>
        </section>
        <div className="filter-bar">
          <div>
            <span className="filter-label">ZEITRAUM</span>
            <div
              className="range-control"
              role="group"
              aria-label="Analysezeitraum"
            >
              {[30, 90, 365].map((n) => (
                <button
                  key={n}
                  aria-pressed={range === n}
                  onClick={() => setRange(n as 30 | 90 | 365)}
                >
                  {n === 365 ? "1 Jahr" : `${n} Tage`}
                </button>
              ))}
            </div>
          </div>
          <label>
            bis{" "}
            <input
              aria-label="Enddatum der Auswertung"
              type="date"
              value={date}
              max={localDate()}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
        </div>
        {error && (
          <div className="error-message" role="alert">
            {error} <button onClick={refresh}>Erneut versuchen</button>
          </div>
        )}
        {stale && (
          <div className="data-notice">
            Die letzten Messdaten stammen vom{" "}
            {new Date(
              data!.context.lastHealthDate! + "T12:00:00",
            ).toLocaleDateString("de-DE")}
            .
            <button onClick={() => setDate(data!.context.lastHealthDate!)}>
              Diesen Datenstand ansehen <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        {!data ? (
          <div className="dashboard-loading" role="status">
            {error
              ? "Dashboard derzeit nicht verfügbar."
              : "Dein Dashboard wird geladen …"}
          </div>
        ) : (
          <div
            className={
              loading ? "dashboard-content is-loading" : "dashboard-content"
            }
            aria-busy={loading}
          >
            <TrendPanel
              trends={data.trends}
              selectedRange={range}
              onRangeChange={setRange}
            />
            <RestingHeartRateCoach
              dashboard={data.dashboard}
              analysis={data.analysis}
            />
            <HabitsSection
              analysis={data.analysis}
              initialHabits={data.dashboard.habits}
              today={date}
              onTodayChanged={refresh}
            />
            <section id="ernaehrung" className="nutrition-section">
              <details>
                <summary>
                  <div>
                    <div className="section-kicker">ERNÄHRUNG</div>
                    <h2>Deine Rezeptesammlung</h2>
                  </div>
                  <span>
                    {data.recipes.length} Rezepte <ArrowUpRight size={18} />
                  </span>
                </summary>
                <div className="nutrition-content">
                  <RecipesSection recipes={data.recipes} />
                </div>
              </details>
            </section>
          </div>
        )}
        <footer className="dashboard-footer">
          <span>
            <Activity size={15} /> Dein Rhythmus. Deine Daten.
          </span>
          <span>Privat auf deinem Mac mini.</span>
        </footer>
      </div>
    </main>
  );
}
