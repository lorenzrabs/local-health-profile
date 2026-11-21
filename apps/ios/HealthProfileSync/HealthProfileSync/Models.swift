import Foundation

struct PairingConfig: Codable, Equatable {
    var serverUrl: String
    var token: String
}

struct HealthKitSyncPayload: Encodable {
    var deviceName: String
    var samples: [HealthSamplePayload]
    var workouts: [WorkoutPayload]
}

struct HealthSamplePayload: Encodable {
    var sourceId: String
    var type: String
    var unit: String
    var value: Double
    var startAt: String
    var endAt: String
    var sourceName: String
    var metadata: [String: String]
}

struct WorkoutPayload: Encodable {
    var sourceId: String
    var activityType: String
    var startAt: String
    var endAt: String
    var durationSeconds: Double
    var distanceMeters: Double?
    var activeEnergyKcal: Double?
    var averageHeartRate: Double?
    var metadata: [String: String]
}

struct SyncResult: Codable {
    struct Imported: Codable {
        var samples: Int
        var workouts: Int
    }

    var ok: Bool
    var imported: Imported
}

struct HabitDefinition: Codable, Identifiable, Equatable {
    var id: Int
    var clientId: String
    var name: String
    var sortOrder: Int
    var isActive: Bool
    var updatedAt: String

    init(id: Int, clientId: String, name: String, sortOrder: Int, isActive: Bool, updatedAt: String) {
        self.id = id
        self.clientId = clientId
        self.name = name
        self.sortOrder = sortOrder
        self.isActive = isActive
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        sortOrder = try container.decode(Int.self, forKey: .sortOrder)
        isActive = try container.decode(Bool.self, forKey: .isActive)
        clientId = try container.decodeIfPresent(String.self, forKey: .clientId) ?? "legacy-\(id)-\(name.lowercased())"
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ISO8601DateFormatter().string(from: Date())
    }
}

struct HabitEntry: Codable, Equatable, Sendable {
    var habitId: Int
    var habitClientId: String
    var date: String
    var completed: Bool
    var updatedAt: String

    init(habitId: Int, habitClientId: String, date: String, completed: Bool, updatedAt: String) {
        self.habitId = habitId
        self.habitClientId = habitClientId
        self.date = date
        self.completed = completed
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        habitId = try container.decode(Int.self, forKey: .habitId)
        habitClientId = try container.decodeIfPresent(String.self, forKey: .habitClientId) ?? "legacy-\(habitId)"
        date = try container.decode(String.self, forKey: .date)
        completed = try container.decode(Bool.self, forKey: .completed)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ISO8601DateFormatter().string(from: Date())
    }
}

struct HabitDay: Codable {
    var date: String
    var definitions: [HabitDefinition]
    var entries: [HabitEntry]
    var completedCount: Int
    var totalCount: Int
    var completionRate: Double
}

struct HabitDefinitionPayload: Encodable {
    var id: Int?
    var clientId: String?
    var name: String
    var sortOrder: Int?
    var isActive: Bool?
    var updatedAt: String?
}

struct HabitEntryPayload: Encodable {
    var habitId: Int?
    var habitClientId: String?
    var date: String
    var completed: Bool
    var updatedAt: String?
}

struct HabitSyncPayload: Encodable {
    var since: String?
    var definitions: [HabitDefinitionPayload]
    var entries: [HabitEntryPayload]
}

struct HabitSyncResponse: Codable {
    var syncedAt: String
    var definitions: [HabitDefinition]
    var entries: [HabitEntry]
}

// A toggle sends one entry. Older caches may use legacy IDs or timestamps without fractional seconds.
enum HabitTogglePlan {
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let plainFormatter = ISO8601DateFormatter()

    static func timestamp(_ value: String) -> TimeInterval {
        (fractionalFormatter.date(from: value) ?? plainFormatter.date(from: value))?.timeIntervalSince1970 ?? 0
    }

