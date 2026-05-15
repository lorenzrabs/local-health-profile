import { useEffect, useState } from "react";
import { Check, Minus, Plus, Send, ShoppingBasket, Utensils } from "lucide-react";
import { normalizeServings, scaleRecipe } from "../../../shared/recipeScaling";
import { formatShoppingItemAmount, generateShoppingList, groupShoppingListItems } from "../../../shared/shoppingList";
import type { Recipe, ShoppingListExport } from "../../../shared/types";
import { formatAmount, formatNutrientAmount } from "./format";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";

export function RecipesSection({ recipes }: { recipes: Recipe[] }) {
  const [servingsByRecipeId, setServingsByRecipeId] = useState<Record<number, string>>({});
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<number[]>([]);
  const [pendingExports, setPendingExports] = useState<ShoppingListExport[]>([]);
  const [exportStatus, setExportStatus] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setServingsByRecipeId((current) => {
      const next = { ...current };
      for (const recipe of recipes) {
        next[recipe.id] ??= String(recipe.servingsApplied);
      }
      return next;
    });
  }, [recipes]);

  useEffect(() => {
    loadPendingExports().catch(console.error);
  }, []);

  const selectedRecipes = recipes
    .filter((recipe) => selectedRecipeIds.includes(recipe.id))
    .map((recipe) => ({
      recipe,
      portions: normalizeServings(Number(servingsByRecipeId[recipe.id] ?? recipe.servingsApplied))
    }));
  const shoppingList = generateShoppingList(selectedRecipes);

  function updateServings(recipeId: number, value: string) {
    setServingsByRecipeId((current) => ({ ...current, [recipeId]: value }));
  }

  function commitServings(recipeId: number, next: number) {
    updateServings(recipeId, String(normalizeServings(next)));
  }

  function toggleRecipe(recipeId: number, checked: boolean) {
    setSelectedRecipeIds((current) => checked ? Array.from(new Set([...current, recipeId])) : current.filter((id) => id !== recipeId));
  }

  async function loadPendingExports() {
    const response = await fetch("/api/shopping-list/exports/pending");
    const body = (await response.json()) as { exports: ShoppingListExport[] };
    setPendingExports(body.exports);
  }

  async function exportShoppingList() {
    if (shoppingList.items.length === 0 || isExporting) return;
    setIsExporting(true);
    setExportStatus("");
    try {
      const response = await fetch("/api/shopping-list/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shoppingList)
      });
      if (!response.ok) throw new Error(await response.text());
      setExportStatus("Einkaufsliste bereitgestellt. Öffne die Health Profile App auf deinem iPhone, um sie in Apple Erinnerungen zu übernehmen.");
      await loadPendingExports();
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Export fehlgeschlagen.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Nutrition V1</p>
        <h2 className="text-2xl font-semibold tracking-normal">Rezepte & Meal Prep</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Utensils className="h-5 w-5" />
            Rezepte und Mengen
          </CardTitle>
          <CardDescription>Portionen frei eingeben, Zutaten und Nährwerte skalieren sofort.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={recipes.filter((recipe) => recipe.category === "breakfast").map((recipe) => String(recipe.id))}>
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                servingsText={servingsByRecipeId[recipe.id] ?? String(recipe.servingsApplied)}
                selected={selectedRecipeIds.includes(recipe.id)}
                onServingsTextChange={(value) => updateServings(recipe.id, value)}
                onCommitServings={(value) => commitServings(recipe.id, value)}
                onSelectedChange={(checked) => toggleRecipe(recipe.id, checked)}
              />
            ))}
          </Accordion>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBasket className="h-5 w-5" />
            Einkaufsliste für Apple Erinnerungen
          </CardTitle>
          <CardDescription>
            Wähle Rezepte aus, prüfe die aggregierte Liste und stelle sie dann für die iPhone-App bereit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingExports.length > 0 && (
            <div className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
              {pendingExports.length} Einkaufsliste{pendingExports.length > 1 ? "n warten" : " wartet"} auf Übernahme durch die iOS-App.
            </div>
          )}

          {shoppingList.items.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Markiere oben mindestens ein Rezept, um eine Einkaufsliste zu erzeugen.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {groupShoppingListItems(shoppingList.items).map((group) => (
                <div key={group.category} className="rounded-md border bg-background p-3">
                  <h3 className="text-sm font-semibold">{group.category}</h3>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>
                          <span className="font-medium text-foreground">{formatShoppingItemAmount(item)}</span>{" "}
                          {item.name}
                          {item.sourceRecipeNames && <span className="block text-xs">Quelle: {item.sourceRecipeNames.join(", ")}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" disabled={shoppingList.items.length === 0 || isExporting} onClick={exportShoppingList}>
              <Send className="mr-2 h-4 w-4" />
              {isExporting ? "Wird bereitgestellt..." : "Für Apple Erinnerungen bereitstellen"}
            </Button>
            {exportStatus && <p className="text-sm text-muted-foreground">{exportStatus}</p>}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function RecipeCard({
  recipe,
  servingsText,
  selected,
  onServingsTextChange,
  onCommitServings,
  onSelectedChange
}: {
  recipe: Recipe;
  servingsText: string;
  selected: boolean;
  onServingsTextChange: (value: string) => void;
  onCommitServings: (value: number) => void;
  onSelectedChange: (checked: boolean) => void;
}) {
  const servings = normalizeServings(Number(servingsText));
  const scaled = scaleRecipe(recipe, servings);
  const macros = scaled.scaledNutrients.filter((nutrient) => nutrient.category === "macro");
  const micros = scaled.scaledNutrients.filter((nutrient) => nutrient.category === "micro");

  useEffect(() => {
    onServingsTextChange(String(recipe.servingsApplied));
  }, [recipe.id, recipe.servingsApplied]);

  return (
    <AccordionItem value={String(recipe.id)}>
      <AccordionTrigger className="gap-4 hover:no-underline">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-left">
          <span className="truncate text-base font-semibold">{recipe.name}</span>
          <Badge variant={recipe.category === "breakfast" ? "default" : "secondary"}>{recipe.category}</Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">{recipe.instructions}</p>
            <div className="grid max-w-xs gap-2">
              <Label>Portionen</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" type="button" onClick={() => onCommitServings(servings - 1)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  inputMode="numeric"
                  min={1}
                  max={99}
                  type="number"
                  value={servingsText}
                  onBlur={() => onCommitServings(Number(servingsText))}
                  onChange={(event) => onServingsTextChange(event.target.value)}
                  className="w-24 text-center"
                />
                <Button variant="outline" size="icon" type="button" onClick={() => onCommitServings(servings + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <label className="flex max-w-xs cursor-pointer items-center gap-3 rounded-md border bg-background p-3 text-sm">
              <Checkbox checked={selected} onCheckedChange={(checked) => onSelectedChange(Boolean(checked))} />
              <span>Für Einkaufsliste auswählen</span>
            </label>
            <div>
              <h3 className="text-sm font-semibold">Zutaten für {servings} Portion{servings > 1 ? "en" : ""}</h3>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                {scaled.scaledItems.map((item) => (
                  <li key={`${recipe.id}-${item.name}`} className="rounded-md border bg-background p-2">
                    <span className="font-medium text-foreground">
                      {formatAmount(item.totalAmount)} {item.unit}
                    </span>{" "}
                    {item.name}
                    {item.excludeFromNutrition && <span className="block text-xs">nicht in Nährwerten</span>}
                  </li>
                ))}
              </ul>
            </div>
            {recipe.prepNotes && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{recipe.prepNotes}</p>}
          </div>
          <div className="space-y-4">
            {macros.length > 0 && (
              <NutrientGroup title="Makros gesamt" nutrients={macros} />
            )}
            {macros.length > 0 && micros.length > 0 && <Separator />}
            {micros.length > 0 && (
              <NutrientGroup title="Mikros gesamt" nutrients={micros} compact />
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function NutrientGroup({
  title,
  nutrients,
  compact = false
}: {
  title: string;
  nutrients: ReturnType<typeof scaleRecipe>["scaledNutrients"];
  compact?: boolean;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className={compact ? "mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" : "mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-5"}>
        {nutrients.map((nutrient) => (
          <div key={nutrient.key} className="rounded-md border bg-background p-3">
            <span className="text-xs font-medium text-muted-foreground">{nutrient.label}</span>
            <strong className="mt-1 block text-lg font-semibold tracking-normal">
              {formatNutrientAmount(nutrient.totalAmount)} {nutrient.unit}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}
