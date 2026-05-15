import { scaleRecipe } from "../shared/recipeScaling";
import type { Recipe, RecipeItem, RecipeNutrient } from "../shared/types";
import type { AppDatabase } from "./db";

type RecipeRow = {
  id: number;
  name: string;
  category: string;
  instructions: string | null;
  prep_notes: string | null;
  serving_base: number;
};

type RecipeItemRow = {
  recipe_id: number;
  name: string;
  amount: number;
  unit: string;
  exclude_from_nutrition: number;
};

type RecipeNutrientRow = {
  recipe_id: number;
  nutrient_key: string;
  label: string;
  amount_per_serving: number;
  unit: string;
  category: "macro" | "micro";
};

export function getRecipes(db: AppDatabase, servings = 1): Recipe[] {
  const recipes = db
    .prepare(
      `SELECT id, name, category, instructions, prep_notes, serving_base
       FROM recipes
       WHERE is_active = 1
       ORDER BY
         CASE category
           WHEN 'breakfast' THEN 0
           WHEN 'beverage' THEN 1
           WHEN 'smoothie' THEN 2
           ELSE 3
         END,
         name`
    )
    .all() as RecipeRow[];

  if (recipes.length === 0) return [];

  const items = db
    .prepare(
      `SELECT recipe_id, name, amount, unit, exclude_from_nutrition
       FROM recipe_items
       ORDER BY recipe_id, id`
    )
    .all() as RecipeItemRow[];
  const nutrients = db
    .prepare(
      `SELECT recipe_id, nutrient_key, label, amount_per_serving, unit, category
       FROM recipe_nutrients
       ORDER BY recipe_id,
         CASE category WHEN 'macro' THEN 0 ELSE 1 END,
         id`
    )
    .all() as RecipeNutrientRow[];

  return recipes.map((recipe) =>
    scaleRecipe(
      {
        id: recipe.id,
        name: recipe.name,
        category: recipe.category,
        instructions: recipe.instructions ?? "",
        prepNotes: recipe.prep_notes ?? "",
        servingBase: recipe.serving_base,
        items: items
          .filter((item) => item.recipe_id === recipe.id)
          .map(
            (item): RecipeItem => ({
              name: item.name,
              amount: item.amount,
              unit: item.unit,
              excludeFromNutrition: Boolean(item.exclude_from_nutrition)
            })
          ),
        nutrientsPerServing: nutrients
          .filter((nutrient) => nutrient.recipe_id === recipe.id)
          .map(
            (nutrient): RecipeNutrient => ({
              key: nutrient.nutrient_key,
              label: nutrient.label,
              amount: nutrient.amount_per_serving,
              unit: nutrient.unit,
              category: nutrient.category
            })
          ),
        servingsApplied: 1,
        scaledItems: [],
        scaledNutrients: []
      },
      servings
    )
  );
}
