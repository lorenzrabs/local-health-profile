import { describe, expect, it } from "vitest";
import { openDatabase } from "../server/db";
import { getRecipes } from "../server/recipes";
import { generateShoppingList, groupShoppingListItems } from "../shared/shoppingList";

describe("shopping list generation", () => {
  it("merges same ingredient names and units while preserving recipe sources", () => {
    const db = openDatabase(":memory:");
    const allRecipes = getRecipes(db, 1);
    const recipes = ["Skyr-Berry-Protein-Jar", "Griechischer-Joghurt-2%-Jar"].map((name) => {
      const recipe = allRecipes.find((item) => item.name === name);
      if (!recipe) throw new Error(`Missing recipe ${name}`);
      return recipe;
    });

    const list = generateShoppingList(recipes.map((recipe) => ({ recipe, portions: 2 })), "2026-04-25T10:00:00.000Z");
    const oats = list.items.find((item) => item.name === "Haferflocken");

    expect(oats?.amount).toBe(160);
    expect(oats?.unit).toBe("g");
    expect(oats?.category).toBe("Trockenwaren");
    expect(oats?.sourceRecipeNames).toEqual(["Skyr-Berry-Protein-Jar", "Griechischer-Joghurt-2%-Jar"]);
    expect(list.sourceSnapshot.recipes).toEqual([
      { id: recipes[0].id, name: "Skyr-Berry-Protein-Jar", portions: 2 },
      { id: recipes[1].id, name: "Griechischer-Joghurt-2%-Jar", portions: 2 }
    ]);
  });

  it("respects portion scaling and groups preview categories", () => {
    const db = openDatabase(":memory:");
    const recipe = getRecipes(db, 1).find((item) => item.name === "Milch-Only Overnight Oats");
    if (!recipe) throw new Error("Missing recipe");

    const list = generateShoppingList([{ recipe, portions: 4 }]);
    const milk = list.items.find((item) => item.name === "Milch 3,8 %");
    const groups = groupShoppingListItems(list.items);

    expect(milk?.amount).toBe(1200);
    expect(groups.some((group) => group.category === "Milchprodukte")).toBe(true);
    expect(groups.some((group) => group.category === "Obst & Gemüse")).toBe(true);
  });

  it("categorizes Quinoa-Salat kitchen-measure ingredients for shopping lists", () => {
    const db = openDatabase(":memory:");
    const recipe = getRecipes(db, 1).find((item) => item.name === "Quinoa-Salat mit Feta");
    if (!recipe) throw new Error("Missing recipe");

    const list = generateShoppingList([{ recipe, portions: 2 }]);
    const quinoa = list.items.find((item) => item.name === "Quinoa, trocken");
    const feta = list.items.find((item) => item.name === "Feta");
    const cucumber = list.items.find((item) => item.name === "Gurke");
    const onion = list.items.find((item) => item.name === "Rote Zwiebel");

    expect(quinoa).toMatchObject({ amount: 120, unit: "g", category: "Trockenwaren" });
    expect(feta).toMatchObject({ amount: 100, unit: "g", category: "Milchprodukte" });
    expect(cucumber).toMatchObject({ amount: 0.5, unit: "Stück", category: "Obst & Gemüse" });
    expect(onion).toMatchObject({ amount: 0.5, unit: "Stück", category: "Obst & Gemüse" });
  });

  it("keeps the smaller Super-Veggie-Bowl kitchen measures useful in shopping lists", () => {
    const db = openDatabase(":memory:");
    const recipe = getRecipes(db, 1).find((item) => item.name === "Super-Veggie-Bowl mit Beluga-Linsen");
    if (!recipe) throw new Error("Missing recipe");

    const list = generateShoppingList([{ recipe, portions: 2 }]);
    const broccoli = list.items.find((item) => item.name === "Brokkoli");
    const cauliflower = list.items.find((item) => item.name === "Blumenkohl");
    const mushrooms = list.items.find((item) => item.name === "Champignons");

    expect(broccoli).toMatchObject({ amount: 1, unit: "kleiner Kopf", category: "Obst & Gemüse" });
    expect(cauliflower).toMatchObject({ amount: 0.5, unit: "kleiner Kopf", category: "Obst & Gemüse" });
    expect(mushrooms).toMatchObject({ amount: 200, unit: "g", category: "Obst & Gemüse" });
  });

  it("categorizes Kichererbsen-Spinat-Tomaten-Pfanne ingredients for shopping lists", () => {
    const db = openDatabase(":memory:");
    const recipe = getRecipes(db, 1).find((item) => item.name === "Kichererbsen-Spinat-Tomaten-Pfanne mit Feta");
    if (!recipe) throw new Error("Missing recipe");

    const list = generateShoppingList([{ recipe, portions: 2 }]);
    const chickpeas = list.items.find((item) => item.name === "Kichererbsen, abgetropft");
    const tomatoes = list.items.find((item) => item.name === "Geschälte Tomaten");
    const spinach = list.items.find((item) => item.name === "Spinat");
    const feta = list.items.find((item) => item.name === "Feta");

    expect(chickpeas).toMatchObject({ amount: 240, unit: "g", category: "Trockenwaren" });
    expect(tomatoes).toMatchObject({ amount: 0.5, unit: "Dose", category: "Obst & Gemüse" });
    expect(spinach).toMatchObject({ amount: 200, unit: "g", category: "Obst & Gemüse" });
    expect(feta).toMatchObject({ amount: 100, unit: "g", category: "Milchprodukte" });
  });

  it("categorizes Ofenlachs mit Brokkoli, Paprika & Reis ingredients for shopping lists", () => {
    const db = openDatabase(":memory:");
    const recipe = getRecipes(db, 1).find((item) => item.name === "Ofenlachs mit Brokkoli, Paprika & Reis");
    if (!recipe) throw new Error("Missing recipe");

    const list = generateShoppingList([{ recipe, portions: 2 }]);
    const salmon = list.items.find((item) => item.name === "Lachsfilet");
    const rice = list.items.find((item) => item.name === "Reis, trocken");
    const broccoli = list.items.find((item) => item.name === "Brokkoli");
    const bellPepper = list.items.find((item) => item.name === "Paprika");
    const paprikaPowder = list.items.find((item) => item.name === "Paprikapulver edelsüß");

    expect(salmon).toMatchObject({ amount: 250, unit: "g", category: "Fleisch/Fisch" });
    expect(rice).toMatchObject({ amount: 120, unit: "g", category: "Trockenwaren" });
    expect(broccoli).toMatchObject({ amount: 1, unit: "kleiner Kopf", category: "Obst & Gemüse" });
    expect(bellPepper).toMatchObject({ amount: 1, unit: "Stück", category: "Obst & Gemüse" });
    expect(paprikaPowder).toMatchObject({ amount: 1, unit: "TL", category: "Sonstiges" });
  });
});
