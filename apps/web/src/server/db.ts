import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  DailyCheckInInput,
  HabitDay,
  HabitDefinition,
  HabitSyncPayload,
  HabitSyncResponse,
  HealthKitSyncPayload,
  ShoppingListExport,
  ShoppingListExportCreateInput
} from "../shared/types";

export type AppDatabase = Database.Database;

export function openDatabase(dbPath = path.resolve(process.cwd(), "data/health.sqlite")) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seed(db);
  return db;
}

function migrate(db: AppDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT,
      age INTEGER NOT NULL,
      focus_summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      instructions TEXT,
      prep_notes TEXT NOT NULL DEFAULT '',
      serving_base REAL NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      unit TEXT NOT NULL,
      exclude_from_nutrition INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS recipe_nutrients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      nutrient_key TEXT NOT NULL,
      label TEXT NOT NULL,
      amount_per_serving REAL NOT NULL,
      unit TEXT NOT NULL,
      category TEXT NOT NULL,
      UNIQUE(recipe_id, nutrient_key)
    );

    CREATE TABLE IF NOT EXISTS supplements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_dose REAL,
      unit TEXT,
      timing TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS health_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      unit TEXT NOT NULL,
      value REAL NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      source_name TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_health_samples_type_start ON health_samples(type, start_at);

    CREATE TABLE IF NOT EXISTS workouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL UNIQUE,
      activity_type TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      distance_m REAL,
      active_energy_kcal REAL,
      avg_heart_rate REAL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workouts_start ON workouts(start_at);

    CREATE TABLE IF NOT EXISTS daily_checkins (
      date TEXT PRIMARY KEY,
      cigarettes INTEGER NOT NULL DEFAULT 0,
      pain_areas_json TEXT NOT NULL DEFAULT '[]',
      energy INTEGER NOT NULL DEFAULT 3,
      soreness INTEGER NOT NULL DEFAULT 3,
      perceived_recovery INTEGER NOT NULL DEFAULT 3,
      sleep_quality INTEGER NOT NULL DEFAULT 3,
      protein_ok INTEGER NOT NULL DEFAULT 0,
      creatine_taken INTEGER NOT NULL DEFAULT 0,
      inulin_taken INTEGER NOT NULL DEFAULT 0,
      broccoli_or_cruciferous INTEGER NOT NULL DEFAULT 0,
      lentils_or_legumes INTEGER NOT NULL DEFAULT 0,
      hydration_ok INTEGER NOT NULL DEFAULT 0,
      planned_training TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS habit_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT UNIQUE,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS habit_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL REFERENCES habit_definitions(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(habit_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_habit_entries_date ON habit_entries(date);

    CREATE TABLE IF NOT EXISTS pairing_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      label TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      source TEXT PRIMARY KEY,
      cursor TEXT,
      last_synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      model TEXT NOT NULL,
      input_snapshot_json TEXT NOT NULL,
      recommendation_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shopping_list_exports (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      items_json TEXT NOT NULL,
      source_snapshot_json TEXT,
      created_at TEXT NOT NULL,
      consumed_at TEXT,
      error_json TEXT
    );
  `);

  ensureColumn(db, "recipes", "prep_notes", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "recipes", "serving_base", "REAL NOT NULL DEFAULT 1");
  ensureColumn(db, "recipes", "is_active", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "recipe_items", "exclude_from_nutrition", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "habit_definitions", "client_id", "TEXT");
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_definitions_client_id ON habit_definitions(client_id) WHERE client_id IS NOT NULL`);
}

function seed(db: AppDatabase) {
  db.prepare(
    `INSERT OR IGNORE INTO profile (id, age, focus_summary)
     VALUES (1, 28, ?)`
  ).run(
    "Langfristig gesund und fit bleiben: Ausdauer, Lauftechnik, Ernährung, Regeneration und nachhaltige Gewohnheiten."
  );


  const insertGoal = db.prepare(
    `INSERT INTO goals (title, category, priority, notes)
     SELECT ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM goals WHERE title = ?)`
  );

  [
    ["Gesund und fit bis ins Alter bleiben", "longevity", 1, "Übergeordnetes Ziel"],
    ["Ausdauer verbessern und Laufleistung steigern", "training", 2, "Pace, Herzfrequenz und Belastungssteuerung beobachten"],
    ["Bewegungsqualität und Lauftechnik verbessern", "movement", 2, "Vorderfußbelastung, Abrollen und Beschwerden monitoren"],
    ["Ernährung alltagstauglich optimieren", "nutrition", 3, "Protein, Ballaststoffe, Brokkoli/Blumenkohl/Linsen"],
    ["Zigarettenkonsum reduzieren", "behavior", 2, "Daily Check-in als sanftes Tracking"]
  ].forEach(([title, category, priority, notes]) => {
    insertGoal.run(title, category, priority, notes, title);
  });

  archiveRecipeByName(db, "Waldfruchtjoghurt");
  archiveRecipeByName(db, "Super-Veggie-Bowl mit Beluga-Linsen + Eiern");

  upsertRecipe(db, {
    name: "Skyr-Berry-Protein-Jar",
    category: "breakfast",
    instructions: "Meal-Prep-Frühstück für 1 bis 4 Portionen. Overnight vorbereiten, Kreatin erst frisch einrühren.",
    prepNotes: "Kreatin frisch einrühren und nicht in die Nährwerte einrechnen.",
    servingBase: 1,
    items: [
      ["Skyr", 200, "g"],
      ["Milch 3,8 %", 50, "g"],
      ["Haferflocken", 40, "g"],
      ["Chiasamen", 15, "g"],
      ["Heidelbeeren", 50, "g"],
      ["Brombeeren", 50, "g"],
      ["Whey", 20, "g"],
      ["Inulin", 5, "g"],
      ["Kreatin Monohydrat", 5, "g", true]
    ],
    nutrients: breakfastNutrients({
      calories: 524,
      protein: 49.7,
      carbs: 61.4,
      fat: 10.9,
      fiber: 18,
      calcium: 534,
      magnesium: 171.6,
      potassium: 827,
      iron: 3.7,
      zinc: 3.9,
      vitaminC: 15.5,
      vitaminK: 20,
      vitaminB12: 1.74,
      omega3Ala: 2.8
    })
  });

  upsertRecipe(db, {
    name: "Griechischer-Joghurt-2%-Jar",
    category: "breakfast",
    instructions: "Meal-Prep-Frühstück für 1 bis 4 Portionen. Overnight vorbereiten, Kreatin erst frisch einrühren.",
    prepNotes: "Kreatin frisch einrühren und nicht in die Nährwerte einrechnen.",
    servingBase: 1,
    items: [
      ["Griechischer Joghurt 2 %", 200, "g"],
      ["Haferflocken", 40, "g"],
      ["Chiasamen", 15, "g"],
      ["Heidelbeeren", 50, "g"],
      ["Brombeeren", 50, "g"],
      ["Whey", 20, "g"],
      ["Inulin", 5, "g"],
      ["Kreatin Monohydrat", 5, "g", true]
    ],
    nutrients: breakfastNutrients({
      calories: 513,
      protein: 43,
      carbs: 59,
      fat: 13,
      fiber: 18,
      calcium: 464,
      magnesium: 166,
      potassium: 734,
      iron: 3.7,
      zinc: 4,
      vitaminC: 17,
      vitaminK: 20,
      vitaminB12: 2,
      omega3Ala: 2.8
    })
  });

  upsertRecipe(db, {
    name: "Milch-Only Overnight Oats",
    category: "breakfast",
    instructions: "Meal-Prep-Frühstück für 1 bis 4 Portionen. Overnight ansetzen, Kreatin erst frisch einrühren.",
    prepNotes: "Kreatin frisch einrühren und nicht in die Nährwerte einrechnen.",
    servingBase: 1,
    items: [
      ["Milch 3,8 %", 300, "g"],
      ["Haferflocken", 50, "g"],
      ["Chiasamen", 15, "g"],
      ["Heidelbeeren", 50, "g"],
      ["Brombeeren", 50, "g"],
      ["Whey", 25, "g"],
      ["Inulin", 5, "g"],
      ["Kreatin Monohydrat", 5, "g", true]
    ],
    nutrients: breakfastNutrients({
      calories: 626,
      protein: 42,
      carbs: 73,
      fat: 21,
      fiber: 19,
      calcium: 624,
      magnesium: 197,
      potassium: 970,
      iron: 4.2,
      zinc: 4.5,
      vitaminC: 15.5,
      vitaminK: 21.5,
      vitaminB12: 2,
      omega3Ala: 2.8
    })
  });

  upsertRecipe(db, {
    name: "Cappuccino",
    category: "beverage",
    instructions: "Separater Frühstücks-Add-on. Bei Bedarf zur Meal-Prep-Portion dazunehmen.",
    prepNotes: "Eigenes Rezept, damit Mikros separat sichtbar bleiben.",
    servingBase: 1,
    items: [
      ["Milch 3,8 %", 170, "g"],
      ["Zucker", 3, "g"]
    ],
    nutrients: [
      ["calories", "Kalorien", 117, "kcal", "macro"],
      ["protein", "Protein", 5.6, "g", "macro"],
      ["carbs", "Kohlenhydrate", 11.2, "g", "macro"],
      ["fat", "Fett", 6.5, "g", "macro"],
      ["fiber", "Ballaststoffe", 0, "g", "macro"],
      ["calcium", "Calcium", 204, "mg", "micro"],
      ["magnesium", "Magnesium", 19, "mg", "micro"],
      ["potassium", "Kalium", 255, "mg", "micro"],
      ["vitamin_b12", "Vitamin B12", 0.8, "µg", "micro"]
    ]
  });

  upsertRecipe(db, {
    name: "Green Smoothie",
    category: "smoothie",
    instructions: "Kalium- und mikronährstoffreicher Smoothie als flexible Zwischenmahlzeit oder größeres Frühstück.",
    prepNotes: "Whey und Haferflocken direkt mitmixen. Angaben gelten pro vollständigem Smoothie.",
    servingBase: 1,
    items: [
      ["Banane ca. 120 g", 1, "Stück"],
      ["Avocado ca. 75 g", 0.5, "Stück"],
      ["Apfel ca. 90 g", 0.5, "Stück"],
      ["Spinat", 60, "g"],
      ["Zitronensaft ca. 20 g", 0.5, "Zitrone"],
      ["Milch 3,8 %", 300, "g"],
      ["Whey", 25, "g"],
      ["Haferflocken", 30, "g"]
    ],
    nutrients: [
      ["calories", "Kalorien", 700, "kcal", "macro"],
      ["protein", "Protein", 40, "g", "macro"],
      ["carbs", "Kohlenhydrate", 86, "g", "macro"],
      ["fat", "Fett", 27, "g", "macro"],
      ["fiber", "Ballaststoffe", 15, "g", "macro"],
      ["calcium", "Calcium", 560, "mg", "micro"],
      ["magnesium", "Magnesium", 210, "mg", "micro"],
      ["potassium", "Kalium", 1950, "mg", "micro"],
      ["iron", "Eisen", 4, "mg", "micro"],
      ["zinc", "Zink", 3.7, "mg", "micro"],
      ["vitamin_c", "Vitamin C", 47, "mg", "micro"],
      ["vitamin_k", "Vitamin K", 310, "µg", "micro"],
      ["vitamin_b12", "Vitamin B12", 1.9, "µg", "micro"],
      ["folate", "Folat", 240, "µg", "micro"]
    ]
  });

  upsertRecipe(db, {
    name: "Quinoa-Salat mit Feta",
    category: "lunch",
    instructions: "Quinoa gründlich waschen, mit ca. 120 ml Wasser und etwas Salz 12-15 Minuten kochen, 5 Minuten quellen lassen und abkühlen lassen. Gurke, Paprika und rote Zwiebel klein schneiden, Feta würfeln oder zerbröseln. Olivenöl, Zitronensaft, Salz und Pfeffer verrühren und alles vermengen.",
    prepNotes: "Gemüse als Küchenmaß: 1/4 Gurke ca. 75 g, 1/2 Paprika ca. 75 g, 1/4 rote Zwiebel ca. 25 g. Feta-Annahme: Milbona Bio griechischer Feta, 50 g.",
    servingBase: 1,
    items: [
      ["Quinoa, trocken", 60, "g"],
      ["Feta", 50, "g"],
      ["Gurke", 0.25, "Stück"],
      ["Paprika", 0.5, "Stück"],
      ["Rote Zwiebel", 0.25, "Stück"],
      ["Olivenöl", 15, "g"],
      ["Zitronensaft", 0.5, "TL"]
    ],
    nutrients: [
      ["calories", "Kalorien", 537, "kcal", "macro"],
      ["protein", "Protein", 18.2, "g", "macro"],
      ["carbs", "Kohlenhydrate", 47.3, "g", "macro"],
      ["fat", "Fett", 30.5, "g", "macro"],
      ["fiber", "Ballaststoffe", 6.5, "g", "macro"],
      ["salt", "Salz", 1.2, "g", "macro"]
    ]
  });

  upsertRecipe(db, {
    name: "Kichererbsen-Spinat-Tomaten-Pfanne mit Feta",
    category: "lunch",
    instructions: "Zwiebel und Knoblauch fein schneiden. Olivenöl in einer Pfanne erhitzen und Zwiebel 2-3 Minuten anschwitzen. Knoblauch kurz dazugeben. Tomatenmark einrühren und etwa 1 Minute anrösten. Geschälte Tomaten, Kichererbsen und Gewürze dazugeben und 8-10 Minuten köcheln lassen. Spinat unterheben, bis er zusammenfällt. Mit Salz und Pfeffer abschmecken. Feta zerbröseln und beim Servieren darübergeben.",
    prepNotes: "Annahmen: 120 g abgetropfte Kichererbsen, 1/2 Zwiebel ca. 50 g, 1/4 Dose geschälte Tomaten ca. 100 g, 100 g frischer oder TK-Spinat, Milbona Bio griechischer Feta 50 g, 10 g Olivenöl. Mit 40 g Feta ca. 437 kcal, 19 g Protein und 23 g Fett.",
    servingBase: 1,
    items: [
      ["Kichererbsen, abgetropft", 120, "g"],
      ["Zwiebel", 0.5, "Stück"],
      ["Knoblauch", 1, "Zehe"],
      ["Tomatenmark", 0.5, "EL"],
      ["Geschälte Tomaten", 0.25, "Dose"],
      ["Spinat", 100, "g"],
      ["Olivenöl", 10, "g"],
      ["Feta", 50, "g"],
      ["Paprikapulver edelsüß", 0.25, "TL"],
      ["Zimt", 1, "Prise"],
      ["Kreuzkümmel", 0.0625, "TL"]
    ],
    nutrients: [
      ["calories", "Kalorien", 465, "kcal", "macro"],
      ["protein", "Protein", 21, "g", "macro"],
      ["carbs", "Kohlenhydrate", 39, "g", "macro"],
      ["fat", "Fett", 25, "g", "macro"],
      ["fiber", "Ballaststoffe", 12, "g", "macro"],
      ["salt", "Salz", 1.5, "g", "macro"]
    ]
  });

  upsertRecipe(db, {
    name: "Ofenlachs mit Brokkoli, Paprika & Reis",
    category: "lunch",
    instructions: "Reis waschen und nach Packungsangabe kochen. Backofen auf 180-200 °C Umluft vorheizen. Brokkoli in Röschen teilen und Paprika in Streifen schneiden. Gemüse mit etwa 5 g Olivenöl, Salz, Pfeffer und Paprikapulver vermengen. Lachs mit etwa 5 g Olivenöl, Zitronensaft, fein gehacktem Knoblauch, Salz und Pfeffer würzen. Gemüse und Lachs in eine Auflaufform oder auf ein Backblech geben. Ca. 15-18 Minuten backen, bis der Lachs gar ist. Mit Reis servieren.",
    prepNotes: "Annahmen: 125 g Lachsfilet, 60 g Reis trocken, 1/2 kleiner Brokkoli ca. 150 g, 1/2 Paprika ca. 75 g, 10 g Olivenöl.",
    servingBase: 1,
    items: [
      ["Lachsfilet", 125, "g"],
      ["Reis, trocken", 60, "g"],
      ["Brokkoli", 0.5, "kleiner Kopf"],
      ["Paprika", 0.5, "Stück"],
      ["Knoblauch", 1, "kleine Zehe"],
      ["Olivenöl", 10, "g"],
      ["Zitronensaft", 1, "TL"],
      ["Paprikapulver edelsüß", 0.5, "TL"]
    ],
    nutrients: [
      ["calories", "Kalorien", 560, "kcal", "macro"],
      ["protein", "Protein", 33, "g", "macro"],
      ["carbs", "Kohlenhydrate", 56, "g", "macro"],
      ["fat", "Fett", 22, "g", "macro"],
      ["fiber", "Ballaststoffe", 7, "g", "macro"]
    ]
  });

  upsertRecipe(db, {
    name: "Super-Veggie-Bowl mit Beluga-Linsen",
    category: "lunch",
    instructions: "Beluga-Linsen waschen und 20-25 Minuten kochen, erst gegen Ende salzen. Brokkoli und Blumenkohl in Röschen teilen und 5-8 Minuten dämpfen oder kochen. Champignons in Scheiben schneiden und kräftig anbraten. Knoblauch und Ingwer fein hacken und am Ende kurz zu den Champignons geben. Olivenöl, Zitronensaft, Salz und Pfeffer verrühren. Linsen, Gemüse, Champignons und Dressing vermengen und Hanfsamen darüberstreuen.",
    prepNotes: "Kleinere ballaststoffreiche Portion. Küchenmaß-Annahmen: 1/2 kleiner Brokkoli ca. 150 g, 1/4 kleiner Blumenkohl ca. 100 g, 100 g Champignons, 15 g Olivenöl, 35 g Beluga-Linsen trocken, 10 g Hanfsamen.",
    servingBase: 1,
    items: [
      ["Beluga-Linsen, trocken", 35, "g"],
      ["Brokkoli", 0.5, "kleiner Kopf"],
      ["Blumenkohl", 0.25, "kleiner Kopf"],
      ["Champignons", 100, "g"],
      ["Knoblauch", 1, "kleine Zehe"],
      ["Ingwer", 2, "g"],
      ["Kreuzkümmel", 0.125, "TL"],
      ["Hanfsamen", 10, "g"],
      ["Olivenöl", 15, "g"],
      ["Zitronensaft", 1, "TL"]
    ],
    nutrients: [
      ["calories", "Kalorien", 445, "kcal", "macro"],
      ["protein", "Protein", 20, "g", "macro"],
      ["carbs", "Kohlenhydrate", 43, "g", "macro"],
      ["fat", "Fett", 23, "g", "macro"],
      ["fiber", "Ballaststoffe", 16, "g", "macro"]
    ]
  });

  const insertSupplement = db.prepare(
    `INSERT OR IGNORE INTO supplements (name, default_dose, unit, timing, notes)
     VALUES (?, ?, ?, ?, ?)`
  );
  insertSupplement.run("Kreatin Monohydrat", 5, "g", "daily", "Fester Bestandteil der Routine.");
  insertSupplement.run("Inulin", 3, "g", "morning", "Ballaststoff-Supplement, Verträglichkeit im Check-in beobachten.");

  const insertHabit = db.prepare(
    `INSERT INTO habit_definitions (client_id, name, sort_order)
     VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       client_id = COALESCE(habit_definitions.client_id, excluded.client_id),
       sort_order = habit_definitions.sort_order`
  );
  ["Kreatin", "Inulin", "Protein ok", "Hydration", "Brokkoli/Blumenkohl", "Linsen/Leguminosen", "Rauchfrei/Reduktion"].forEach(
    (name, index) => insertHabit.run(`default-${slugify(name)}`, name, index)
  );
}

function upsertRecipe(
  db: AppDatabase,
  recipe: {
    name: string;
    category: string;
    instructions: string;
    prepNotes: string;
    servingBase: number;
    items: [string, number, string, boolean?][];
    nutrients: [string, string, number, string, "macro" | "micro"][];
  }
) {
  db.prepare(
    `INSERT INTO recipes (name, category, instructions, prep_notes, serving_base, is_active)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(name) DO UPDATE SET
       category = excluded.category,
       instructions = excluded.instructions,
       prep_notes = excluded.prep_notes,
       serving_base = excluded.serving_base,
       is_active = 1`
  ).run(recipe.name, recipe.category, recipe.instructions, recipe.prepNotes, recipe.servingBase);
  const id = db.prepare(`SELECT id FROM recipes WHERE name = ?`).get(recipe.name) as { id: number };

  const insert = db.prepare(
    `INSERT INTO recipe_items (recipe_id, name, amount, unit, exclude_from_nutrition) VALUES (?, ?, ?, ?, ?)`
  );
  const insertNutrient = db.prepare(
    `INSERT INTO recipe_nutrients (recipe_id, nutrient_key, label, amount_per_serving, unit, category)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM recipe_items WHERE recipe_id = ?`).run(id.id);
    db.prepare(`DELETE FROM recipe_nutrients WHERE recipe_id = ?`).run(id.id);
    recipe.items.forEach(([name, amount, unit, excludeFromNutrition]) =>
      insert.run(id.id, name, amount, unit, excludeFromNutrition ? 1 : 0)
    );
    recipe.nutrients.forEach(([key, label, amount, unit, category]) =>
      insertNutrient.run(id.id, key, label, amount, unit, category)
    );
  });
  tx();
}

