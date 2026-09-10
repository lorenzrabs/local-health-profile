import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Check,
  Minus,
  SlidersHorizontal,
} from "lucide-react";
import type {
  HabitAnalysis,
  HabitCorrelation,
  HabitDay,
  HabitDefinition,
} from "../../../shared/types";
import { shiftDate } from "../../../shared/dates";

export function HabitsSection({
  analysis,
  initialHabits,
  today,
  onTodayChanged,
}: {
  analysis: HabitAnalysis;
  initialHabits: HabitDay;
  today: string;
  onTodayChanged: () => Promise<void>;
}) {
  const [selectedDate, setSelectedDate] = useState(today),
    [day, setDay] = useState(initialHabits),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setSelectedDate(today);
  }, [today]);
  useEffect(() => {
    if (initialHabits.date === selectedDate) setDay(initialHabits);
  }, [initialHabits, selectedDate]);
  useEffect(() => {
    let current = true;
    fetch(`/api/habits?date=${selectedDate}`)
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        if (current) {
          setDay(d);
          setError("");
        }
      })
      .catch(() => {
        if (current) setError("Einträge konnten nicht geladen werden.");
      });
    return () => {
      current = false;
    };
  }, [selectedDate]);
  async function record(h: HabitDefinition, completed: boolean) {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/habits/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              habitId: h.id,
              habitClientId: h.clientId,
              date: selectedDate,
              completed,
              updatedAt: new Date().toISOString(),
            },
          ],
        }),
      });
      if (!r.ok) throw Error();
      const next = await fetch(`/api/habits?date=${selectedDate}`);
      if (!next.ok) throw Error();
      setDay(await next.json());
      await onTodayChanged();
    } catch {
      setError(
        "Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen.",
      );
    } finally {
      setSaving(false);
    }
  }
  const ranked = [...analysis.items].sort(
    (a, b) => b.trackedDays - a.trackedDays,
  );
  return (
    <section id="habits" className="habit-section">
      <div className="section-heading">
        <div>
          <div className="section-kicker">GEWOHNHEITEN</div>
          <h2>Was deine Habits zeigen.</h2>
        </div>
        <span className="subtle-label">
          {analysis.items.length} aktive Habits · {analysis.recordedDays}/
          {analysis.totalDays} Tage erfasst
        </span>
      </div>
      <div className="habit-layout">
        <div className="habit-table-wrap">
          <div className="habit-table-heading">
            <span>Deine Einträge</span>
            <span>Ja / erfasst</span>
            <span>Erfassung</span>
            <span>Letzte 7 Tage</span>
          </div>
          {ranked.map((h) => (
            <details className="habit-table-row" key={h.clientId}>
              <summary>
                <span className="habit-name">{h.name}</span>
                <span className="habit-ratio">
                  <b>{h.eventDays}</b>
                  <span> / {h.trackedDays}</span>
                </span>
                <span className="coverage-cell">
                  <span className="coverage-track">
                    <i style={{ width: `${h.trackingRate * 100}%` }} />
                  </span>
                  <small>{Math.round(h.trackingRate * 100)}%</small>
                </span>
                <span className="habit-week">
                  {h.recentTrackedDays >= 3 &&
                  h.previousTrackedDays >= 3 &&
                  h.recentRate !== null &&
                  h.previousRate !== null ? (
                    <>
                      {Math.round((h.recentRate - h.previousRate) * 100) > 0
                        ? "+"
                        : ""}
                      {Math.round((h.recentRate - h.previousRate) * 100)} pp
                    </>
                  ) : (
                    <span className="muted-text">—</span>
                  )}
                  <ArrowUpRight size={14} />
                </span>
              </summary>
              <div className="habit-row-detail">
                <p>
                  {h.eventDays} Ja · {h.nonEventDays} Nein · {h.missingDays}{" "}
                  Tage ohne Eintrag.{" "}
                  {h.trackedDays > 0
                    ? `${Math.round(h.eventRate * 100)}% Ja unter den erfassten Tagen.`
                    : "Noch keine Auswertung möglich."}
                </p>
                <div className="weekday-chart">
                  {h.weekdays.map((w) => (
                    <div key={w.weekday}>
                      <span className="weekday-track">
                        <i style={{ height: `${w.eventRate * 100}%` }} />
                      </span>
                      <b>{w.label}</b>
                      <small>
                        {w.totalDays ? `${w.eventDays}/${w.totalDays}` : "—"}
                      </small>
                    </div>
                  ))}
                </div>
                <p className="muted-text">
                  Wochenvergleich: Anteil Ja unter erfassten Tagen; mindestens 3
                  Einträge je Woche. Prozentpunkte (pp) zeigen die Änderung,
                  keine Bewertung.
                </p>
              </div>
            </details>
          ))}
          {ranked.length === 0 && (
            <div className="empty-state">
              Noch keine aktiven Habits vorhanden.
            </div>
          )}
          <div className="table-foot">
            Fehlende Einträge bleiben unbekannt. Archivierte Habits werden nicht
            ausgewertet.
          </div>
        </div>
        <aside className="insights-panel">
          <div className="section-kicker">AM FOLGETAG</div>
          <h3>Muster entdecken.</h3>
          <p className="muted-text">
            Mit Ereignis und ohne Ereignis – nur ausdrücklich erfasste Tage.
          </p>
          <CorrelationList correlations={analysis.correlations} />
          <details className="method-note">
            <summary>So rechnen wir</summary>
            {analysis.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </details>
        </aside>
      </div>
      <details className="entry-editor">
        <summary>
          <SlidersHorizontal size={16} /> Einträge bearbeiten{" "}
          <span>Ja, Nein oder noch offen</span>
        </summary>
        <div className="entry-editor-body">
          <div className="date-stepper">
            <button
              aria-label="Vorheriger Tag"
              onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            >
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="Datum für Habit-Einträge"
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
            />
            <button
              aria-label="Nächster Tag"
              disabled={selectedDate >= today}
              onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="entry-grid">
            {day.definitions
              .filter((h) => h.isActive)
              .map((h) => {
                const e = day.entries.find((e) => e.habitId === h.id);
                return (
                  <div className="entry-item" key={h.clientId}>
                    <span>
                      {h.name}
                      <small>
                        {e === undefined
                          ? "Nicht erfasst"
                          : e.completed
                            ? "Ereignis erfasst"
                            : "Ohne Ereignis erfasst"}
                      </small>
                    </span>
                    <div>
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          disabled={saving || day.date !== selectedDate}
                          className={e?.completed === value ? "selected" : ""}
                          aria-pressed={e?.completed === value}
                          aria-label={`${h.name}: ${value ? "Ja" : "Nein"}`}
                          onClick={() => record(h, value)}
                        >
                          {value ? <Check size={14} /> : <Minus size={14} />}{" "}
                          {value ? "Ja" : "Nein"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
function CorrelationList({
  correlations,
}: {
  correlations: HabitCorrelation[];
}) {
  const [metric, setMetric] = useState("resting_hr"),
    [showAll, setShowAll] = useState(false);
  const selected = correlations.filter((c) => c.metric === metric);
  return (
    <>
      <div
        className="metric-tabs"
        role="group"
        aria-label="Messgröße der Habit-Analyse"
      >
        {[
          ["resting_hr", "Ruhepuls"],
          ["hrv", "HRV"],
          ["sleep", "Schlaf"],
        ].map(([id, label]) => (
          <button
            aria-pressed={metric === id}
            key={id}
            onClick={() => {
              setMetric(id);
              setShowAll(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {selected.length === 0 ? (
        <div className="empty-state">
          <span className="empty-symbol">↗</span>
          <b>Noch kein belastbarer Vergleich</b>
          <p>
            Mindestens 7 gemessene Folgetage nach „Ja“ und 7 nach „Nein“ nötig.
            Weitere Einträge machen die Auswertung aussagekräftiger.
          </p>
        </div>
      ) : (
        selected.slice(0, showAll ? selected.length : 3).map((c) => (
          <div className="correlation-card" key={c.habitClientId}>
            <div>
              <b>{c.habitName}</b>
              <strong>
                {c.delta! > 0 ? "+" : ""}
                {c.delta!.toFixed(1)} <small>{c.unit}</small>
              </strong>
            </div>
            <div className="comparison-numbers">
              <span>
                Mit Ereignis <b>{c.eventMedian!.toFixed(1)}</b>
                <small>{c.eventDays} Messtage</small>
              </span>
              <span>
                Ohne Ereignis <b>{c.comparisonMedian!.toFixed(1)}</b>
                <small>{c.comparisonDays} Messtage</small>
              </span>
            </div>
            <p>
              Median am Folgetag ·{" "}
              {c.confidence === "more_data"
                ? "größere Datenbasis"
                : "vorläufiger Hinweis"}
            </p>
          </div>
        ))
      )}
      {selected.length > 3 && (
        <button
          className="quiet-button"
          style={{ marginTop: 12 }}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Weniger anzeigen" : `Alle ${selected.length} Vergleiche`}
        </button>
      )}
      {selected.length > 0 && (
        <p className="association-note">
          Beobachteter Unterschied, kein Wirkungsnachweis.
        </p>
      )}
    </>
  );
}
