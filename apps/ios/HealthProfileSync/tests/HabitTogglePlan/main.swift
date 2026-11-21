import Foundation

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fatalError(message) }
}

let old = HabitEntry(habitId: 7, habitClientId: "habit-7", date: "2026-10-21", completed: false, updatedAt: "2026-10-21T10:00:00.000Z")
let other = HabitEntry(habitId: 8, habitClientId: "habit-8", date: "2026-10-20", completed: true, updatedAt: "2026-10-20T10:00:00.000Z")
let habit = HabitDefinition(id: 7, clientId: "habit-7", name: "Test", sortOrder: 0, isActive: true, updatedAt: old.updatedAt)
var history = HabitHistory([old, other])
let newer = HabitEntry(habitId: 7, habitClientId: "habit-7", date: old.date, completed: true, updatedAt: "2026-10-21T10:00:01.000Z")
check(history.merge([newer]), "applying one toggle should change the history")
check(history.entries.count == 2, "one toggle must not duplicate or discard history")
check(history.entry(for: habit, date: old.date)?.completed == true, "toggle should update UI state immediately")
check(history.entry(for: habit, date: other.date) == nil && history.entries.contains(other), "day navigation must only read the selected day")
let latest = HabitEntry(habitId: 7, habitClientId: "habit-7", date: old.date, completed: false, updatedAt: "2026-10-21T10:00:02.000Z")
check(history.merge([latest]), "apply the second toggle")
check(!history.merge([newer, other, latest]), "stale or unchanged server results must not change the cache")
check(history.entry(for: habit, date: old.date) == latest, "rapid second toggle wins locally")
let legacy = HabitEntry(habitId: 7, habitClientId: "legacy-7", date: old.date, completed: true, updatedAt: old.updatedAt)
check(HabitHistory([legacy]).entry(for: habit, date: old.date) == legacy, "older entries can still match by numeric ID")
let payload = HabitTogglePlan.request(for: latest, since: "2026-10-21T10:00:00.000Z")
check(payload.since == "2026-10-21T10:00:00.000Z", "keep cursor")
check(payload.definitions.isEmpty && payload.entries.count == 1, "send exactly one changed entry")
check(payload.entries[0].completed == false, "send latest state")
let localA = HabitDefinition(id: 0, clientId: "offline-a", name: "A", sortOrder: 0, isActive: true, updatedAt: "2026-04-21T09:00:00.000Z")
let localB = HabitDefinition(id: 0, clientId: "offline-b", name: "B", sortOrder: 1, isActive: true, updatedAt: "2026-04-21T09:00:00.000Z")
let offline = HabitHistory([localA, localB].map { habit in
    HabitEntry(habitId: habit.id, habitClientId: habit.clientId, date: "2026-04-21", completed: habit == localA, updatedAt: habit.updatedAt)
})
check(offline.entry(for: localA, date: "2026-04-21")?.completed == true, "first offline habit remains completed")
check(offline.entry(for: localB, date: "2026-04-21")?.completed == false, "different unpaired habits must not overwrite one another")
check(RecipePresentation.nutrientTotal(perServing: 650, portions: 1) == 650, "one portion must show one-serving nutrition")
check(RecipePresentation.nutrientTotal(perServing: 650, portions: 2) == 1300, "two portions must show double nutrition")
check(HabitTogglePlan.timestamp("2026-10-21T10:00:00.001Z") > HabitTogglePlan.timestamp("2026-10-21T10:00:00Z"), "fractional timestamps must compare correctly")
print("HabitTogglePlan OK")
