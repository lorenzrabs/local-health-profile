import { describe, expect, it } from "vitest";
import { openDatabase } from "../server/db";
import { getRecipes } from "../server/recipes";
import { normalizeServings } from "../shared/recipeScaling";

describe("recipes", () => {
  it("seeds the new breakfast meal-prep recipes and archives the old Waldfruchtjoghurt default", () => {
    const db = openDatabase(":memory:");

    const recipes = getRecipes(db, 1);

    expect(recipes.map((recipe) => recipe.name)).toEqual([
      "Griechischer-Joghurt-2%-Jar",
      "Milch-Only Overnight Oats",
      "Skyr-Berry-Protein-Jar",
      "Cappuccino",
      "Green Smoothie",
      "Kichererbsen-Spinat-Tomaten-Pfanne mit Feta",
      "Ofenlachs mit Brokkoli, Paprika & Reis",
      "Quinoa-Salat mit Feta",
      "Super-Veggie-Bowl mit Beluga-Linsen"
    ]);
    expect(recipes.some((recipe) => recipe.name === "Waldfruchtjoghurt")).toBe(false);
  });

  it("scales items and nutrients linearly for requested servings", () => {
    const db = openDatabase(":memory:");

    const skyrJar = getRecipes(db, 4).find((recipe) => recipe.name === "Skyr-Berry-Protein-Jar");

    expect(skyrJar?.servingsApplied).toBe(4);
    expect(skyrJar?.scaledItems.find((item) => item.name === "Skyr")?.totalAmount).toBe(800);
    expect(skyrJar?.scaledItems.find((item) => item.name === "Milch 3,8 %")?.totalAmount).toBe(200);
    expect(skyrJar?.scaledItems.find((item) => item.name === "Kreatin Monohydrat")).toMatchObject({
      totalAmount: 20,
      excludeFromNutrition: true
    });
    expect(skyrJar?.scaledNutrients.find((nutrient) => nutrient.key === "protein")?.totalAmount).toBe(198.8);
    expect(skyrJar?.scaledNutrients.find((nutrient) => nutrient.key === "calcium")?.totalAmount).toBe(2136);
  });

  it("keeps cappuccino as a separate recipe with its own micros", () => {
    const db = openDatabase(":memory:");

    const cappuccino = getRecipes(db, 3).find((recipe) => recipe.name === "Cappuccino");

    expect(cappuccino?.category).toBe("beverage");
    expect(cappuccino?.scaledItems.find((item) => item.name === "Milch 3,8 %")?.totalAmount).toBe(510);
    expect(cappuccino?.scaledNutrients.find((nutrient) => nutrient.key === "calories")?.totalAmount).toBe(351);
    expect(cappuccino?.scaledNutrients.find((nutrient) => nutrient.key === "protein")?.totalAmount).toBe(16.8);
    expect(cappuccino?.scaledNutrients.find((nutrient) => nutrient.key === "carbs")?.totalAmount).toBe(33.6);
    expect(cappuccino?.scaledNutrients.find((nutrient) => nutrient.key === "fat")?.totalAmount).toBe(19.5);
    expect(cappuccino?.scaledNutrients.find((nutrient) => nutrient.key === "vitamin_b12")?.totalAmount).toBe(2.4);
  });

  it("seeds the updated Green Smoothie with macros and micros", () => {
    const db = openDatabase(":memory:");

    const smoothie = getRecipes(db, 2).find((recipe) => recipe.name === "Green Smoothie");

    expect(smoothie?.scaledItems.find((item) => item.name === "Banane ca. 120 g")?.totalAmount).toBe(2);
    expect(smoothie?.scaledItems.find((item) => item.name === "Avocado ca. 75 g")?.totalAmount).toBe(1);
    expect(smoothie?.scaledItems.find((item) => item.name === "Apfel ca. 90 g")?.totalAmount).toBe(1);
    expect(smoothie?.scaledItems.find((item) => item.name === "Zitronensaft ca. 20 g")?.totalAmount).toBe(1);
    expect(smoothie?.scaledItems.find((item) => item.name === "Whey")?.totalAmount).toBe(50);
    expect(smoothie?.scaledItems.find((item) => item.name === "Haferflocken")?.totalAmount).toBe(60);
    expect(smoothie?.scaledNutrients.find((nutrient) => nutrient.key === "calories")?.totalAmount).toBe(1400);
    expect(smoothie?.scaledNutrients.find((nutrient) => nutrient.key === "potassium")?.totalAmount).toBe(3900);
    expect(smoothie?.scaledNutrients.find((nutrient) => nutrient.key === "folate")?.totalAmount).toBe(480);
  });

  it("seeds the Super-Veggie-Bowl as a scalable lunch recipe", () => {
    const db = openDatabase(":memory:");

    const bowl = getRecipes(db, 3).find((recipe) => recipe.name === "Super-Veggie-Bowl mit Beluga-Linsen");

    expect(bowl?.category).toBe("lunch");
    expect(bowl?.scaledItems.find((item) => item.name === "Beluga-Linsen, trocken")?.totalAmount).toBe(105);
    expect(bowl?.scaledItems.find((item) => item.name === "Brokkoli")?.totalAmount).toBe(1.5);
    expect(bowl?.scaledItems.find((item) => item.name === "Brokkoli")?.unit).toBe("kleiner Kopf");
    expect(bowl?.scaledItems.find((item) => item.name === "Blumenkohl")?.totalAmount).toBe(0.75);
    expect(bowl?.scaledItems.find((item) => item.name === "Blumenkohl")?.unit).toBe("kleiner Kopf");
    expect(bowl?.scaledItems.find((item) => item.name === "Hummus")).toBeUndefined();
    expect(bowl?.scaledItems.find((item) => item.name === "Eier")).toBeUndefined();
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "calories")?.totalAmount).toBe(1335);
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "protein")?.totalAmount).toBe(60);
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "carbs")?.totalAmount).toBe(129);
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "fat")?.totalAmount).toBe(69);
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "fiber")?.totalAmount).toBe(48);
  });

  it("seeds the Quinoa-Salat mit Feta with kitchen-measure vegetables", () => {
    const db = openDatabase(":memory:");

    const salad = getRecipes(db, 2).find((recipe) => recipe.name === "Quinoa-Salat mit Feta");

    expect(salad?.category).toBe("lunch");
    expect(salad?.scaledItems.find((item) => item.name === "Quinoa, trocken")?.totalAmount).toBe(120);
    expect(salad?.scaledItems.find((item) => item.name === "Feta")?.totalAmount).toBe(100);
    expect(salad?.scaledItems.find((item) => item.name === "Gurke")?.totalAmount).toBe(0.5);
    expect(salad?.scaledItems.find((item) => item.name === "Paprika")?.totalAmount).toBe(1);
    expect(salad?.scaledItems.find((item) => item.name === "Rote Zwiebel")?.totalAmount).toBe(0.5);
    expect(salad?.scaledNutrients.find((nutrient) => nutrient.key === "calories")?.totalAmount).toBe(1074);
    expect(salad?.scaledNutrients.find((nutrient) => nutrient.key === "protein")?.totalAmount).toBe(36.4);
    expect(salad?.scaledNutrients.find((nutrient) => nutrient.key === "salt")?.totalAmount).toBe(2.4);
  });

  it("seeds the Kichererbsen-Spinat-Tomaten-Pfanne mit Feta as a scalable lunch recipe", () => {
    const db = openDatabase(":memory:");

    const pan = getRecipes(db, 2).find((recipe) => recipe.name === "Kichererbsen-Spinat-Tomaten-Pfanne mit Feta");

    expect(pan?.category).toBe("lunch");
    expect(pan?.scaledItems.find((item) => item.name === "Kichererbsen, abgetropft")?.totalAmount).toBe(240);
    expect(pan?.scaledItems.find((item) => item.name === "Zwiebel")?.totalAmount).toBe(1);
    expect(pan?.scaledItems.find((item) => item.name === "Geschälte Tomaten")?.totalAmount).toBe(0.5);
    expect(pan?.scaledItems.find((item) => item.name === "Feta")?.totalAmount).toBe(100);
    expect(pan?.scaledItems.find((item) => item.name === "Salz")).toBeUndefined();
    expect(pan?.scaledNutrients.find((nutrient) => nutrient.key === "calories")?.totalAmount).toBe(930);
    expect(pan?.scaledNutrients.find((nutrient) => nutrient.key === "protein")?.totalAmount).toBe(42);
    expect(pan?.scaledNutrients.find((nutrient) => nutrient.key === "salt")?.totalAmount).toBe(3);
  });

  it("seeds the Ofenlachs mit Brokkoli, Paprika & Reis as a scalable lunch recipe", () => {
    const db = openDatabase(":memory:");

    const salmon = getRecipes(db, 2).find((recipe) => recipe.name === "Ofenlachs mit Brokkoli, Paprika & Reis");

    expect(salmon?.category).toBe("lunch");
    expect(salmon?.scaledItems.find((item) => item.name === "Lachsfilet")?.totalAmount).toBe(250);
    expect(salmon?.scaledItems.find((item) => item.name === "Reis, trocken")?.totalAmount).toBe(120);
    expect(salmon?.scaledItems.find((item) => item.name === "Brokkoli")?.totalAmount).toBe(1);
    expect(salmon?.scaledItems.find((item) => item.name === "Paprika")?.totalAmount).toBe(1);
    expect(salmon?.scaledItems.find((item) => item.name === "Salz")).toBeUndefined();
    expect(salmon?.scaledNutrients.find((nutrient) => nutrient.key === "calories")?.totalAmount).toBe(1120);
    expect(salmon?.scaledNutrients.find((nutrient) => nutrient.key === "protein")?.totalAmount).toBe(66);
    expect(salmon?.scaledNutrients.find((nutrient) => nutrient.key === "fiber")?.totalAmount).toBe(14);
  });

  it("normalizes custom serving input safely", () => {
    expect(normalizeServings(Number.NaN)).toBe(1);
    expect(normalizeServings(0)).toBe(1);
    expect(normalizeServings(3.4)).toBe(3);
    expect(normalizeServings(120)).toBe(99);
  });
});
