import EventKit
import SwiftUI

struct ContentView: View {
    @AppStorage("serverUrl") private var serverUrl = ""
    @AppStorage("pairingToken") private var pairingToken = ""
    @AppStorage("lastSuccessfulHealthSyncAt") private var lastSuccessfulHealthSyncAt = ""
    @AppStorage("hasCompletedFullHealthSync") private var hasCompletedFullHealthSync = false
    @AppStorage("lastHabitSyncAt") private var lastHabitSyncAt = ""
    @AppStorage("localHabitsJson") private var localHabitsJson = ""
    @AppStorage("localHabitEntriesJson") private var localHabitEntriesJson = ""

    @State private var status = "Bereit."
    @State private var habitStatus = ""
    @State private var isWorking = false
    @State private var selectedHabitDate = Date()
    @State private var habits: [HabitDefinition] = []
    @State private var habitEntries: [HabitEntry] = []
    @State private var showingHabitMenu = false
    @State private var newHabitName = ""
    @State private var shoppingExports: [ShoppingListExport] = []
    @State private var shoppingStatus = ""
    @State private var isShoppingWorking = false
    @State private var selectedReminderCalendarIdentifier = ""
    @StateObject private var reminderService = ReminderExportService()

    private let healthKit = HealthKitSyncService()
    private let api = APIClient()
    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    var body: some View {
        NavigationStack {
            TabView {
                habitsScreen
                    .tabItem { Label("Habits", systemImage: "checklist") }

                shoppingListScreen
                    .tabItem { Label("Einkaufsliste", systemImage: "cart") }

                syncScreen
                    .tabItem { Label("Sync", systemImage: "arrow.clockwise") }
            }
            .tint(.black)
            .toolbar(.hidden, for: .navigationBar)
            .preferredColorScheme(.light)
            .onOpenURL(perform: handlePairingUrl)
            .task {
                loadLocalHabits()
                await bidirectionalHabitSync()
                await fetchPendingShoppingListExports()
            }
        }
    }

