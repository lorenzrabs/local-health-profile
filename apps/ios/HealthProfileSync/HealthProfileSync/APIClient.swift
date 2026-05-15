import Foundation

enum APIClientError: LocalizedError {
    case invalidServerUrl
    case missingToken
    case badStatus(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidServerUrl:
            return "Die Server-URL ist ungültig."
        case .missingToken:
            return "Der Pairing-Token fehlt."
        case .badStatus(let status, let body):
            return "Sync fehlgeschlagen (\(status)): \(body)"
        }
    }
}

final class APIClient {
    func syncInBatches(
        payload: HealthKitSyncPayload,
        config: PairingConfig,
        sampleBatchSize: Int = 750,
        progress: @escaping @MainActor (_ sentSamples: Int, _ totalSamples: Int, _ sentWorkouts: Int, _ totalWorkouts: Int) -> Void
    ) async throws -> SyncResult {
        let totalSamples = payload.samples.count
        let totalWorkouts = payload.workouts.count
        var importedSamples = 0
        var importedWorkouts = 0

        let workoutPayload = HealthKitSyncPayload(
            deviceName: payload.deviceName,
            samples: [],
            workouts: payload.workouts
        )
        if !payload.workouts.isEmpty {
            let result = try await sync(payload: workoutPayload, config: config)
            importedWorkouts += result.imported.workouts
            await progress(0, totalSamples, importedWorkouts, totalWorkouts)
        }

        var start = 0
        while start < payload.samples.count {
            let end = min(start + sampleBatchSize, payload.samples.count)
            let samplePayload = HealthKitSyncPayload(
                deviceName: payload.deviceName,
                samples: Array(payload.samples[start..<end]),
                workouts: []
            )
            let result = try await sync(payload: samplePayload, config: config)
            importedSamples += result.imported.samples
            start = end
            await progress(start, totalSamples, importedWorkouts, totalWorkouts)
        }

        return SyncResult(
            ok: true,
            imported: SyncResult.Imported(samples: importedSamples, workouts: importedWorkouts)
        )
    }

    func sync(payload: HealthKitSyncPayload, config: PairingConfig) async throws -> SyncResult {
        let normalizedConfig = try normalize(config: config)

        guard var components = URLComponents(string: normalizedConfig.serverUrl) else {
            throw APIClientError.invalidServerUrl
        }
        components.path = "/api/sync/healthkit"
        components.query = nil
        components.fragment = nil
        guard let url = components.url else {
            throw APIClientError.invalidServerUrl
        }
        guard !normalizedConfig.token.isEmpty else {
            throw APIClientError.missingToken
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(normalizedConfig.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIClientError.badStatus(status, String(data: data, encoding: .utf8) ?? "")
        }

        return try JSONDecoder().decode(SyncResult.self, from: data)
    }

    func fetchHabits(date: String, config: PairingConfig) async throws -> HabitDay {
        let normalizedConfig = try normalize(config: config)
        let url = try url(for: "/api/habits", queryItems: [URLQueryItem(name: "date", value: date)], config: normalizedConfig)
        var request = URLRequest(url: url)
        request.setValue("Bearer \(normalizedConfig.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIClientError.badStatus(status, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(HabitDay.self, from: data)
    }

    func upsertHabitDefinition(_ payload: HabitDefinitionPayload, config: PairingConfig) async throws -> HabitDefinition {
        let data = try await post(path: "/api/habits/definitions", payload: payload, config: config)
        return try JSONDecoder().decode(HabitDefinition.self, from: data)
    }

    func upsertHabitEntry(_ payload: HabitEntryPayload, config: PairingConfig) async throws -> HabitDay {
        let data = try await post(path: "/api/habits/entries", payload: payload, config: config)
        return try JSONDecoder().decode(HabitDay.self, from: data)
    }

    func fetchHabitSync(since: String?, config: PairingConfig) async throws -> HabitSyncResponse {
        let normalizedConfig = try normalize(config: config)
        let queryItems = since.map { [URLQueryItem(name: "since", value: $0)] } ?? []
        let url = try url(for: "/api/habits/sync", queryItems: queryItems, config: normalizedConfig)
        var request = URLRequest(url: url)
        request.setValue("Bearer \(normalizedConfig.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIClientError.badStatus(status, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(HabitSyncResponse.self, from: data)
    }

    func syncHabits(_ payload: HabitSyncPayload, config: PairingConfig) async throws -> HabitSyncResponse {
        let data = try await post(path: "/api/habits/sync", payload: payload, config: config)
        return try JSONDecoder().decode(HabitSyncResponse.self, from: data)
    }

    func fetchPendingShoppingListExports(config: PairingConfig) async throws -> [ShoppingListExport] {
        let normalizedConfig = try normalize(config: config)
        let url = try url(for: "/api/shopping-list/exports/pending", config: normalizedConfig)
        var request = URLRequest(url: url)
        request.setValue("Bearer \(normalizedConfig.token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIClientError.badStatus(status, String(data: data, encoding: .utf8) ?? "")
        }
        return try JSONDecoder().decode(ShoppingListExportsResponse.self, from: data).exports
    }

    func markShoppingListExportConsumed(
        id: String,
        createdReminderCount: Int,
        targetReminderListName: String,
        config: PairingConfig
    ) async throws -> ShoppingListConsumeResponse {
        let payload = ShoppingListConsumePayload(
            targetReminderListName: targetReminderListName,
            createdReminderCount: createdReminderCount
        )
        let data = try await post(path: "/api/shopping-list/exports/\(id)/consume", payload: payload, config: config)
        return try JSONDecoder().decode(ShoppingListConsumeResponse.self, from: data)
    }

    func reportShoppingListExportError(id: String, message: String, config: PairingConfig) async throws {
        _ = try await post(path: "/api/shopping-list/exports/\(id)/error", payload: ShoppingListErrorPayload(message: message), config: config)
    }

    func normalize(config: PairingConfig) throws -> PairingConfig {
        if let parsed = parsePairingJson(config.serverUrl) ?? parsePairingJson(config.token) {
            return try normalize(config: parsed)
        }

        var serverUrl = clean(config.serverUrl)
        let token = clean(config.token)

        guard !serverUrl.isEmpty else {
            throw APIClientError.invalidServerUrl
        }
        guard !token.isEmpty else {
            throw APIClientError.missingToken
        }

        if !serverUrl.contains("://") {
            serverUrl = "http://\(serverUrl)"
        }

        guard let components = URLComponents(string: serverUrl), components.scheme != nil, components.host != nil else {
            throw APIClientError.invalidServerUrl
        }

        return PairingConfig(serverUrl: serverUrl, token: token)
    }

    private func post<T: Encodable>(path: String, payload: T, config: PairingConfig) async throws -> Data {
        let normalizedConfig = try normalize(config: config)
        let url = try url(for: path, config: normalizedConfig)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(normalizedConfig.token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(payload)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIClientError.badStatus(status, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    private func url(for path: String, queryItems: [URLQueryItem] = [], config: PairingConfig) throws -> URL {
        guard var components = URLComponents(string: config.serverUrl) else {
            throw APIClientError.invalidServerUrl
        }
        components.path = path
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        components.fragment = nil
        guard let url = components.url else {
            throw APIClientError.invalidServerUrl
        }
        return url
    }

    private func parsePairingJson(_ raw: String) -> PairingConfig? {
        let cleaned = clean(raw)
        guard cleaned.first == "{", let data = cleaned.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(PairingConfig.self, from: data)
    }

    private func clean(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\u{00a0}", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