function ensureColumn(db: AppDatabase, table: string, column: string, definition: string) {
  const exists = (
    db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column) as { 1: number } | undefined
  );
  if (exists) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function archiveRecipeByName(db: AppDatabase, name: string) {
  db.prepare(`UPDATE recipes SET is_active = 0 WHERE name = ?`).run(name);
}

function breakfastNutrients(input: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  calcium: number;
  magnesium: number;
  potassium: number;
  iron: number;
  zinc: number;
  vitaminC: number;
  vitaminK: number;
  vitaminB12: number;
  omega3Ala: number;
}) {
  return [
    ["calories", "Kalorien", input.calories, "kcal", "macro"],
    ["protein", "Protein", input.protein, "g", "macro"],
    ["carbs", "Kohlenhydrate", input.carbs, "g", "macro"],
    ["fat", "Fett", input.fat, "g", "macro"],
    ["fiber", "Ballaststoffe", input.fiber, "g", "macro"],
    ["calcium", "Calcium", input.calcium, "mg", "micro"],
    ["magnesium", "Magnesium", input.magnesium, "mg", "micro"],
    ["potassium", "Kalium", input.potassium, "mg", "micro"],
    ["iron", "Eisen", input.iron, "mg", "micro"],
    ["zinc", "Zink", input.zinc, "mg", "micro"],
    ["vitamin_c", "Vitamin C", input.vitaminC, "mg", "micro"],
    ["vitamin_k", "Vitamin K", input.vitaminK, "µg", "micro"],
    ["vitamin_b12", "Vitamin B12", input.vitaminB12, "µg", "micro"],
    ["omega3_ala", "Omega-3 ALA", input.omega3Ala, "g", "micro"]
  ] as [string, string, number, string, "macro" | "micro"][];
}

