import { expect, it } from "vitest";
import { habitAction } from "../client/components/dashboard/habitAction";
it("does not recommend alcohol, smoking or harder training because of a lower pulse", () => {
  for (const name of ["Alkohol", "Rauchen", "Krafttraining"])
    expect(habitAction(name, -3)).toContain(
      "bevor du die Gewohnheit veränderst",
    );
  expect(habitAction("Späte Mahlzeit", 3)).toContain("früher");
  expect(habitAction("Spaziergang", -2)).toContain("Spaziergang");
});
