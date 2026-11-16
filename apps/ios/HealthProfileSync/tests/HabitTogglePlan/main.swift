import Foundation

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
}

let old = HabitEntry(habitId: 7, habitClientId: "habit-7", date: "2026-10-21", completed: false, updatedAt: "2026-10-21T10:00:00.000Z")
let other = HabitEntry(habitId: 8, habitClientId: "habit-8", date: "2026-10-20", completed: true, updatedAt: "2026-10-20T10:00:00.000Z")
let newer = HabitTogglePlan.replacing([old, other], habit: HabitDefinition(id: 7, clientId: "habit-7", name: "Test", sortOrder: 0, isActive: true, updatedAt: old.updatedAt), date: old.date, completed: true, updatedAt: "2026-10-21T10:00:01.000Z")
check(newer.count == 2, "one toggle must not duplicate or discard history")
check(newer.first?.completed == true, "toggle should update UI state immediately")
check(newer.last == other, "other habits must stay unchanged")
let latest = HabitTogglePlan.replacing(newer, habit: HabitDefinition(id: 7, clientId: "habit-7", name: "Test", sortOrder: 0, isActive: true, updatedAt: old.updatedAt), date: old.date, completed: false, updatedAt: "2026-10-21T10:00:02.000Z")
check(latest.count == 2 && latest.first?.completed == false, "rapid second toggle wins locally")
let payload = HabitTogglePlan.request(for: latest[0], since: "2026-10-21T10:00:00.000Z")
check(payload.since == "2026-10-21T10:00:00.000Z", "keep cursor")
check(payload.definitions.isEmpty && payload.entries.count == 1, "send exactly one changed entry")
check(payload.entries[0].completed == false, "send latest state")
let localA = HabitDefinition(id: 0, clientId: "offline-a", name: "A", sortOrder: 0, isActive: true, updatedAt: "2026-04-21T09:00:00.000Z")
let localB = HabitDefinition(id: 0, clientId: "offline-b", name: "B", sortOrder: 1, isActive: true, updatedAt: "2026-04-21T09:00:00.000Z")
let offline = HabitTogglePlan.replacing([], habit: localA, date: "2026-04-21", completed: true, updatedAt: "2026-04-21T09:00:00.000Z")
let withBoth = HabitTogglePlan.replacing(offline, habit: localB, date: "2026-04-21", completed: false, updatedAt: "2026-04-21T09:00:01.000Z")
check(withBoth.count == 2, "Different unpaired habits must not overwrite one another")
check(RecipePresentation.nutrientTotal(perServing: 650, portions: 1) == 650, "one portion must show one-serving nutrition")
check(RecipePresentation.nutrientTotal(perServing: 650, portions: 2) == 1300, "two portions must show double nutrition")
check(HabitTogglePlan.timestamp("2026-10-21T10:00:00.001Z") > HabitTogglePlan.timestamp("2026-10-21T10:00:00Z"), "fractional timestamps must compare correctly")
print("HabitTogglePlan OK")
