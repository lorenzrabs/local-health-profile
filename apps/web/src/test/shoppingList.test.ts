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
});