    static func matches(_ entry: HabitEntry, habit: HabitDefinition, date: String) -> Bool {
        let sameHabit = (!entry.habitClientId.isEmpty && entry.habitClientId == habit.clientId) || (habit.id > 0 && entry.habitId == habit.id)
        return sameHabit && entry.date == date
    }

    static func request(for entry: HabitEntry, since: String?) -> HabitSyncPayload {
        HabitSyncPayload(
            since: since,
            definitions: [],
            entries: [HabitEntryPayload(
                habitId: entry.habitId > 0 ? entry.habitId : nil,
                habitClientId: entry.habitClientId,
                date: entry.date,
                completed: entry.completed,
                updatedAt: entry.updatedAt
            )]
        )
    }
}

struct HabitHistory: Sendable {
    private var days: [String: [String: HabitEntry]] = [:]

    init(_ entries: [HabitEntry] = []) {
        merge(entries)
    }

    var entries: [HabitEntry] { days.values.flatMap(\.values) }

    func entry(for habit: HabitDefinition, date: String) -> HabitEntry? {
        guard let day = days[date] else { return nil }
        return day[habit.clientId] ?? day.values.first { HabitTogglePlan.matches($0, habit: habit, date: date) }
    }

    @discardableResult
    mutating func merge(_ entries: [HabitEntry]) -> Bool {
        var changed = false
        for entry in entries {
            if let previous = days[entry.date]?[entry.habitClientId] {
                guard previous != entry,
                      previous.updatedAt == entry.updatedAt || HabitTogglePlan.timestamp(previous.updatedAt) <= HabitTogglePlan.timestamp(entry.updatedAt) else {
                    continue
                }
            }
            days[entry.date, default: [:]][entry.habitClientId] = entry
            changed = true
        }
        return changed
    }
}

actor HabitHistoryCache {
    static let key = "localHabitEntriesJson"
    private var lastSavedRevision = 0

    func save(_ history: HabitHistory, revision: Int) {
        guard revision > lastSavedRevision,
              let data = try? JSONEncoder().encode(history.entries),
              let json = String(data: data, encoding: .utf8) else { return }
        UserDefaults.standard.set(json, forKey: Self.key)
        lastSavedRevision = revision
    }
}

struct ShoppingListExportsResponse: Codable {
    var exports: [ShoppingListExport]
}

struct ShoppingListExport: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var items: [ShoppingListExportItem]
    var createdAt: String
    var consumedAt: String?
}

struct ShoppingListExportItem: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var name: String
    var amount: Double?
    var unit: String?
    var category: String?
    var note: String?
    var sourceRecipeNames: [String]?
}

struct ShoppingListConsumePayload: Encodable {
    var targetReminderListName: String
    var createdReminderCount: Int
}

struct ShoppingListErrorPayload: Encodable {
    var message: String
}

struct ShoppingListConsumeResponse: Codable {
    var id: String
    var status: String
    var consumedAt: String?
    var targetReminderListName: String?
    var createdReminderCount: Int?
}

struct Recipe: Codable, Identifiable, Equatable, Sendable {
    var id: Int
    var name: String
    var category: String
    var instructions: String
    var prepNotes: String
    var servingBase: Double
    var items: [RecipeItem]
    var nutrientsPerServing: [RecipeNutrient]
}

struct RecipeItem: Codable, Equatable, Sendable {
    var name: String
    var amount: Double
    var unit: String
    var excludeFromNutrition: Bool
}

struct RecipeNutrient: Codable, Equatable, Sendable {
    var key: String
    var label: String
    var amount: Double
    var unit: String
    var category: String
}

struct RecipeSelection: Equatable {
    var recipe: Recipe
    var portions: Int
}

enum RecipePresentation {
    static func nutrientTotal(perServing: Double, portions: Int) -> Double {
        perServing * Double(min(99, max(1, portions)))
    }
}
