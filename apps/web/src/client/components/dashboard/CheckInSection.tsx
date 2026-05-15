import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { DailyCheckInInput, DashboardToday } from "../../../shared/types";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Textarea } from "../ui/textarea";

const today = new Date().toISOString().slice(0, 10);

export function CheckInSection({
  checkIn,
  saving,
  onSubmit
}: {
  checkIn: DashboardToday["checkIn"];
  saving: boolean;
  onSubmit: (input: DailyCheckInInput) => Promise<void>;
}) {
  const [form, setForm] = useState({
    cigarettes: String(checkIn?.cigarettes ?? 0),
    painAreas: checkIn?.painAreas.join(", ") ?? "",
    energy: String(checkIn?.energy ?? 3),
    soreness: String(checkIn?.soreness ?? 3),
    perceivedRecovery: String(checkIn?.perceivedRecovery ?? 3),
    sleepQuality: String(checkIn?.sleepQuality ?? 3),
    proteinOk: checkIn?.proteinOk ?? false,
    creatineTaken: checkIn?.creatineTaken ?? false,
    inulinTaken: checkIn?.inulinTaken ?? false,
    broccoliOrCruciferous: checkIn?.broccoliOrCruciferous ?? false,
    lentilsOrLegumes: checkIn?.lentilsOrLegumes ?? false,
    hydrationOk: checkIn?.hydrationOk ?? false,
    plannedTraining: checkIn?.plannedTraining ?? "",
    notes: checkIn?.notes ?? ""
  });

  useEffect(() => {
    setForm({
      cigarettes: String(checkIn?.cigarettes ?? 0),
      painAreas: checkIn?.painAreas.join(", ") ?? "",
      energy: String(checkIn?.energy ?? 3),
      soreness: String(checkIn?.soreness ?? 3),
      perceivedRecovery: String(checkIn?.perceivedRecovery ?? 3),
      sleepQuality: String(checkIn?.sleepQuality ?? 3),
      proteinOk: checkIn?.proteinOk ?? false,
      creatineTaken: checkIn?.creatineTaken ?? false,
      inulinTaken: checkIn?.inulinTaken ?? false,
      broccoliOrCruciferous: checkIn?.broccoliOrCruciferous ?? false,
      lentilsOrLegumes: checkIn?.lentilsOrLegumes ?? false,
      hydrationOk: checkIn?.hydrationOk ?? false,
      plannedTraining: checkIn?.plannedTraining ?? "",
      notes: checkIn?.notes ?? ""
    });
  }, [checkIn]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <section>
      <Card>
        <CardHeader>
          <CardDescription>Daily Check-in</CardDescription>
          <CardTitle className="text-2xl">Subjektiver Kontext</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit({
                date: today,
                cigarettes: Number(form.cigarettes),
                painAreas: form.painAreas
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
                energy: Number(form.energy),
                soreness: Number(form.soreness),
                perceivedRecovery: Number(form.perceivedRecovery),
                sleepQuality: Number(form.sleepQuality),
                proteinOk: form.proteinOk,
                creatineTaken: form.creatineTaken,
                inulinTaken: form.inulinTaken,
                broccoliOrCruciferous: form.broccoliOrCruciferous,
                lentilsOrLegumes: form.lentilsOrLegumes,
                hydrationOk: form.hydrationOk,
                plannedTraining: form.plannedTraining,
                notes: form.notes
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput label="Zigaretten" value={form.cigarettes} onChange={(value) => update("cigarettes", value)} />
              <TextInput label="Schmerzbereiche" value={form.painAreas} onChange={(value) => update("painAreas", value)} />
              <RangeInput label="Energie" value={form.energy} onChange={(value) => update("energy", value)} />
              <RangeInput label="Muskelmüdigkeit" value={form.soreness} onChange={(value) => update("soreness", value)} />
              <RangeInput label="Erholung" value={form.perceivedRecovery} onChange={(value) => update("perceivedRecovery", value)} />
              <RangeInput label="Schlafqualität" value={form.sleepQuality} onChange={(value) => update("sleepQuality", value)} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <CheckField label="Protein ok" checked={form.proteinOk} onChange={(value) => update("proteinOk", value)} />
              <CheckField label="Kreatin genommen" checked={form.creatineTaken} onChange={(value) => update("creatineTaken", value)} />
              <CheckField label="Inulin genommen" checked={form.inulinTaken} onChange={(value) => update("inulinTaken", value)} />
              <CheckField label="Brokkoli/Blumenkohl" checked={form.broccoliOrCruciferous} onChange={(value) => update("broccoliOrCruciferous", value)} />
              <CheckField label="Linsen/Leguminosen" checked={form.lentilsOrLegumes} onChange={(value) => update("lentilsOrLegumes", value)} />
              <CheckField label="Hydration ok" checked={form.hydrationOk} onChange={(value) => update("hydrationOk", value)} />
            </div>
            <TextInput label="Geplantes Training" value={form.plannedTraining} onChange={(value) => update("plannedTraining", value)} />
            <div className="grid gap-2">
              <Label>Notizen</Label>
              <Textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} />
            </div>
            <Button disabled={saving} className="w-fit">
              <Save className="h-4 w-4" />
              {saving ? "Speichert..." : "Check-in speichern"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function RangeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const numberValue = Number(value);
  return (
    <div className="grid gap-3">
      <Label>
        {label}: {value}/5
      </Label>
      <Slider min={1} max={5} step={1} value={[numberValue]} onValueChange={([next]) => onChange(String(next))} />
    </div>
  );
}

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-md border bg-background p-3 text-sm font-medium">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {label}
    </label>
  );
}
