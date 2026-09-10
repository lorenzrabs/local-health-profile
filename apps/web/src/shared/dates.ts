// Habit dates and HealthKit timestamps share the user's calendar day, including DST.
export const HEALTH_TIME_ZONE = "Europe/Berlin";
const calendar = new Intl.DateTimeFormat("sv-SE", {
  timeZone: HEALTH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: HEALTH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function localDate(value: Date | string = new Date()) {
  return calendar.format(new Date(value));
}
export function shiftDate(day: string, offset: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function localInstant(day: string, hour = 0) {
  const target = Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);
  let instant = target;
  for (let n = 0; n < 3; n++) {
    const p = Object.fromEntries(
      clock.formatToParts(new Date(instant)).map((p) => [p.type, p.value]),
    );
    const wall = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    instant = target - (wall - instant);
  }
  return new Date(instant).toISOString();
}
export function dateKeys(start: string, end: string) {
  const out: string[] = [];
  for (let d = start; d <= end; d = shiftDate(d, 1)) out.push(d);
  return out;
}
