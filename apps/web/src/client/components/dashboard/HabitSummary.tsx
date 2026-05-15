import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HabitAnalysis, HabitCorrelation, HabitDay, HabitDefinition, HabitEntry } from "../../../shared/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function HabitsSection({
  initialHabits,
  today,
  onTodayChanged
}: {
  initialHabits: HabitDay;
  today: string;
  onTodayChanged: () => Promise<void>;
}) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [habitDay, setHabitDay] = useState(initialHabits);
  const [analysis, setAnalysis] = useState<HabitAnalysis | null>(null);
  const [analysisRange, setAnalysisRange] = useState<30 | 90 | 365>(90);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedDate === initialHabits.date) {
      setHabitDay(initialHabits);
    }
  }, [initialHabits, selectedDate]);

  useEffect(() => {
    let isCurrent = true;
    async function loadHabitDay() {
      try {
        const next = await fetchHabitDay(selectedDate);
        if (isCurrent) {
          setHabitDay(next);
          setError("");
        }
      } catch (loadError) {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Habits konnten nicht geladen werden.");
      }
    }
    loadHabitDay();
    return () => {
      isCurrent = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    let isCurrent = true;
    async function loadAnalysis() {
      try {
        const next = await fetchHabitAnalysis(today, analysisRange);
        if (isCurrent) setAnalysis(next);
      } catch (analysisError) {
        console.error(analysisError);
        if (isCurrent) setAnalysis(null);
      }
    }
    loadAnalysis();
    return () => {
      isCurrent = false;
    };
  }, [analysisRange, today, habitDay]);

  const entriesByHabit = useMemo(
    () => new Map(habitDay.entries.map((entry) => [entry.habitClientId || String(entry.habitId), entry])),
    [habitDay.entries]
  );
  const completedCount = habitDay.definitions.filter((habit) => entriesByHabit.get(habit.clientId)?.completed ?? false).length;
  const totalCount = habitDay.definitions.length;
  const completionRate = totalCount > 0 ? completedCount / totalCount : 0;
  const percent = Math.round(completionRate * 100);

  async function toggleHabit(habit: HabitDefinition, completed: boolean) {
    const now = new Date().toISOString();
    const nextEntry: HabitEntry = {
      habitId: habit.id,
      habitClientId: habit.clientId,
      date: selectedDate,
      completed,
      updatedAt: now
    };
    const key = `${selectedDate}-${habit.clientId}`;
    setSavingKey(key);
    setError("");
    setHabitDay((current) => ({
      ...current,
      entries: upsertEntry(current.entries, nextEntry)
    }));

    try {
      await fetch("/api/habits/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              habitId: habit.id,
              habitClientId: habit.clientId,
              date: selectedDate,
              completed,
              updatedAt: now
            }
          ]
        })
      }).then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
      });
      setHabitDay(await fetchHabitDay(selectedDate));
      setAnalysis(await fetchHabitAnalysis(today, analysisRange));
      if (selectedDate === today) await onTodayChanged();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Habit konnte nicht synchronisiert werden.");
      setHabitDay(await fetchHabitDay(selectedDate).catch(() => habitDay));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="grid gap-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardDescription>Habits</CardDescription>
              <CardTitle className="mt-1 flex flex-wrap items-center gap-3 text-2xl">
                Tagesanker
                <Badge variant={percent >= 70 ? "default" : "secondary"}>{percent}% erledigt</Badge>
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, -1))} aria-label="Vorheriger Tag">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-44 rounded-md border bg-background px-3 py-2 text-center">
                <div className="text-sm font-semibold">{formatDateTitle(selectedDate)}</div>
                <div className="text-xs text-muted-foreground">{selectedDate}</div>
              </div>
              <Button variant="outline" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, 1))} aria-label="Nächster Tag">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {completedCount}/{totalCount} erledigt. Web und iPhone schreiben über dieselbe Habit-Sync-Schnittstelle.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {habitDay.definitions.map((habit) => {
            const completed = entriesByHabit.get(habit.clientId)?.completed ?? false;
            const key = `${selectedDate}-${habit.clientId}`;
            return (
              <HabitToggle
                key={habit.clientId}
                habit={habit}
                completed={completed}
                disabled={savingKey === key}
                onToggle={(next) => toggleHabit(habit, next)}
              />
            );
          })}
          {habitDay.definitions.length === 0 && (
            <p className="text-sm text-muted-foreground">Für diesen Tag sind noch keine aktiven Habits vorhanden.</p>
          )}
          {error && <p className="md:col-span-2 xl:col-span-4 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
      {analysis && (
        <HabitAnalysisPanel
          analysis={analysis}
          selectedRange={analysisRange}
          onRangeChange={setAnalysisRange}
        />
      )}
    </section>
  );
}

