import { habitAction } from "./habitAction";
import {
  ArrowDownRight,
  HeartPulse,
  ArrowUpRight,
  Moon,
  Footprints,
  ScanLine,
} from "lucide-react";
import type { DashboardToday, HabitAnalysis } from "../../../shared/types";
import { formatBpm } from "./format";

export function RestingHeartRateCoach({
  dashboard,
  analysis,
}: {
  dashboard: DashboardToday;
  analysis: HabitAnalysis | null;
}) {
  const c = dashboard.restingHeartRateCoach;
  const signals = (analysis?.correlations ?? [])
    .filter((s) => s.metric === "resting_hr" && Math.abs(s.delta ?? 0) >= 1)
    .slice(0, 1);
  const points = c.history.filter((p) => p.value !== null);
  const values = points.map((p) => p.value!);
  const lo = Math.min(...values) - 2,
    hi = Math.max(...values) + 2;
  const path = c.history
    .map((p, i) =>
      p.value === null
        ? null
        : `${(i / (c.history.length - 1)) * 560},${108 - ((p.value - lo) / (hi - lo)) * 84}`,
    )
    .reduce<string[]>((segments, p, i) => {
      if (p === null) segments.push("");
      else {
        if (i === 0 || c.history[i - 1].value === null) segments.push(`M${p}`);
        else segments[segments.length - 1] += ` L${p}`;
      }
      return segments;
    }, [])
    .join(" ");
  const delta = c.deltaFromBaseline;
  return (
    <section id="ruhepuls" className="pulse-panel">
      <div className="pulse-main">
        <div className="section-kicker">
          <HeartPulse size={16} /> RUHEPULS
        </div>
        <div className="pulse-heading">
          <h2>Deine Erholung im Blick.</h2>
          <span className="status-pill">
            {c.status === "missing"
              ? "Datenbasis offen"
              : delta !== null && delta >= 4.5
                ? "Über deinem Vergleichswert"
                : "Dein persönlicher Verlauf"}
          </span>
        </div>
        <div className="pulse-numbers">
          <div>
            <strong>
              {c.sevenDayAverage === null ? "—" : Math.round(c.sevenDayAverage)}
            </strong>
            <span>bpm · 7-Tage-Mittel</span>
          </div>
          <div className="pulse-delta">
            {delta !== null ? (
              <>
                {delta <= 0 ? <ArrowDownRight /> : <ArrowUpRight />}
                <b>
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)} bpm
                </b>
              </>
            ) : (
              <b>—</b>
            )}
            <span>zum vorherigen 28-Tage-Mittel</span>
          </div>
        </div>
        <div className="pulse-chart">
          {points.length >= 2 ? (
            <svg
              viewBox="0 0 560 125"
              role="img"
              aria-label="Ruhepuls-Verlauf über 90 Tage"
            >
              <defs>
                <linearGradient id="pulse-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity=".12"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
              {[30, 65, 100].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="560"
                  y1={y}
                  y2={y}
                  stroke="currentColor"
                  opacity=".1"
                />
              ))}
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <div className="chart-empty">
              Noch kein Verlauf in diesem Zeitraum.
            </div>
          )}
        </div>
        <div className="pulse-foot">
          <span>
            Zuletzt {formatBpm(c.latest)}
            {c.latestDate
              ? ` · ${new Date(c.latestDate + "T12:00:00").toLocaleDateString("de-DE")}`
              : ""}
          </span>
          <span>
            {c.sevenDaySampleDays}/7 · {c.baselineSampleDays}/28 Messtage
          </span>
        </div>
        <details className="method-note">
          <summary>Wie wird verglichen?</summary>
          <p>
            Die letzten 7 Tage werden mit den 28 Tagen davor verglichen, ohne
            Überlappung. Mindestens 4 bzw. 14 Messtage. Ein niedrigerer Puls ist
            nicht automatisch besser. Neue, anhaltende Auffälligkeiten oder
            Beschwerden ärztlich abklären.
          </p>
        </details>
      </div>
      <div className="pulse-actions">
        <div className="section-kicker">RUHEPULS UNTERSTÜTZEN</div>
        <h3>
          Kleine Schritte.
          <br />
          Konsequent wiederholen.
        </h3>
        <div className="action-row">
          <Moon size={18} />
          <div>
            <b>Schlafzeiten stabil halten</b>
            <p>
              Eine feste Aufstehzeit wählen und die letzte Stunde vor dem
              Schlafen ruhig gestalten.
            </p>
          </div>
        </div>
        <div className="action-row">
          <Footprints size={18} />
          <div>
            <b>Bewegung fest einplanen</b>
            <p>
              Regelmäßige, angenehm leichte Spaziergänge oder Ausdauerbewegung
              in den Alltag einbauen.
            </p>
          </div>
        </div>
        {signals.length > 0 ? (
          <div className="personal-signals">
            <div className="section-kicker">AUS DEINEN HABITS</div>
            {signals.map((s) => (
              <div key={s.habitClientId} className="personal-signal">
                <b>{s.habitName}</b>
                <p>
                  Am Folgetag {s.delta! > 0 ? "+" : ""}
                  {s.delta!.toFixed(1)} bpm im Median. {s.eventDays} Tage mit /{" "}
                  {s.comparisonDays} ohne Ereignis.
                </p>
                <span>{habitAction(s.habitName, s.delta!)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="signal-empty">
            <ScanLine size={17} />
            <p>
              Persönliche Habit-Hinweise erscheinen ab 7 passenden Tagen mit und
              ohne Ereignis.
            </p>
          </div>
        )}
        <details className="method-note">
          <summary>Grundlagen</summary>
          <p>
            <a
              href="https://www.nhlbi.nih.gov/health/sleep-deprivation/healthy-sleep-habits"
              target="_blank"
              rel="noreferrer"
            >
              Schlafgewohnheiten · NIH
            </a>
            <br />
            <a
              href="https://www.heart.org/en/healthy-living/exercise-and-physical-activity"
              target="_blank"
              rel="noreferrer"
            >
              Bewegung · American Heart Association
            </a>
          </p>
        </details>
      </div>
    </section>
  );
}