    private var syncScreen: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                headerCard
                pairingCard
                healthSyncCard
            }
            .padding()
        }
        .background(Color.white)
    }

    private var habitsScreen: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Habits")
                            .font(.largeTitle.weight(.bold))
                            .foregroundStyle(.black)
                        Text(dateTitle(selectedHabitDate))
                            .font(.subheadline)
                            .foregroundStyle(AppTheme.mutedText)
                    }
                    Spacer()
                    Button {
                        showingHabitMenu = true
                    } label: {
                        Image(systemName: "line.3.horizontal")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(.black)
                            .padding(10)
                            .background(Color.white, in: Circle())
                            .overlay(Circle().stroke(Color.black.opacity(0.14)))
                    }
                    .accessibilityLabel("Habits bearbeiten")
                }

                HealthCard {
                    VStack(alignment: .leading, spacing: 18) {
                        HStack {
                            DateButton(systemName: "chevron.left") { moveHabitDate(by: -1) }
                            Spacer()
                            VStack(spacing: 4) {
                                Text("\(completedHabitCount)/\(activeHabits.count)")
                                    .font(.title.weight(.bold))
                                    .foregroundStyle(.black)
                                Text("erledigt")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.mutedText)
                            }
                            Spacer()
                            DateButton(systemName: "chevron.right") { moveHabitDate(by: 1) }
                        }

                        ProgressView(value: activeHabits.isEmpty ? 0 : Double(completedHabitCount) / Double(activeHabits.count))
                            .tint(.black)

                        VStack(spacing: 0) {
                            ForEach(activeHabits) { habit in
                                HabitToggleRow(habit: habit, isCompleted: habitBinding(habit))
                                if habit.id != activeHabits.last?.id {
                                    Divider()
                                }
                            }
                        }
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.black.opacity(0.08)))

                        if activeHabits.isEmpty {
                            Text("Noch keine aktiven Habits. Über das Menü oben rechts kannst du neue anlegen.")
                                .font(.callout)
                                .foregroundStyle(AppTheme.mutedText)
                        }

                        if !habitStatus.isEmpty {
                            Text(habitStatus)
                                .font(.footnote)
                                .foregroundStyle(AppTheme.mutedText)
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color.white)
        .gesture(
            DragGesture().onEnded { value in
                if value.translation.width < -60 {
                    moveHabitDate(by: 1)
                } else if value.translation.width > 60 {
                    moveHabitDate(by: -1)
                }
            }
        )
        .sheet(isPresented: $showingHabitMenu) {
            habitMenu
        }
    }

    private var shoppingListScreen: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Einkaufsliste")
                        .font(.largeTitle.weight(.bold))
                        .foregroundStyle(.black)
                    Text("Aus dem Web-Dashboard bereitgestellte Listen in Apple Erinnerungen übernehmen.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.mutedText)
                }

                HealthCard {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Label("\(shoppingExports.count) offen", systemImage: "cart")
                                .font(.headline)
                                .foregroundStyle(.black)
                            Spacer()
                            Button {
                                Task { await fetchPendingShoppingListExports() }
                            } label: {
                                Image(systemName: "arrow.clockwise")
                            }
                            .buttonStyle(.bordered)
                            .tint(.black)
                            .disabled(isShoppingWorking || !isPaired)
                        }

                        if !isPaired {
                            Text("Kopple die App zuerst mit dem lokalen Dashboard, damit pending Einkaufslisten geladen werden können.")
                                .font(.callout)
                                .foregroundStyle(AppTheme.mutedText)
                        } else if shoppingExports.isEmpty {
                            Text("Keine pending Einkaufsliste. Erzeuge sie im Web unter Meal-Prep Frühstücke.")
                                .font(.callout)
                                .foregroundStyle(AppTheme.mutedText)
                        } else {
                            if reminderService.reminderLists.isEmpty {
                                Button {
                                    Task { await loadReminderListsForShopping() }
                                } label: {
                                    Label("Erinnerungen-Listen laden", systemImage: "list.bullet")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .tint(.black)
                                .disabled(isShoppingWorking)
                            }

                            VStack(spacing: 12) {
                                ForEach(shoppingExports) { export in
                                    ShoppingExportCard(
                                        export: export,
                                        reminderLists: reminderService.reminderLists,
                                        selectedReminderCalendarIdentifier: $selectedReminderCalendarIdentifier,
                                        isWorking: isShoppingWorking,
                                        onImport: {
                                            Task { await importShoppingListExport(export) }
                                        }
                                    )
                                }
                            }
                        }

                        if !shoppingStatus.isEmpty {
                            Text(shoppingStatus)
                                .font(.footnote)
                                .foregroundStyle(AppTheme.mutedText)
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color.white)
    }

    private var headerCard: some View {
        HealthCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("Local-first Companion")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.mutedText)
                    .textCase(.uppercase)
                Text("Sync Now")
                    .font(.title.weight(.bold))
                    .foregroundStyle(.black)
                Text("Scanne im Web-Dashboard den QR-Code mit der iPhone-Kamera. Danach reicht hier ein Tap auf Synchronisieren.")
                    .font(.callout)
                    .foregroundStyle(AppTheme.mutedText)
            }
        }
    }

    private var pairingCard: some View {
        HealthCard {
            VStack(alignment: .leading, spacing: 12) {
                Label(isPaired ? "Gekoppelt" : "Noch nicht gekoppelt", systemImage: isPaired ? "link.circle.fill" : "qrcode")
                    .font(.headline)
                    .foregroundStyle(.black)

                if isPaired {
                    Text(serverUrl)
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedText)
                        .textSelection(.enabled)
                }

                DisclosureGroup(isPaired ? "Manuelle Pairing-Daten anzeigen" : "Manuell koppeln") {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField("Server URL, z. B. http://192.168.0.20:3001", text: $serverUrl)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .textFieldStyle(.roundedBorder)
                            .foregroundStyle(.black)
                        SecureField("Pairing Token", text: $pairingToken)
                            .textInputAutocapitalization(.never)
                            .textFieldStyle(.roundedBorder)
                            .foregroundStyle(.black)
                    }
                    .padding(.top, 8)
                }
                .tint(.black)
            }
        }
    }

    private var healthSyncCard: some View {
        HealthCard {
            VStack(alignment: .leading, spacing: 14) {
                Label("Apple Health Sync", systemImage: "heart.text.square")
                    .font(.headline)
                    .foregroundStyle(.black)

                Text("Erster Sync: komplette HealthKit-Historie. Danach: maximal die letzten 90 Tage plus 3 Tage Sicherheitsfenster.")
                    .font(.callout)
                    .foregroundStyle(AppTheme.mutedText)

                Button {
                    Task { await smartSync() }
                } label: {
                    Label(isWorking ? "Synchronisiere..." : "Synchronisieren", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity, minHeight: 54)
                        .font(.headline)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .tint(.black)
                .disabled(isSyncDisabled)

                Button {
                    Task { await requestAuthorization() }
                } label: {
                    Label("Health erlauben", systemImage: "heart")
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, minHeight: 54)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .tint(.black)
                .disabled(isWorking)

                Button {
                    lastSuccessfulHealthSyncAt = ""
                    hasCompletedFullHealthSync = false
                    status = "Vollsync-Cursor zurückgesetzt. Der nächste Sync liest die komplette Historie."
                } label: {
                    Label("Vollsync neu starten", systemImage: "arrow.counterclockwise")
                        .frame(maxWidth: .infinity, minHeight: 54)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .tint(.black)
                .disabled(isWorking)

                Text(status)
                    .font(.callout)
                    .foregroundStyle(AppTheme.mutedText)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color.black.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private var habitMenu: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Habits bearbeiten")
                            .font(.title2.weight(.bold))
                            .foregroundStyle(.black)
                        Text("Aktive Anker verwalten. Änderungen werden lokal gespeichert und mit dem Dashboard synchronisiert.")
                            .font(.callout)
                            .foregroundStyle(AppTheme.mutedText)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Neues Habit")
                            .font(.headline)
                            .foregroundStyle(.black)
                        HStack(spacing: 10) {
                            TextField("Name", text: $newHabitName)
                                .textInputAutocapitalization(.sentences)
                                .textFieldStyle(.roundedBorder)
                                .foregroundStyle(.black)
                            Button {
                                Task { await addHabit() }
                            } label: {
                                Label("Hinzufügen", systemImage: "plus")
                                    .labelStyle(.titleAndIcon)
                            }
                            .buttonStyle(.bordered)
                            .tint(.black)
                            .disabled(newHabitName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                    .padding(14)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Aktive Habits")
                            .font(.headline)
                            .foregroundStyle(.black)
                        ForEach(activeHabits) { habit in
                            HStack(spacing: 10) {
                                TextField("Habit", text: habitNameBinding(habit))
                                    .textFieldStyle(.roundedBorder)
                                    .foregroundStyle(.black)
                                    .onSubmit {
                                        Task { await syncHabitDefinition(localId: habit.id) }
                                    }
                                Button(role: .destructive) {
                                    Task { await archiveHabit(habit) }
                                } label: {
                                    Image(systemName: "archivebox")
                                }
                                .buttonStyle(.bordered)
                                .tint(.black)
                            }
                            if habit.id != activeHabits.last?.id {
                                Divider()
                            }
                        }
                    }
                    .padding(14)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    if !archivedHabits.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Archiviert")
                                .font(.headline)
                                .foregroundStyle(.black)
                            ForEach(archivedHabits) { habit in
                                HStack {
                                    Text(habit.name)
                                        .font(.body)
                                        .foregroundStyle(AppTheme.mutedText)
                                    Spacer()
                                    Button {
                                        Task { await reactivateHabit(habit) }
                                    } label: {
                                        Label("Reaktivieren", systemImage: "arrow.counterclockwise")
                                            .labelStyle(.titleAndIcon)
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(.black)
                                }
                                if habit.id != archivedHabits.last?.id {
                                    Divider()
                                }
                            }
                        }
                        .padding(14)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
                .padding()
            }
            .background(Color(white: 0.94))
            .tint(.black)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fertig") {
                        showingHabitMenu = false
                        Task { await bidirectionalHabitSync() }
                    }
                    .foregroundStyle(.black)
                }
            }
        }
        .preferredColorScheme(.light)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    private var isPaired: Bool {
        !serverUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !pairingToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var isSyncDisabled: Bool {
        isWorking || !isPaired
    }

    private var activeHabits: [HabitDefinition] {
        sanitizedHabits.filter(\.isActive)
    }

    private var archivedHabits: [HabitDefinition] {
        sanitizedHabits.filter { !$0.isActive }
    }

    private var sanitizedHabits: [HabitDefinition] {
        Self.deduplicateHabits(habits)
    }

    private var selectedHabitDateKey: String {
        Self.dateKey(selectedHabitDate)
    }

    private var completedHabitCount: Int {
        activeHabits.filter { isHabitCompleted($0) }.count
    }

    @MainActor
    private func fetchPendingShoppingListExports() async {
        guard isPaired else { return }
        isShoppingWorking = true
        defer { isShoppingWorking = false }
        do {
            shoppingExports = try await api.fetchPendingShoppingListExports(config: currentConfig)
            shoppingStatus = shoppingExports.isEmpty ? "Keine pending Einkaufsliste." : "Pending Einkaufslisten geladen."
        } catch {
            shoppingStatus = "Einkaufslisten-Sync fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func loadReminderListsForShopping() async {
        isShoppingWorking = true
        defer { isShoppingWorking = false }
        do {
            guard try await reminderService.requestAccessIfNeeded() else {
                shoppingStatus = "Zugriff auf Apple Erinnerungen wurde nicht erlaubt."
                return
            }
            if let calendar = reminderService.calendar(preferredIdentifier: selectedReminderCalendarIdentifier, preferredName: "Einkauf") {
                selectedReminderCalendarIdentifier = calendar.calendarIdentifier
                shoppingStatus = "Erinnerungen-Liste „\(calendar.title)” ausgewählt."
            } else {
                shoppingStatus = "Keine beschreibbare Erinnerungen-Liste gefunden."
            }
        } catch {
            shoppingStatus = "Erinnerungen-Listen konnten nicht geladen werden: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func importShoppingListExport(_ export: ShoppingListExport) async {
        guard isPaired else {
            shoppingStatus = "Bitte zuerst mit dem lokalen Dashboard koppeln."
            return
        }

        isShoppingWorking = true
        defer { isShoppingWorking = false }

        do {
            guard try await reminderService.requestAccessIfNeeded() else {
                let message = "Zugriff auf Apple Erinnerungen wurde nicht erlaubt."
                shoppingStatus = message
                try? await api.reportShoppingListExportError(id: export.id, message: message, config: currentConfig)
                return
            }

            guard let calendar = reminderService.calendar(
                preferredIdentifier: selectedReminderCalendarIdentifier,
                preferredName: "Einkauf"
            ) else {
                let message = "Keine beschreibbare Erinnerungen-Liste gefunden."
                shoppingStatus = message
                try? await api.reportShoppingListExportError(id: export.id, message: message, config: currentConfig)
                return
            }

            selectedReminderCalendarIdentifier = calendar.calendarIdentifier
            let createdCount = try reminderService.createReminders(from: export.items, in: calendar, exportId: export.id)
            _ = try await api.markShoppingListExportConsumed(
                id: export.id,
                createdReminderCount: createdCount,
                targetReminderListName: calendar.title,
                config: currentConfig
            )
            shoppingStatus = "\(createdCount) Erinnerungen in „\(calendar.title)” erstellt."
            await fetchPendingShoppingListExports()
        } catch {
            shoppingStatus = "Reminder-Export fehlgeschlagen: \(error.localizedDescription)"
            try? await api.reportShoppingListExportError(id: export.id, message: error.localizedDescription, config: currentConfig)
        }
    }

    @MainActor
    private func requestAuthorization() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await healthKit.requestAuthorization()
            status = "HealthKit-Berechtigungen wurden angefragt. Du kannst jetzt synchronisieren."
        } catch {
            status = error.localizedDescription
        }
    }

    @MainActor
    private func smartSync() async {
        isWorking = true
        defer { isWorking = false }
        do {
            try await healthKit.requestAuthorization()
            let end = Date()
            let isFirstFullSync = !hasCompletedFullHealthSync && isoFormatter.date(from: lastSuccessfulHealthSyncAt) == nil
            let start = syncStartDate(fallbackEnd: end)
            let result = try await syncHistory(start: start, end: end)
            lastSuccessfulHealthSyncAt = isoFormatter.string(from: end)
            hasCompletedFullHealthSync = true
            await bidirectionalHabitSync()
            let syncLabel = isFirstFullSync ? "Vollsync" : "90-Tage-Sync"
            status = "\(syncLabel) erfolgreich: \(result.samples) Samples, \(result.workouts) Workouts."
        } catch {
            status = error.localizedDescription
        }
    }

    @MainActor
    private func syncHistory(start: Date, end: Date) async throws -> (samples: Int, workouts: Int) {
        let calendar = Calendar.current
        let chunkDays = 14
        let config = PairingConfig(serverUrl: serverUrl, token: pairingToken)
        let totalDays = max(1, calendar.dateComponents([.day], from: start, to: end).day ?? 1)
        var cursor = start
        var importedSamples = 0
        var importedWorkouts = 0
        var completedDays = 0

        while cursor < end {
            let next = min(calendar.date(byAdding: .day, value: chunkDays, to: cursor) ?? end, end)
            let rangeLabel = "\(shortDate(cursor)) - \(shortDate(next))"
            status = "Lese HealthKit: \(rangeLabel)..."

            let payload = try await healthKit.makePayload(start: cursor, end: next)
            status = "Sende \(rangeLabel): \(payload.samples.count) Samples, \(payload.workouts.count) Workouts..."

            let result = try await api.syncInBatches(
                payload: payload,
                config: config,
                progress: { sentSamples, totalSamples, sentWorkouts, totalWorkouts in
                    status = "Sync \(rangeLabel): \(sentSamples)/\(totalSamples) Samples, \(sentWorkouts)/\(totalWorkouts) Workouts."
                }
            )

            importedSamples += result.imported.samples
            importedWorkouts += result.imported.workouts
            completedDays = min(totalDays, completedDays + max(1, calendar.dateComponents([.day], from: cursor, to: next).day ?? chunkDays))
            status = "Gesamt: \(completedDays)/\(totalDays) Tage, \(importedSamples) Samples, \(importedWorkouts) Workouts."
            cursor = next
        }

        return (importedSamples, importedWorkouts)
    }

    private func syncStartDate(fallbackEnd: Date) -> Date {
        let calendar = Calendar.current
        let hasPriorSuccessfulSync = hasCompletedFullHealthSync || isoFormatter.date(from: lastSuccessfulHealthSyncAt) != nil

        if hasPriorSuccessfulSync {
            let ninetyDaysAgo = calendar.date(byAdding: .day, value: -90, to: fallbackEnd) ?? fallbackEnd

            if let last = isoFormatter.date(from: lastSuccessfulHealthSyncAt),
               let overlapped = calendar.date(byAdding: .day, value: -3, to: last) {
                return max(overlapped, ninetyDaysAgo)
            }

            return ninetyDaysAgo
        }

        var components = DateComponents()
        components.year = 2014
        components.month = 9
        components.day = 17
        return calendar.date(from: components) ?? fallbackEnd
    }

    private func handlePairingUrl(_ url: URL) {
        guard url.scheme == "healthprofile",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.host == "pair" else {
            return
        }

        let items = components.queryItems ?? []
        let incomingServerUrl = items.first(where: { $0.name == "serverUrl" })?.value ?? ""
        let incomingToken = items.first(where: { $0.name == "token" })?.value ?? ""
        guard !incomingServerUrl.isEmpty, !incomingToken.isEmpty else {
            status = "Pairing-Link unvollständig."
            return
        }

        serverUrl = incomingServerUrl
        pairingToken = incomingToken
        status = "Gekoppelt. Du kannst jetzt synchronisieren."
        Task {
            await bidirectionalHabitSync()
            await fetchPendingShoppingListExports()
        }
    }

    private func habitBinding(_ habit: HabitDefinition) -> Binding<Bool> {
        Binding(
            get: { isHabitCompleted(habit) },
            set: { completed in
                setHabit(habit, completed: completed)
            }
        )
    }

    private func habitNameBinding(_ habit: HabitDefinition) -> Binding<String> {
        Binding(
            get: { habits.first(where: { $0.id == habit.id })?.name ?? habit.name },
            set: { name in
                if let index = habits.firstIndex(where: { $0.id == habit.id }) {
                    habits[index].name = name
                    habits[index].updatedAt = isoFormatter.string(from: Date())
                    habits = Self.deduplicateHabits(habits)
                    saveLocalHabits()
                }
            }
        )
    }

    private func isHabitCompleted(_ habit: HabitDefinition) -> Bool {
        habitEntries.first {
            ($0.habitClientId == habit.clientId || $0.habitId == habit.id) && $0.date == selectedHabitDateKey
        }?.completed ?? false
    }

    private func setHabit(_ habit: HabitDefinition, completed: Bool) {
        let now = isoFormatter.string(from: Date())
        if let index = habitEntries.firstIndex(where: { ($0.habitClientId == habit.clientId || $0.habitId == habit.id) && $0.date == selectedHabitDateKey }) {
            habitEntries[index].completed = completed
            habitEntries[index].updatedAt = now
            habitEntries[index].habitId = habit.id
            habitEntries[index].habitClientId = habit.clientId
        } else {
            habitEntries.append(HabitEntry(habitId: habit.id, habitClientId: habit.clientId, date: selectedHabitDateKey, completed: completed, updatedAt: now))
        }
        habitEntries = Self.deduplicateEntries(habitEntries)
        saveLocalHabits()
        Task { await bidirectionalHabitSync() }
    }

    @MainActor
    private func addHabit() async {
        let name = newHabitName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }

        if let existing = habits.first(where: { Self.normalizedName($0.name) == Self.normalizedName(name) }) {
            await reactivateHabit(existing)
            newHabitName = ""
            return
        }

        let now = isoFormatter.string(from: Date())
        let localHabit = HabitDefinition(id: nextLocalHabitId(), clientId: UUID().uuidString, name: name, sortOrder: nextSortOrder(), isActive: true, updatedAt: now)
        habits.append(localHabit)
        habits = Self.deduplicateHabits(habits)
        newHabitName = ""
        saveLocalHabits()
        await bidirectionalHabitSync()
    }

    @MainActor
    private func archiveHabit(_ habit: HabitDefinition) async {
        setHabitActiveState(habit.id, isActive: false)
        saveLocalHabits()
        await bidirectionalHabitSync()
    }

    @MainActor
    private func reactivateHabit(_ habit: HabitDefinition) async {
        setHabitActiveState(habit.id, isActive: true)
        saveLocalHabits()
        await bidirectionalHabitSync()
    }

    private func setHabitActiveState(_ id: Int, isActive: Bool) {
        if let index = habits.firstIndex(where: { $0.id == id }) {
            habits[index].isActive = isActive
            habits[index].updatedAt = isoFormatter.string(from: Date())
        }
        habits = Self.deduplicateHabits(habits)
    }

    private func moveHabitDate(by days: Int) {
        selectedHabitDate = Calendar.current.date(byAdding: .day, value: days, to: selectedHabitDate) ?? selectedHabitDate
        Task { await bidirectionalHabitSync() }
    }

    private func loadLocalHabits() {
        let decoder = JSONDecoder()
        if let data = localHabitsJson.data(using: .utf8),
           let decoded = try? decoder.decode([HabitDefinition].self, from: data),
           !decoded.isEmpty {
            habits = Self.deduplicateHabits(decoded)
        } else {
            habits = Self.defaultHabits
        }

        if let data = localHabitEntriesJson.data(using: .utf8),
           let decoded = try? decoder.decode([HabitEntry].self, from: data) {
            habitEntries = Self.deduplicateEntries(decoded)
        }
        for entryIndex in habitEntries.indices {
            if let habit = habits.first(where: { $0.id == habitEntries[entryIndex].habitId }) {
                habitEntries[entryIndex].habitClientId = habit.clientId
            }
        }
        saveLocalHabits()
    }

    private func saveLocalHabits() {
        let encoder = JSONEncoder()
        let cleanHabits = Self.deduplicateHabits(habits)
        if habits != cleanHabits {
            habits = cleanHabits
        }
        habitEntries = Self.deduplicateEntries(habitEntries)
        if let data = try? encoder.encode(habits), let json = String(data: data, encoding: .utf8) {
            localHabitsJson = json
        }
        if let data = try? encoder.encode(habitEntries), let json = String(data: data, encoding: .utf8) {
            localHabitEntriesJson = json
        }
    }

    @MainActor
    private func bidirectionalHabitSync() async {
        guard isPaired else { return }
        do {
            let payload = HabitSyncPayload(
                since: lastHabitSyncAt.isEmpty ? nil : lastHabitSyncAt,
                definitions: habits.map {
                    HabitDefinitionPayload(
                        id: $0.id > 0 ? $0.id : nil,
                        clientId: $0.clientId,
                        name: $0.name,
                        sortOrder: $0.sortOrder,
                        isActive: $0.isActive,
                        updatedAt: $0.updatedAt
                    )
                },
                entries: habitEntries.map {
                    HabitEntryPayload(
                        habitId: $0.habitId > 0 ? $0.habitId : nil,
                        habitClientId: $0.habitClientId,
                        date: $0.date,
                        completed: $0.completed,
                        updatedAt: $0.updatedAt
                    )
                }
            )
            let response = try await api.syncHabits(payload, config: currentConfig)
            applyHabitSyncResponse(response)
            saveLocalHabits()
            lastHabitSyncAt = response.syncedAt
            habitStatus = ""
        } catch {
            habitStatus = "Habit-Sync fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func syncHabitDefinition(localId: Int) async {
        if let index = habits.firstIndex(where: { $0.id == localId }) {
            habits[index].updatedAt = isoFormatter.string(from: Date())
            saveLocalHabits()
        }
        await bidirectionalHabitSync()
    }

    private var currentConfig: PairingConfig {
        PairingConfig(serverUrl: serverUrl, token: pairingToken)
    }

    private func applyHabitSyncResponse(_ response: HabitSyncResponse) {
        for definition in response.definitions {
            adoptServerHabit(definition, replacingLocalId: habits.first {
                $0.clientId == definition.clientId || Self.normalizedName($0.name) == Self.normalizedName(definition.name)
            }?.id ?? definition.id)
        }

        for entry in response.entries {
            if let index = habitEntries.firstIndex(where: { $0.date == entry.date && $0.habitClientId == entry.habitClientId }) {
                if Self.timestamp(entry.updatedAt) >= Self.timestamp(habitEntries[index].updatedAt) {
                    habitEntries[index] = entry
                }
            } else {
                habitEntries.append(entry)
            }
        }

        habits = Self.deduplicateHabits(habits)
        habitEntries = Self.deduplicateEntries(habitEntries)
    }

    private func mergeServerHabitDay(_ day: HabitDay) {
        for definition in day.definitions {
            if let local = habits.first(where: { Self.normalizedName($0.name) == Self.normalizedName(definition.name) }) {
                adoptServerHabit(definition, replacingLocalId: local.id)
            } else {
                habits.append(definition)
            }
        }
        habitEntries.removeAll { $0.date == day.date && day.definitions.map(\.id).contains($0.habitId) }
        habitEntries.append(contentsOf: day.entries)
        habits = Self.deduplicateHabits(habits)
        habitEntries = Self.deduplicateEntries(habitEntries)
    }

    private func adoptServerHabit(_ serverHabit: HabitDefinition, replacingLocalId localId: Int) {
        if let existingIndex = habits.firstIndex(where: { $0.clientId == serverHabit.clientId || $0.id == serverHabit.id }) {
            habits[existingIndex] = serverHabit
        } else if let localIndex = habits.firstIndex(where: { $0.id == localId }) {
            habits[localIndex] = serverHabit
        } else {
            habits.append(serverHabit)
        }
        for entryIndex in habitEntries.indices where habitEntries[entryIndex].habitId == localId || habitEntries[entryIndex].habitClientId == serverHabit.clientId {
            habitEntries[entryIndex].habitId = serverHabit.id
            habitEntries[entryIndex].habitClientId = serverHabit.clientId
        }
        habits = Self.deduplicateHabits(habits)
        habitEntries = Self.deduplicateEntries(habitEntries)
    }

    private func nextLocalHabitId() -> Int {
        min(-1, (habits.map(\.id).min() ?? 0) - 1)
    }

    private func nextSortOrder() -> Int {
        (habits.map(\.sortOrder).max() ?? -1) + 1
    }

    private func shortDate(_ date: Date) -> String {
        date.formatted(.dateTime.day().month().year())
    }

    private func dateTitle(_ date: Date) -> String {
        date.formatted(.dateTime.weekday(.wide).day().month().year())
    }

    private static func dateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func normalizedName(_ name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func deduplicateHabits(_ input: [HabitDefinition]) -> [HabitDefinition] {
        var byName: [String: HabitDefinition] = [:]
        for habit in input {
            let key = normalizedName(habit.name)
            guard !key.isEmpty else { continue }
            if let existing = byName[key] {
                let preferred = preferServerBackedHabit(existing, habit)
                byName[key] = HabitDefinition(
                    id: preferred.id,
                    clientId: preferred.clientId,
                    name: preferred.name,
                    sortOrder: min(existing.sortOrder, habit.sortOrder),
                    isActive: Self.timestamp(existing.updatedAt) >= Self.timestamp(habit.updatedAt) ? existing.isActive : habit.isActive,
                    updatedAt: Self.timestamp(existing.updatedAt) >= Self.timestamp(habit.updatedAt) ? existing.updatedAt : habit.updatedAt
                )
            } else {
                byName[key] = habit
            }
        }
        return byName.values.sorted { left, right in
            if left.sortOrder == right.sortOrder { return left.id < right.id }
            return left.sortOrder < right.sortOrder
        }
    }

    private static func preferServerBackedHabit(_ left: HabitDefinition, _ right: HabitDefinition) -> HabitDefinition {
        if left.id > 0 && right.id <= 0 { return left }
        if right.id > 0 && left.id <= 0 { return right }
        return left.id <= right.id ? left : right
    }

    private static func deduplicateEntries(_ input: [HabitEntry]) -> [HabitEntry] {
        var byKey: [String: HabitEntry] = [:]
        for entry in input {
            let key = "\(entry.date)-\(entry.habitClientId)"
            if let existing = byKey[key], timestamp(existing.updatedAt) > timestamp(entry.updatedAt) {
                continue
            }
            byKey[key] = entry
        }
        return byKey.values.sorted {
            if $0.date == $1.date { return $0.habitClientId < $1.habitClientId }
            return $0.date < $1.date
        }
    }

    private static func timestamp(_ value: String) -> TimeInterval {
        ISO8601DateFormatter().date(from: value)?.timeIntervalSince1970 ?? 0
    }

    private static let defaultHabits = [
        HabitDefinition(id: 1, clientId: "default-kreatin", name: "Kreatin", sortOrder: 0, isActive: true, updatedAt: "2026-01-01T00:00:00Z"),
        HabitDefinition(id: 2, clientId: "default-inulin", name: "Inulin", sortOrder: 1, isActive: true, updatedAt: "2026-01-01T00:00:00Z"),
        HabitDefinition(id: 3, clientId: "default-protein-ok", name: "Protein ok", sortOrder: 2, isActive: true, updatedAt: "2026-01-01T00:00:00Z"),
        HabitDefinition(id: 4, clientId: "default-hydration", name: "Hydration", sortOrder: 3, isActive: true, updatedAt: "2026-01-01T00:00:00Z"),
        HabitDefinition(id: 5, clientId: "default-brokkoli-blumenkohl", name: "Brokkoli/Blumenkohl", sortOrder: 4, isActive: true, updatedAt: "2026-01-01T00:00:00Z"),
        HabitDefinition(id: 6, clientId: "default-linsen-leguminosen", name: "Linsen/Leguminosen", sortOrder: 5, isActive: true, updatedAt: "2026-01-01T00:00:00Z"),
        HabitDefinition(id: 7, clientId: "default-rauchfrei-reduktion", name: "Rauchfrei/Reduktion", sortOrder: 6, isActive: true, updatedAt: "2026-01-01T00:00:00Z")
    ]
}

private struct HabitToggleRow: View {
    let habit: HabitDefinition
    @Binding var isCompleted: Bool

    var body: some View {
        Toggle(isOn: $isCompleted) {
            Text(habit.name)
                .font(.body.weight(.medium))
                .foregroundStyle(.black)
        }
        .toggleStyle(.switch)
        .tint(.black)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}

private struct DateButton: View {
    let systemName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.headline)
                .foregroundStyle(.black)
                .frame(width: 42, height: 42)
                .background(Color.white, in: Circle())
                .overlay(Circle().stroke(Color.black.opacity(0.14)))
        }
    }
}