function HabitAnalysisPanel({
  analysis,
  selectedRange,
  onRangeChange
}: {
  analysis: HabitAnalysis;
  selectedRange: 30 | 90 | 365;
  onRangeChange: (range: 30 | 90 | 365) => void;
}) {
  const topHabits = [...analysis.items]
    .filter((item) => item.eventDays > 0)
    .sort((left, right) => right.eventDays - left.eventDays)
    .slice(0, 6);
  const strongest = analysis.correlations
    .filter((correlation) => correlation.quality === "ok" && correlation.delta !== null)
    .slice(0, 6);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardDescription>Habit-Analyse</CardDescription>
            <CardTitle className="mt-1 text-2xl">Muster & mögliche Zusammenhänge</CardTitle>
          </div>
          <div className="flex rounded-md border bg-background p-1">
            {[30, 90, 365].map((range) => (
              <Button
                key={range}
                variant={selectedRange === range ? "default" : "ghost"}
                size="sm"
                onClick={() => onRangeChange(range as 30 | 90 | 365)}
              >
                {range} Tage
              </Button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Zeitraum {analysis.startDate} bis {analysis.endDate}. Toggle an bedeutet: Ereignis passiert. Korrelationen sind Hinweise, keine Ursache.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topHabits.map((habit) => (
            <div key={habit.clientId} className="rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{habit.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {habit.eventDays} Ereignistage · {formatPercent(habit.eventRate)}
                  </div>
                </div>
                {!habit.isActive && <Badge variant="secondary">archiviert</Badge>}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <MiniStat label="Aktuell" value={`${habit.currentStreak} d`} />
                <MiniStat label="Längste" value={`${habit.longestStreak} d`} />
                <MiniStat label="Tracking" value={formatPercent(habit.trackingRate)} />
              </div>
              <div className="mt-3 flex gap-1">
                {habit.weekdays.map((weekday) => (
                  <div key={weekday.weekday} className="grid flex-1 gap-1 text-center">
                    <div className="h-12 rounded-sm bg-muted">
                      <div
                        className="mt-auto h-full rounded-sm bg-primary/70"
                        style={{ transform: `scaleY(${weekday.eventRate})`, transformOrigin: "bottom" }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{weekday.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Mögliche Zusammenhänge</h3>
            <Badge variant="outline">{strongest.length} Hinweise</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {strongest.map((correlation) => (
              <CorrelationCard key={`${correlation.habitClientId}-${correlation.metric}-${correlation.timing}`} correlation={correlation} />
            ))}
            {strongest.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Für dieses Zeitfenster gibt es noch nicht genug Ereignis- und Vergleichstage für robuste Hinweise.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {analysis.notes.join(" ")}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2 py-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function CorrelationCard({ correlation }: { correlation: HabitCorrelation }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">
            {correlation.timing === "nextDay" ? "Folgetag" : "Gleicher Tag"} · {correlation.metricLabel}
          </div>
          <div className="font-semibold">{correlation.habitName}</div>
        </div>
        <Badge variant={Math.abs(correlation.delta ?? 0) > 0 ? "secondary" : "outline"}>
          {formatDelta(correlation.delta, correlation.unit)}
        </Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{correlation.summary}</p>
      <div className="mt-3 text-xs text-muted-foreground">
        Ereignistage: {correlation.eventDays} · Vergleichstage: {correlation.comparisonDays}
      </div>
    </div>
  );
}

function HabitToggle({
  habit,
  completed,
  disabled,
  onToggle
}: {
  habit: HabitDefinition;
  completed: boolean;
  disabled: boolean;
  onToggle: (completed: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(!completed)}
      className="flex items-center justify-between gap-4 rounded-md border bg-background p-3 text-left transition hover:bg-accent disabled:opacity-60"
    >
      <span className="text-sm font-medium">{habit.name}</span>
      <span
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition",
          completed ? "bg-primary" : "bg-muted-foreground/40"
        ].join(" ")}
        aria-hidden="true"
      >
        <span
          className={[
            "absolute top-1 h-4 w-4 rounded-full bg-background shadow-sm transition",
            completed ? "left-6" : "left-1"
          ].join(" ")}
        />
      </span>
    </button>
  );
}

async function fetchHabitDay(date: string) {
  const response = await fetch(`/api/habits?date=${date}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<HabitDay>;
}

async function fetchHabitAnalysis(date: string, rangeDays: 30 | 90 | 365) {
  const response = await fetch(`/api/habits/analysis?date=${date}&rangeDays=${rangeDays}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<HabitAnalysis>;
}

function upsertEntry(entries: HabitEntry[], nextEntry: HabitEntry) {
  const withoutCurrent = entries.filter(
    (entry) => !(entry.date === nextEntry.date && entry.habitClientId === nextEntry.habitClientId)
  );
  return [...withoutCurrent, nextEntry];
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTitle(dateKey: string) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDelta(value: number | null, unit: string) {
  if (value === null) return "n/a";
  const formatted = Math.abs(value) >= 100 ? Math.round(value).toLocaleString("de-DE") : value.toFixed(1);
  return `${value >= 0 ? "+" : "-"}${formatted.replace("-", "")}${unit ? ` ${unit}` : ""}`;
}