export function syncHealthKitBatch(db: AppDatabase, payload: HealthKitSyncPayload) {
  const sample = db.prepare(`
    INSERT INTO health_samples
      (source_id, type, unit, value, start_at, end_at, source_name, metadata_json, updated_at)
    VALUES
      (@sourceId, @type, @unit, @value, @startAt, @endAt, @sourceName, @metadataJson, CURRENT_TIMESTAMP)
    ON CONFLICT(source_id) DO UPDATE SET
      type = excluded.type,
      unit = excluded.unit,
      value = excluded.value,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      source_name = excluded.source_name,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const workout = db.prepare(`
    INSERT INTO workouts
      (source_id, activity_type, start_at, end_at, duration_seconds, distance_m, active_energy_kcal, avg_heart_rate, metadata_json, updated_at)
    VALUES
      (@sourceId, @activityType, @startAt, @endAt, @durationSeconds, @distanceMeters, @activeEnergyKcal, @averageHeartRate, @metadataJson, CURRENT_TIMESTAMP)
    ON CONFLICT(source_id) DO UPDATE SET
      activity_type = excluded.activity_type,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      duration_seconds = excluded.duration_seconds,
      distance_m = excluded.distance_m,
      active_energy_kcal = excluded.active_energy_kcal,
      avg_heart_rate = excluded.avg_heart_rate,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const tx = db.transaction(() => {
    for (const row of payload.samples) {
      sample.run({
        ...row,
        sourceName: row.sourceName ?? payload.deviceName ?? "HealthKit",
        metadataJson: JSON.stringify(row.metadata ?? {})
      });
    }
    for (const row of payload.workouts) {
      workout.run({
        ...row,
        distanceMeters: row.distanceMeters ?? null,
        activeEnergyKcal: row.activeEnergyKcal ?? null,
        averageHeartRate: row.averageHeartRate ?? null,
        metadataJson: JSON.stringify(row.metadata ?? {})
      });
    }
    db.prepare(
      `INSERT INTO sync_state (source, last_synced_at)
       VALUES (?, CURRENT_TIMESTAMP)
       ON CONFLICT(source) DO UPDATE SET last_synced_at = CURRENT_TIMESTAMP`
    ).run(payload.deviceName ?? "HealthKit");
  });

  tx();
  return { samples: payload.samples.length, workouts: payload.workouts.length };
}

export function createShoppingListExport(db: AppDatabase, input: ShoppingListExportCreateInput) {
  const id = `export_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO shopping_list_exports (id, title, items_json, source_snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.title.trim(), JSON.stringify(input.items), input.sourceSnapshot ? JSON.stringify(input.sourceSnapshot) : null, createdAt);

  return { id, status: "pending" as const };
}

export function getPendingShoppingListExports(db: AppDatabase) {
  const rows = db
    .prepare(
      `SELECT id, title, items_json, source_snapshot_json, created_at, consumed_at, error_json
       FROM shopping_list_exports
       WHERE consumed_at IS NULL
       ORDER BY created_at DESC`
    )
    .all() as ShoppingListExportRow[];

  return rows.map(mapShoppingListExport);
}

export function getShoppingListExport(db: AppDatabase, id: string) {
  const row = db
    .prepare(
      `SELECT id, title, items_json, source_snapshot_json, created_at, consumed_at, error_json
       FROM shopping_list_exports
       WHERE id = ?`
    )
    .get(id) as ShoppingListExportRow | undefined;

  return row ? mapShoppingListExport(row) : null;
}

export function consumeShoppingListExport(
  db: AppDatabase,
  id: string,
  input: { targetReminderListName: string; createdReminderCount: number }
) {
  const consumedAt = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE shopping_list_exports
       SET consumed_at = ?,
           error_json = NULL
       WHERE id = ? AND consumed_at IS NULL`
    )
    .run(consumedAt, id);

  return {
    id,
    status: result.changes > 0 ? ("consumed" as const) : ("not_found_or_already_consumed" as const),
    consumedAt,
    targetReminderListName: input.targetReminderListName,
    createdReminderCount: input.createdReminderCount
  };
}