private struct ShoppingExportCard: View {
    let export: ShoppingListExport
    let reminderLists: [EKCalendar]
    @Binding var selectedReminderCalendarIdentifier: String
    let isWorking: Bool
    let onImport: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(export.title)
                        .font(.headline)
                        .foregroundStyle(.black)
                    Text("\(export.items.count) Einträge · \(formattedDate(export.createdAt))")
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedText)
                }
                Spacer()
            }

            if !reminderLists.isEmpty {
                Picker("Ziel-Liste", selection: $selectedReminderCalendarIdentifier) {
                    Text("Automatisch").tag("")
                    ForEach(reminderLists, id: \.calendarIdentifier) { list in
                        Text(list.title).tag(list.calendarIdentifier)
                    }
                }
                .pickerStyle(.menu)
                .tint(.black)
            }

            DisclosureGroup("Vorschau") {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(export.items) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ReminderExportService.formatReminderTitle(item))
                                .font(.body)
                                .foregroundStyle(.black)
                            if let sources = item.sourceRecipeNames, !sources.isEmpty {
                                Text("Quelle: \(sources.joined(separator: ", "))")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.mutedText)
                            }
                        }
                    }
                }
                .padding(.top, 8)
            }
            .tint(.black)

            Button(action: onImport) {
                Label(isWorking ? "Übernehme..." : "In Erinnerungen übernehmen", systemImage: "plus.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.black)
            .disabled(isWorking || export.items.isEmpty)
        }
        .padding(14)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.black.opacity(0.08)))
    }

    private func formattedDate(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(.dateTime.day().month().hour().minute())
    }
}

