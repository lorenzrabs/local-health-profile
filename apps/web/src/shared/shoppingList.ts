import { scaleRecipe } from "./recipeScaling";
import type { Recipe, ShoppingListExportItem, ShoppingListSourceSnapshot } from "./types";

export type RecipeSelection = {
  recipe: Recipe;
  portions: number;
};

export type GeneratedShoppingList = {
  title: string;
  items: ShoppingListExportItem[];
  sourceSnapshot: ShoppingListSourceSnapshot;
};

export function generateShoppingList(selections: RecipeSelection[], generatedAt = new Date().toISOString()): GeneratedShoppingList {
  const merged = new Map<string, ShoppingListExportItem>();

  for (const selection of selections) {
    const scaled = scaleRecipe(selection.recipe, selection.portions);
    for (const item of scaled.scaledItems) {
      const name = item.name.trim();
      if (!name) continue;

      const unit = item.unit.trim();
      const category = categorizeIngredient(name);
      const key = `${normalizeIngredientName(name)}|${unit.toLowerCase()}|${category}`;
      const existing = merged.get(key);
      if (existing) {
        existing.amount = roundAmount((existing.amount ?? 0) + item.totalAmount);
        existing.sourceRecipeNames = unique([...(existing.sourceRecipeNames ?? []), selection.recipe.name]);
        if (item.excludeFromNutrition) {
          existing.note = "In Rezept sichtbar, nicht in Nährwerten enthalten.";
        }
      } else {
        merged.set(key, {
          id: `item_${slugify(`${name}-${unit}-${category}`)}`,
          name,
          amount: roundAmount(item.totalAmount),
          unit,
          category,
          note: item.excludeFromNutrition ? "In Rezept sichtbar, nicht in Nährwerten enthalten." : undefined,
          sourceRecipeNames: [selection.recipe.name]
        });
      }
    }
  }

  return {
    title: "Einkaufsliste",
    items: Array.from(merged.values()).sort(compareItems),
    sourceSnapshot: {
      generatedAt,
      recipes: selections.map(({ recipe, portions }) => ({
        id: recipe.id,
        name: recipe.name,
        portions
      }))
    }
  };
}

export function groupShoppingListItems(items: ShoppingListExportItem[]) {
  const groups = new Map<string, ShoppingListExportItem[]>();
  for (const item of items) {
    const category = item.category || "Sonstiges";
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }

  return SHOPPING_CATEGORIES.map((category) => ({
    category,
    items: groups.get(category) ?? []
  })).filter((group) => group.items.length > 0);
}

export function formatShoppingItemAmount(item: Pick<ShoppingListExportItem, "amount" | "unit">) {
  if (item.amount === undefined || item.unit === undefined || item.unit === "") return "";
  return `${formatNumber(item.amount)} ${item.unit}`;
}

export const SHOPPING_CATEGORIES = ["Obst & Gemüse", "Milchprodukte", "Trockenwaren", "Fleisch/Fisch", "Sonstiges"] as const;

function categorizeIngredient(name: string) {
  const normalized = normalizeIngredientName(name);
  if (["paprikapulver"].some((needle) => normalized.includes(needle))) {
    return "Sonstiges";
  }

  if (
    [
      "heidelbeeren",
      "brombeeren",
      "banane",
      "avocado",
      "spinat",
      "apfel",
      "birne",
      "zitronensaft",
      "zitrone",
      "brokkoli",
      "blumenkohl",
      "champignons",
      "knoblauch",
      "gurke",
      "ingwer",
      "paprika",
      "tomaten",
      "zwiebel",
      "erdbeeren",
      "kiwi"
    ].some((needle) => normalized.includes(needle))
  ) {
    return "Obst & Gemüse";
  }

  if (["milch", "joghurt", "skyr", "feta"].some((needle) => normalized.includes(needle))) {
    return "Milchprodukte";
  }

  if (
    ["haferflocken", "chiasamen", "whey", "inulin", "kreatin", "zucker", "linsen", "kichererbsen", "quinoa", "reis", "rosinen", "mandeln", "nüsse"].some(
      (needle) => normalized.includes(needle)
    )
  ) {
    return "Trockenwaren";
  }

  if (["lachs"].some((needle) => normalized.includes(needle))) {
    return "Fleisch/Fisch";
  }

  return "Sonstiges";
}

function compareItems(left: ShoppingListExportItem, right: ShoppingListExportItem) {
  const categoryDelta = SHOPPING_CATEGORIES.indexOf((left.category ?? "Sonstiges") as (typeof SHOPPING_CATEGORIES)[number]) -
    SHOPPING_CATEGORIES.indexOf((right.category ?? "Sonstiges") as (typeof SHOPPING_CATEGORIES)[number]);
  if (categoryDelta !== 0) return categoryDelta;
  return left.name.localeCompare(right.name, "de");
}

function normalizeIngredientName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