export function storeShoppingListExportError(db: AppDatabase, id: string, input: { message: string }) {
  const error = {
    message: input.message,
    reportedAt: new Date().toISOString()
  };
  const result = db.prepare(`UPDATE shopping_list_exports SET error_json = ? WHERE id = ?`).run(JSON.stringify(error), id);
  return {
    id,
    status: result.changes > 0 ? ("error_stored" as const) : ("not_found" as const),
    error
  };
}

export function upsertDailyCheckIn(db: AppDatabase, input: DailyCheckInInput) {
  const normalized = {
    date: input.date,
    cigarettes: input.cigarettes ?? 0,
    painAreasJson: JSON.stringify(input.painAreas ?? []),
    energy: input.energy ?? 3,
    soreness: input.soreness ?? 3,
    perceivedRecovery: input.perceivedRecovery ?? 3,
    sleepQuality: input.sleepQuality ?? 3,
    proteinOk: input.proteinOk ? 1 : 0,
    creatineTaken: input.creatineTaken ? 1 : 0,
    inulinTaken: input.inulinTaken ? 1 : 0,
    broccoliOrCruciferous: input.broccoliOrCruciferous ? 1 : 0,
    lentilsOrLegumes: input.lentilsOrLegumes ? 1 : 0,
    hydrationOk: input.hydrationOk ? 1 : 0,
    plannedTraining: input.plannedTraining ?? "",
    notes: input.notes ?? ""
  };

  db.prepare(`
    INSERT INTO daily_checkins
      (date, cigarettes, pain_areas_json, energy, soreness, perceived_recovery, sleep_quality,
       protein_ok, creatine_taken, inulin_taken, broccoli_or_cruciferous, lentils_or_legumes,
       hydration_ok, planned_training, notes, updated_at)
    VALUES
      (@date, @cigarettes, @painAreasJson, @energy, @soreness, @perceivedRecovery, @sleepQuality,
       @proteinOk, @creatineTaken, @inulinTaken, @broccoliOrCruciferous, @lentilsOrLegumes,
       @hydrationOk, @plannedTraining, @notes, CURRENT_TIMESTAMP)
    ON CONFLICT(date) DO UPDATE SET
      cigarettes = excluded.cigarettes,
      pain_areas_json = excluded.pain_areas_json,
      energy = excluded.energy,
      soreness = excluded.soreness,
      perceived_recovery = excluded.perceived_recovery,
      sleep_quality = excluded.sleep_quality,
      protein_ok = excluded.protein_ok,
      creatine_taken = excluded.creatine_taken,
      inulin_taken = excluded.inulin_taken,
      broccoli_or_cruciferous = excluded.broccoli_or_cruciferous,
      lentils_or_legumes = excluded.lentils_or_legumes,
      hydration_ok = excluded.hydration_ok,
      planned_training = excluded.planned_training,
      notes = excluded.notes,
      updated_at = CURRENT_TIMESTAMP
  `).run(normalized);

  return getDailyCheckIn(db, input.date);
}

