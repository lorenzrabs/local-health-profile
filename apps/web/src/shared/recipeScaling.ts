import type { Recipe, RecipeScaledItem, RecipeScaledNutrient } from "./types";

export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  const normalizedServings = normalizeServings(servings);
  const factor = normalizedServings / recipe.servingBase;

  return {
    ...recipe,
    servingsApplied: normalizedServings,
    scaledItems: recipe.items.map((item): RecipeScaledItem => ({
      ...item,
      totalAmount: roundValue(item.amount * factor)
    })),
    scaledNutrients: recipe.nutrientsPerServing.map((nutrient): RecipeScaledNutrient => ({
      ...nutrient,
      totalAmount: roundValue(nutrient.amount * factor)
    }))
  };
}

export function normalizeServings(value: number, max = 99) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, Math.round(value)));
}

function roundValue(value: number) {
  return Math.round(value * 100) / 100;
}
