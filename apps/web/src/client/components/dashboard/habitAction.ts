// Conservative actions: never recommend a substance or extra training intensity from an association.
export function habitAction(name: string, delta: number) {
  const n = name.toLocaleLowerCase("de-DE");
  if (
    delta > 0 &&
    /mahlzeit|snack|abendessen/.test(n) &&
    /spät|nach|abend/.test(n)
  )
    return "Eine große Abendmahlzeit früher einplanen. Für zwei Wochen Zeitpunkt und Folgetagswerte erfassen.";
  if (delta > 0 && /kaffee|koffein/.test(n) && /nach|spät|abend/.test(n))
    return "Koffein in die erste Tageshälfte legen und den Schlafrhythmus dabei möglichst konstant halten.";
  if (delta > 0 && /alkohol/.test(n) && !/kein|ohne|frei/.test(n))
    return "Alkoholfreie Abende einplanen und Schlaf sowie Folgetagswerte weiter erfassen.";
  if (delta < 0 && /spazier|gehen|schritte/.test(n))
    return "Einen regelmäßigen Spaziergang fest einplanen und beobachten, ob das Muster bestehen bleibt.";
  if (delta < 0 && /abendroutine|meditation|entspann/.test(n))
    return "Eine kurze, feste Abendroutine beibehalten und Schlaf sowie Folgetagswerte weiter erfassen.";
  return "Für zwei Wochen konsequent Ja oder Nein erfassen. Schlaf und Training mitbeobachten, bevor du die Gewohnheit veränderst.";
}
