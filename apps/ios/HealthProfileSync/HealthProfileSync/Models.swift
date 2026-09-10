import Foundation

struct PairingConfig: Codable {
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

struct HabitEntry: Codable, Equatable {
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

struct ShoppingListExportItem: Codable, Identifiable, Equatable {
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

struct Recipe: Codable, Identifiable, Equatable {
    var id: Int
    var name: String
    var category: String
    var instructions: String
    var prepNotes: String
    var servingBase: Double
    var items: [RecipeItem]
    var nutrientsPerServing: [RecipeNutrient]
}

struct RecipeItem: Codable, Equatable {
    var name: String
    var amount: Double
    var unit: String
    var excludeFromNutrition: Bool
}

struct RecipeNutrient: Codable, Equatable {
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