@MainActor
private final class ReminderExportService: ObservableObject {
    private let eventStore = EKEventStore()

    @Published var reminderLists: [EKCalendar] = []

    func requestAccessIfNeeded() async throws -> Bool {
        let status = EKEventStore.authorizationStatus(for: .reminder)

        switch status {
        case .fullAccess, .authorized:
            loadReminderLists()
            return true
        case .notDetermined:
            let granted: Bool
            if #available(iOS 17.0, *) {
                granted = try await eventStore.requestFullAccessToReminders()
            } else {
                granted = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
                    eventStore.requestAccess(to: .reminder) { granted, error in
                        if let error {
                            continuation.resume(throwing: error)
                        } else {
                            continuation.resume(returning: granted)
                        }
                    }
                }
            }
            if granted {
                loadReminderLists()
            }
            return granted
        case .denied, .restricted, .writeOnly:
            return false
        @unknown default:
            return false
        }
    }

    func calendar(preferredIdentifier: String, preferredName: String) -> EKCalendar? {
        loadReminderLists()
        if !preferredIdentifier.isEmpty,
           let selected = reminderLists.first(where: { $0.calendarIdentifier == preferredIdentifier }) {
            return selected
        }
        if let named = reminderLists.first(where: { $0.title.localizedCaseInsensitiveCompare(preferredName) == .orderedSame }) {
            return named
        }
        if let defaultCalendar = eventStore.defaultCalendarForNewReminders(), defaultCalendar.allowsContentModifications {
            return defaultCalendar
        }
        return reminderLists.first
    }

    func createReminders(from items: [ShoppingListExportItem], in calendar: EKCalendar, exportId: String) throws -> Int {
        var createdCount = 0

        for item in items where !item.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let reminder = EKReminder(eventStore: eventStore)
            reminder.calendar = calendar
            reminder.title = Self.formatReminderTitle(item)
            reminder.notes = Self.formatReminderNotes(item, exportId: exportId)

            try eventStore.save(reminder, commit: false)
            createdCount += 1
        }

        guard createdCount > 0 else {
            throw ReminderExportError.emptyList
        }

        try eventStore.commit()
        return createdCount
    }

    func loadReminderLists() {
        reminderLists = eventStore
            .calendars(for: .reminder)
            .filter(\.allowsContentModifications)
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    }

    static func formatReminderTitle(_ item: ShoppingListExportItem) -> String {
        let name = item.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let amount = item.amount, let unit = item.unit, !unit.isEmpty else {
            return name
        }
        return "\(formatAmount(amount)) \(unit) \(name)"
    }

    static func formatReminderNotes(_ item: ShoppingListExportItem, exportId: String) -> String {
        var lines: [String] = []
        if let sources = item.sourceRecipeNames, !sources.isEmpty {
            lines.append("Quelle: \(sources.joined(separator: ", "))")
        }
        if let note = item.note, !note.isEmpty {
            lines.append(note)
        }
        return lines.joined(separator: "\n")
    }

    private static func formatAmount(_ value: Double) -> String {
        if value.rounded() == value {
            return String(Int(value))
        }
        return value.formatted(.number.precision(.fractionLength(0...2)).locale(Locale(identifier: "de_DE")))
    }
}

private enum ReminderExportError: LocalizedError {
    case emptyList

    var errorDescription: String? {
        switch self {
        case .emptyList:
            return "Die Einkaufsliste enthält keine gültigen Einträge."
        }
    }
}

private enum AppTheme {
    static let mutedText = Color(white: 0.25)
    static let border = Color.black.opacity(0.22)
    static let sheetBackground = Color(white: 0.76)
}

private struct HealthCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.black.opacity(0.10)))
            .shadow(color: Color.black.opacity(0.04), radius: 12, x: 0, y: 6)
    }
}