export function getDailyCheckIn(db: AppDatabase, date: string) {
  const row = db.prepare(`SELECT * FROM daily_checkins WHERE date = ?`).get(date) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  return {
    date: String(row.date),
    cigarettes: Number(row.cigarettes),
    painAreas: JSON.parse(String(row.pain_areas_json)),
    energy: Number(row.energy),
    soreness: Number(row.soreness),
    perceivedRecovery: Number(row.perceived_recovery),
    sleepQuality: Number(row.sleep_quality),
    proteinOk: Boolean(row.protein_ok),
    creatineTaken: Boolean(row.creatine_taken),
    inulinTaken: Boolean(row.inulin_taken),
    broccoliOrCruciferous: Boolean(row.broccoli_or_cruciferous),
    lentilsOrLegumes: Boolean(row.lentils_or_legumes),
    hydrationOk: Boolean(row.hydration_ok),
    plannedTraining: String(row.planned_training),
    notes: String(row.notes)
  };
}

export function getHabitDay(db: AppDatabase, date: string): HabitDay {
  const definitions = db
    .prepare(`SELECT id, client_id, name, sort_order, is_active, updated_at FROM habit_definitions WHERE is_active = 1 ORDER BY sort_order, id`)
    .all() as HabitDefinitionRow[];
  const entries = db
    .prepare(
      `SELECT habit_entries.habit_id, habit_definitions.client_id AS habit_client_id, habit_entries.date,
              habit_entries.completed, habit_entries.updated_at
       FROM habit_entries
       JOIN habit_definitions ON habit_definitions.id = habit_entries.habit_id
       WHERE habit_entries.date = ?`
    )
    .all(date) as HabitEntryRow[];

  const activeIds = new Set(definitions.map((definition) => definition.id));
  const activeEntries = entries.filter((entry) => activeIds.has(entry.habit_id));
  const completedCount = activeEntries.filter((entry) => Boolean(entry.completed)).length;
  const totalCount = definitions.length;

  return {
    date,
    definitions: definitions.map(mapHabitDefinition),
    entries: activeEntries.map(mapHabitEntry),
    completedCount,
    totalCount,
    completionRate: totalCount > 0 ? completedCount / totalCount : 0
  };
}

