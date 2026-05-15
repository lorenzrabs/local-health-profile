import Foundation
import HealthKit
import UIKit

enum HealthKitSyncError: LocalizedError {
    case unavailable

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "HealthKit ist auf diesem Gerät nicht verfügbar."
        }
    }
}

final class HealthKitSyncService {
    private let store = HKHealthStore()
    private let isoFormatter = ISO8601DateFormatter()

    init() {
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    }

    var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]

        [
            HKQuantityTypeIdentifier.heartRate,
            .restingHeartRate,
            .heartRateVariabilitySDNN,
            .stepCount,
            .distanceWalkingRunning,
            .activeEnergyBurned,
            .basalEnergyBurned,
            .vo2Max
        ].compactMap { HKObjectType.quantityType(forIdentifier: $0) }
            .forEach { types.insert($0) }

        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }

        return types
    }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitSyncError.unavailable
        }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    func makePayload(daysBack: Int = 30) async throws -> HealthKitSyncPayload {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -daysBack, to: end) ?? end
        return try await makePayload(start: start, end: end)
    }

    func makePayload(start: Date, end: Date) async throws -> HealthKitSyncPayload {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitSyncError.unavailable
        }

        let deviceName = await MainActor.run { UIDevice.current.name }

        async let quantitySamples = fetchQuantitySamples(start: start, end: end)
        async let sleepSamples = fetchSleepSamples(start: start, end: end)
        async let workouts = fetchWorkouts(start: start, end: end)

        return HealthKitSyncPayload(
            deviceName: deviceName,
            samples: try await quantitySamples + sleepSamples,
            workouts: try await workouts
        )
    }

    private func fetchQuantitySamples(start: Date, end: Date) async throws -> [HealthSamplePayload] {
        let identifiers: [(HKQuantityTypeIdentifier, String, HKUnit, String)] = [
            (.heartRate, "heartRate", HKUnit.count().unitDivided(by: .minute()), "count/min"),
            (.restingHeartRate, "restingHeartRate", HKUnit.count().unitDivided(by: .minute()), "count/min"),
            (.heartRateVariabilitySDNN, "heartRateVariabilitySDNN", HKUnit.secondUnit(with: .milli), "ms"),
            (.stepCount, "stepCount", HKUnit.count(), "count"),
            (.distanceWalkingRunning, "distanceWalkingRunning", HKUnit.meter(), "m"),
            (.activeEnergyBurned, "activeEnergyBurned", HKUnit.kilocalorie(), "kcal"),
            (.basalEnergyBurned, "basalEnergyBurned", HKUnit.kilocalorie(), "kcal"),
            (.vo2Max, "vo2Max", HKUnit.literUnit(with: .milli).unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .minute())), "ml/kg/min")
        ]

        var output: [HealthSamplePayload] = []
        for (identifier, type, unit, unitLabel) in identifiers {
            guard let quantityType = HKObjectType.quantityType(forIdentifier: identifier) else { continue }
            let samples = try await querySamples(type: quantityType, start: start, end: end) as [HKQuantitySample]
            output.append(contentsOf: samples.map { sample in
                HealthSamplePayload(
                    sourceId: sample.uuid.uuidString,
                    type: type,
                    unit: unitLabel,
                    value: sample.quantity.doubleValue(for: unit),
                    startAt: isoFormatter.string(from: sample.startDate),
                    endAt: isoFormatter.string(from: sample.endDate),
                    sourceName: sample.sourceRevision.source.name,
                    metadata: metadata(sample.metadata)
                )
            })
        }
        return output
    }

    private func fetchSleepSamples(start: Date, end: Date) async throws -> [HealthSamplePayload] {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return [] }
        let samples = try await querySamples(type: sleepType, start: start, end: end) as [HKCategorySample]
        return samples
            .filter { $0.value != HKCategoryValueSleepAnalysis.inBed.rawValue }
            .map { sample in
                HealthSamplePayload(
                    sourceId: sample.uuid.uuidString,
                    type: "sleepAnalysis",
                    unit: "stage",
                    value: Double(sample.value),
                    startAt: isoFormatter.string(from: sample.startDate),
                    endAt: isoFormatter.string(from: sample.endDate),
                    sourceName: sample.sourceRevision.source.name,
                    metadata: metadata(sample.metadata)
                )
            }
    }

    private func fetchWorkouts(start: Date, end: Date) async throws -> [WorkoutPayload] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let workouts = (samples as? [HKWorkout] ?? []).map { workout in
                    let formatter = ISO8601DateFormatter.healthProfile
                    return WorkoutPayload(
                        sourceId: workout.uuid.uuidString,
                        activityType: workout.workoutActivityType.name,
                        startAt: formatter.string(from: workout.startDate),
                        endAt: formatter.string(from: workout.endDate),
                        durationSeconds: workout.duration,
                        distanceMeters: workout.totalDistance?.doubleValue(for: .meter()),
                        activeEnergyKcal: workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()),
                        averageHeartRate: nil,
                        metadata: Self.metadata(workout.metadata)
                    )
                }
                continuation.resume(returning: workouts)
            }
            store.execute(query)
        }
    }

    private func querySamples<T: HKSample>(type: HKSampleType, start: Date, end: Date) async throws -> [T] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: samples as? [T] ?? [])
            }
            store.execute(query)
        }
    }

    private static func metadata(_ raw: [String: Any]?) -> [String: String] {
        (raw ?? [:]).reduce(into: [:]) { result, entry in
            result[entry.key] = String(describing: entry.value)
        }
    }

    private func metadata(_ raw: [String: Any]?) -> [String: String] {
        Self.metadata(raw)
    }
}

private extension HKWorkoutActivityType {
    var name: String {
        switch self {
        case .running:
            return "running"
        case .walking:
            return "walking"
        case .cycling:
            return "cycling"
        case .traditionalStrengthTraining:
            return "strengthTraining"
        case .functionalStrengthTraining:
            return "functionalStrengthTraining"
        case .yoga:
            return "yoga"
        case .other:
            return "other"
        default:
            return String(describing: self)
        }
    }
}

private extension ISO8601DateFormatter {
    static var healthProfile: ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }
}
