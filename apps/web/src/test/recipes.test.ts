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
      "Super-Veggie-Bowl mit Beluga-Linsen + Eiern"
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

    const bowl = getRecipes(db, 3).find((recipe) => recipe.name === "Super-Veggie-Bowl mit Beluga-Linsen + Eiern");

    expect(bowl?.category).toBe("lunch");
    expect(bowl?.scaledItems.find((item) => item.name === "Beluga-Linsen, trocken")?.totalAmount).toBe(135);
    expect(bowl?.scaledItems.find((item) => item.name === "Brokkoli")?.totalAmount).toBe(750);
    expect(bowl?.scaledItems.find((item) => item.name === "Eier")?.totalAmount).toBe(6);
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "calories")?.totalAmount).toBe(2046);
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "protein")?.totalAmount).toBe(121.5);
    expect(bowl?.scaledNutrients.find((nutrient) => nutrient.key === "choline")?.totalAmount).toBe(885);
  });

  it("normalizes custom serving input safely", () => {
    expect(normalizeServings(Number.NaN)).toBe(1);
    expect(normalizeServings(0)).toBe(1);
    expect(normalizeServings(3.4)).toBe(3);
    expect(normalizeServings(120)).toBe(99);
  });
});