export function upsertHabitDefinition(
  db: AppDatabase,
  input: { id?: number; clientId?: string; name: string; sortOrder?: number; isActive?: boolean; updatedAt?: string }
) {
  const name = input.name.trim();
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (input.id) {
    const result = db.prepare(
      `UPDATE habit_definitions
       SET client_id = COALESCE(?, client_id),
           name = ?,
           sort_order = COALESCE(?, sort_order),
           is_active = COALESCE(?, is_active),
           updated_at = ?
       WHERE id = ?`
    ).run(input.clientId ?? null, name, input.sortOrder ?? null, input.isActive === undefined ? null : input.isActive ? 1 : 0, updatedAt, input.id);
    if (result.changes > 0) return getHabitDefinition(db, input.id);
  }

  const sortOrder =
    input.sortOrder ??
    Number((db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM habit_definitions`).get() as { next: number }).next);
  const info = db
    .prepare(
      `INSERT INTO habit_definitions (client_id, name, sort_order, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         client_id = COALESCE(habit_definitions.client_id, excluded.client_id),
         sort_order = excluded.sort_order,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`
    )
    .run(input.clientId ?? null, name, sortOrder, input.isActive === false ? 0 : 1, updatedAt);
  const id =
    Number(info.lastInsertRowid) ||
    Number((db.prepare(`SELECT id FROM habit_definitions WHERE name = ?`).get(name) as { id: number }).id);
  ensureHabitClientId(db, id);
  return getHabitDefinition(db, id);
}

export function upsertHabitEntry(db: AppDatabase, input: { date: string; habitId: number; completed: boolean }) {
  const updatedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO habit_entries (habit_id, date, completed, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(habit_id, date) DO UPDATE SET
       completed = excluded.completed,
       updated_at = excluded.updated_at`
  ).run(input.habitId, input.date, input.completed ? 1 : 0, updatedAt);
  return getHabitDay(db, input.date);
}

function getHabitDefinition(db: AppDatabase, id: number) {
  const row = db.prepare(`SELECT id, client_id, name, sort_order, is_active, updated_at FROM habit_definitions WHERE id = ?`).get(id) as
    | HabitDefinitionRow
    | undefined;
  if (!row) return null;
  return mapHabitDefinition(row);
}

export function getHabitSyncState(db: AppDatabase, since?: string): HabitSyncResponse {
  const definitions = db
    .prepare(`SELECT id, client_id, name, sort_order, is_active, updated_at FROM habit_definitions ORDER BY sort_order, id`)
    .all() as HabitDefinitionRow[];
  const entryWhere = since ? `WHERE habit_entries.updated_at > ?` : "";
  const entries = db
    .prepare(
      `SELECT habit_entries.habit_id, habit_definitions.client_id AS habit_client_id, habit_entries.date,
              habit_entries.completed, habit_entries.updated_at
       FROM habit_entries
       JOIN habit_definitions ON habit_definitions.id = habit_entries.habit_id
       ${entryWhere}
       ORDER BY habit_entries.date, habit_entries.habit_id`
    )
    .all(...(since ? [toIso(since)] : [])) as HabitEntryRow[];

  return {
    syncedAt: new Date().toISOString(),
    definitions: definitions.map(mapHabitDefinition),
    entries: entries.map(mapHabitEntry)
  };
}

export function syncHabitBatch(db: AppDatabase, payload: HabitSyncPayload): HabitSyncResponse {
  const tx = db.transaction(() => {
    for (const definition of payload.definitions ?? []) {
      mergeHabitDefinition(db, definition);
    }
    for (const entry of payload.entries ?? []) {
      mergeHabitEntry(db, entry);
    }
  });
  tx();
  return getHabitSyncState(db);
}

type HabitDefinitionRow = {
  id: number;
  client_id: string | null;
  name: string;
  sort_order: number;
  is_active: number;
  updated_at: string;
};

type HabitEntryRow = {
  habit_id: number;
  habit_client_id: string | null;
  date: string;
  completed: number;
  updated_at: string;
};

type ShoppingListExportRow = {
  id: string;
  title: string;
  items_json: string;
  source_snapshot_json: string | null;
  created_at: string;
  consumed_at: string | null;
  error_json: string | null;
};

function mapShoppingListExport(row: ShoppingListExportRow): ShoppingListExport {
  return {
    id: row.id,
    title: row.title,
    items: JSON.parse(row.items_json),
    sourceSnapshot: row.source_snapshot_json ? JSON.parse(row.source_snapshot_json) : undefined,
    createdAt: row.created_at,
    consumedAt: row.consumed_at,
    error: row.error_json ? JSON.parse(row.error_json) : null
  };
}

function mergeHabitDefinition(db: AppDatabase, input: NonNullable<HabitSyncPayload["definitions"]>[number]) {
  const name = input.name.trim();
  if (!name) return null;

  const clientId = input.clientId?.trim() || null;
  const existing = findHabitDefinition(db, { id: input.id, clientId, name });
  const updatedAt = toIso(input.updatedAt);
  const sortOrder =
    input.sortOrder ??
    existing?.sort_order ??
    Number((db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM habit_definitions`).get() as { next: number }).next);
  const isActive = input.isActive === false ? 0 : input.isActive === true ? 1 : existing?.is_active ?? 1;

  if (existing) {
    if (clientId && !existing.client_id) {
      db.prepare(`UPDATE habit_definitions SET client_id = ? WHERE id = ?`).run(clientId, existing.id);
    }

    if (toMillis(updatedAt) > toMillis(existing.updated_at)) {
      db.prepare(
        `UPDATE habit_definitions
         SET client_id = COALESCE(?, client_id),
             name = ?,
             sort_order = ?,
             is_active = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(clientId, name, sortOrder, isActive, updatedAt, existing.id);
    }
    ensureHabitClientId(db, existing.id);
    return existing.id;
  }

  const info = db
    .prepare(
      `INSERT INTO habit_definitions (client_id, name, sort_order, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(clientId ?? `client-${crypto.randomUUID()}`, name, sortOrder, isActive, updatedAt);
  return Number(info.lastInsertRowid);
}

function mergeHabitEntry(db: AppDatabase, input: NonNullable<HabitSyncPayload["entries"]>[number]) {
  const habitId = resolveHabitId(db, input.habitId, input.habitClientId);
  if (!habitId) return;

  const updatedAt = toIso(input.updatedAt);
  const existing = db
    .prepare(`SELECT habit_id, date, completed, updated_at FROM habit_entries WHERE habit_id = ? AND date = ?`)
    .get(habitId, input.date) as { habit_id: number; date: string; completed: number; updated_at: string } | undefined;

  if (existing && toMillis(updatedAt) <= toMillis(existing.updated_at)) {
    return;
  }

  db.prepare(
    `INSERT INTO habit_entries (habit_id, date, completed, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(habit_id, date) DO UPDATE SET
       completed = excluded.completed,
       updated_at = excluded.updated_at`
  ).run(habitId, input.date, input.completed ? 1 : 0, updatedAt);
}

function findHabitDefinition(
  db: AppDatabase,
  input: { id?: number; clientId?: string | null; name: string }
): HabitDefinitionRow | undefined {
  if (input.clientId) {
    const byClient = db
      .prepare(`SELECT id, client_id, name, sort_order, is_active, updated_at FROM habit_definitions WHERE client_id = ?`)
      .get(input.clientId) as HabitDefinitionRow | undefined;
    if (byClient) return byClient;
  }
  if (input.id && input.id > 0) {
    const byId = db
      .prepare(`SELECT id, client_id, name, sort_order, is_active, updated_at FROM habit_definitions WHERE id = ?`)
      .get(input.id) as HabitDefinitionRow | undefined;
    if (byId) return byId;
  }
  return db
    .prepare(`SELECT id, client_id, name, sort_order, is_active, updated_at FROM habit_definitions WHERE lower(name) = lower(?)`)
    .get(input.name) as HabitDefinitionRow | undefined;
}

function resolveHabitId(db: AppDatabase, habitId?: number, habitClientId?: string) {
  if (habitClientId) {
    const row = db.prepare(`SELECT id FROM habit_definitions WHERE client_id = ?`).get(habitClientId) as { id: number } | undefined;
    if (row) return row.id;
  }
  if (habitId && habitId > 0) {
    const row = db.prepare(`SELECT id FROM habit_definitions WHERE id = ?`).get(habitId) as { id: number } | undefined;
    if (row) return row.id;
  }
  return null;
}

function ensureHabitClientId(db: AppDatabase, id: number) {
  const row = db.prepare(`SELECT client_id FROM habit_definitions WHERE id = ?`).get(id) as { client_id: string | null } | undefined;
  if (row && !row.client_id) {
    db.prepare(`UPDATE habit_definitions SET client_id = ? WHERE id = ?`).run(`server-${id}`, id);
  }
}

function mapHabitDefinition(row: HabitDefinitionRow): HabitDefinition {
  return {
    id: row.id,
    clientId: row.client_id ?? `server-${row.id}`,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: Boolean(row.is_active),
    updatedAt: toIso(row.updated_at)
  };
}

function mapHabitEntry(row: HabitEntryRow) {
  return {
    habitId: row.habit_id,
    habitClientId: row.habit_client_id ?? `server-${row.habit_id}`,
    date: row.date,
    completed: Boolean(row.completed),
    updatedAt: toIso(row.updated_at)
  };
}

function toIso(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function toMillis(value?: string | null) {
  return new Date(toIso(value)).getTime();
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
