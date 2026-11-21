import EventKit
import SwiftUI

struct ContentView: View {
    @AppStorage("serverUrl") private var serverUrl = ""
    @AppStorage("pairingToken") private var pairingToken = ""
    @AppStorage("lastSuccessfulHealthSyncAt") private var lastSuccessfulHealthSyncAt = ""
    @AppStorage("hasCompletedFullHealthSync") private var hasCompletedFullHealthSync = false
    @AppStorage("localHabitsJson") private var localHabitsJson = ""
    @AppStorage("localRecipesJson") private var localRecipesJson = ""
    @AppStorage("lastRecipeSyncAt") private var lastRecipeSyncAt = ""

    @State private var status = "Bereit."
    @State private var habitStatus = ""
    @State private var isWorking = false
    @State private var selectedHabitDate = Date()
    @State private var habits: [HabitDefinition] = []
    @State private var habitHistory = HabitHistory()
    @State private var habitHistoryCache = HabitHistoryCache()
    @State private var habitHistoryRevision = 0
    @State private var didLoadHabitCache = false
    @State private var showingHabitMenu = false
    @State private var newHabitName = ""
    @State private var shoppingExports: [ShoppingListExport] = []
    @State private var shoppingStatus = ""
    @State private var isShoppingWorking = false
    @State private var refreshingRecipesFor: PairingConfig?
    @State private var refreshingExportsFor: PairingConfig?
    @State private var selectedReminderCalendarIdentifier = ""
    @State private var recipes: [Recipe] = []
    @State private var selectedRecipeIds: Set<Int> = []
    @State private var recipePortionsById: [Int: Int] = [:]
    @State private var shoppingPreview: ShoppingListExport?
    @State private var reminderLists: [ReminderList] = []
    @State private var reminderService = ReminderExportService()

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
                loadLocalRecipes()
                async let habits: Void = bidirectionalHabitSync()
                async let exports: Void = fetchPendingShoppingListExports()
                async let recipes: Void = refreshRecipesFromServer()
                _ = await (habits, exports, recipes)
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
        let day = selectedHabitDateKey
        let active = activeHabits
        let completed = active.reduce(0) { count, habit in
            count + (habitHistory.entry(for: habit, date: day)?.completed == true ? 1 : 0)
        }
        return ScrollView {
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
                                Text("\(completed)/\(active.count)")
                                    .font(.title.weight(.bold))
                                    .foregroundStyle(.black)
                                Text("erledigt")
                                    .font(.caption)
                                    .foregroundStyle(AppTheme.mutedText)
                            }
                            Spacer()
                            DateButton(systemName: "chevron.right") { moveHabitDate(by: 1) }
                        }

                        ProgressView(value: active.isEmpty ? 0 : Double(completed) / Double(active.count))
                            .tint(.black)

                        VStack(spacing: 0) {
                            ForEach(active) { habit in
                                HabitToggleRow(habit: habit, isCompleted: habitBinding(habit, date: day))
                                if habit.id != active.last?.id {
                                    Divider()
                                }
                            }
                        }
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.black.opacity(0.08)))

                        if active.isEmpty {
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
        .task(id: day) {
            await refreshHabitDay(day)
        }
    }

    private var shoppingListScreen: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Einkaufsliste")
                        .font(.largeTitle.weight(.bold))
                        .foregroundStyle(.black)
                    Text("Rezepte lokal auswählen und in Apple Erinnerungen übernehmen.")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.mutedText)
                }

                recipePickerCard
                pendingShoppingExportsCard
            }
            .padding()
        }
        .background(Color.white)
    }

    private var recipePickerCard: some View {
        HealthCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Label("Rezepte", systemImage: "fork.knife")
                            .font(.headline)
                            .foregroundStyle(.black)
                        Text(recipeSyncSubtitle)
                            .font(.caption)
                            .foregroundStyle(AppTheme.mutedText)
                    }
                    Spacer()
                    Button {
                        Task { await refreshRecipesFromServer(forceStatus: true) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                    .tint(.black)
                    .disabled(refreshingRecipesFor == currentConfig || !isPaired)
                    .accessibilityLabel("Rezepte aktualisieren")
                }

                if recipes.isEmpty {
                    Text(isPaired ? "Noch keine Rezepte im iPhone-Cache. Tippe auf Aktualisieren, solange der lokale Server erreichbar ist." : "Kopple die App zuerst einmal mit dem Dashboard, um Rezepte auf das iPhone zu laden.")
                        .font(.callout)
                        .foregroundStyle(AppTheme.mutedText)
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(recipes) { recipe in
                            RecipeSelectionRow(
                                recipe: recipe,
                                isSelected: selectedRecipeIds.contains(recipe.id),
                                portions: recipePortionsById[recipe.id] ?? 1,
                                onSelectionChange: { setRecipeSelected(recipe.id, selected: $0) },
                                onPortionsChange: { setRecipePortions(recipe.id, portions: $0) }
                            )
                            .equatable()
                        }
                    }

                    if let export = shoppingPreview {
                        LocalShoppingPreviewCard(
                            export: export,
                            reminderLists: reminderLists,
                            selectedReminderCalendarIdentifier: $selectedReminderCalendarIdentifier,
                            isWorking: isShoppingWorking,
                            onLoadReminderLists: {
                                Task { await loadReminderListsForShopping() }
                            },
                            onImport: {
                                Task { await importLocalRecipeShoppingList(export) }
                            }
                        )
                    } else {
                        Text("Wähle mindestens ein Rezept aus, um lokal eine Einkaufsliste zu erzeugen.")
                            .font(.callout)
                            .foregroundStyle(AppTheme.mutedText)
                    }
                }
            }
        }
    }

    private var pendingShoppingExportsCard: some View {
        HealthCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label("\(shoppingExports.count) Web-Liste\(shoppingExports.count == 1 ? "" : "n") offen", systemImage: "cart")
                        .font(.headline)
                        .foregroundStyle(.black)
                    Spacer()
                    Button {
                        Task { await fetchPendingShoppingListExports(forceStatus: true) }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                    .tint(.black)
                    .disabled(refreshingExportsFor == currentConfig || !isPaired)
                    .accessibilityLabel("Pending Web-Einkaufslisten aktualisieren")
                }

                Text("Optional: Aus dem Web-Dashboard bereitgestellte Listen übernehmen.")
                    .font(.callout)
                    .foregroundStyle(AppTheme.mutedText)

                if !isPaired {
                    Text("Kopple die App zuerst mit dem lokalen Dashboard, damit pending Einkaufslisten geladen werden können.")
                        .font(.callout)
                        .foregroundStyle(AppTheme.mutedText)
                } else if shoppingExports.isEmpty {
                    Text("Keine pending Einkaufsliste aus dem Web.")
                        .font(.callout)
                        .foregroundStyle(AppTheme.mutedText)
                } else {
                    if reminderLists.isEmpty {
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
                                reminderLists: reminderLists,
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
        Self.dayFormatter.string(from: selectedHabitDate)
    }

    private var recipeSyncSubtitle: String {
        if recipes.isEmpty {
            return "Noch kein lokaler Rezeptcache."
        }
        guard let date = isoFormatter.date(from: lastRecipeSyncAt) else {
            return "\(recipes.count) Rezepte lokal verfügbar."
        }
        return "\(recipes.count) Rezepte · aktualisiert \(date.formatted(.dateTime.day().month().hour().minute()))"
    }

    private func rebuildShoppingPreview() {
        let selections = recipes.compactMap { recipe -> RecipeSelection? in
            guard selectedRecipeIds.contains(recipe.id) else { return nil }
            return RecipeSelection(recipe: recipe, portions: recipePortionsById[recipe.id] ?? 1)
        }
        if selections.isEmpty {
            shoppingPreview = nil
        } else {
            shoppingPreview = LocalShoppingListBuilder.generate(from: selections, createdAt: isoFormatter.string(from: Date()))
        }
    }

    private func setRecipeSelected(_ id: Int, selected: Bool) {
        if selected {
            selectedRecipeIds.insert(id)
        } else {
            selectedRecipeIds.remove(id)
        }
        rebuildShoppingPreview()
    }

    private func setRecipePortions(_ id: Int, portions: Int) {
        recipePortionsById[id] = min(99, max(1, portions))
        if selectedRecipeIds.contains(id) {
            rebuildShoppingPreview()
        }
    }

    @MainActor
    private func fetchPendingShoppingListExports(forceStatus: Bool = false) async {
        let config = currentConfig
        guard isPaired, refreshingExportsFor != config else { return }
        refreshingExportsFor = config
        defer {
            if refreshingExportsFor == config { refreshingExportsFor = nil }
        }
        do {
            let fetched = try await api.fetchPendingShoppingListExports(config: config)
            guard !Task.isCancelled, config == currentConfig else { return }
            shoppingExports = fetched
            if forceStatus {
                shoppingStatus = fetched.isEmpty ? "Keine pending Einkaufsliste." : "Pending Einkaufslisten geladen."
            }
        } catch {
            guard !Task.isCancelled, config == currentConfig else { return }
            shoppingStatus = "Einkaufslisten-Sync fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    private func loadLocalRecipes() {
        let decoder = JSONDecoder()
        guard let data = localRecipesJson.data(using: .utf8),
              let decoded = try? decoder.decode([Recipe].self, from: data) else {
            recipes = []
            return
        }
        recipes = decoded
        rebuildShoppingPreview()
    }

    private func saveLocalRecipes() {
        let encoder = JSONEncoder()
        guard let data = try? encoder.encode(recipes),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        localRecipesJson = json
    }

    @MainActor
    private func refreshRecipesFromServer(forceStatus: Bool = false) async {
        let config = currentConfig
        guard isPaired, refreshingRecipesFor != config else { return }
        refreshingRecipesFor = config
        defer {
            if refreshingRecipesFor == config { refreshingRecipesFor = nil }
        }

        do {
            let fetched = try await api.fetchRecipes(config: config)
            guard !Task.isCancelled, config == currentConfig else { return }
            if fetched != recipes {
                recipes = fetched
                let ids = Set(fetched.map(\.id))
                selectedRecipeIds.formIntersection(ids)
                rebuildShoppingPreview()
                saveLocalRecipes()
            }
            lastRecipeSyncAt = isoFormatter.string(from: Date())
            if forceStatus { shoppingStatus = "Rezepte aktualisiert: \(fetched.count) lokal gespeichert." }
        } catch {
            guard !Task.isCancelled, config == currentConfig else { return }
            if forceStatus || recipes.isEmpty {
                shoppingStatus = "Rezepte konnten nicht aktualisiert werden. Lokaler Cache bleibt verfügbar: \(error.localizedDescription)"
            }
        }
    }

    @MainActor
    private func loadReminderListsForShopping() async {
        guard !isShoppingWorking else { return }
        isShoppingWorking = true
        defer { isShoppingWorking = false }
        do {
            guard try await reminderService.requestAccessIfNeeded() else {
                shoppingStatus = "Zugriff auf Apple Erinnerungen wurde nicht erlaubt."
                return
            }
            if let calendar = await shoppingCalendar() {
                selectedReminderCalendarIdentifier = calendar.id
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
        guard !isShoppingWorking else { return }
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

            guard let calendar = await shoppingCalendar() else {
                let message = "Keine beschreibbare Erinnerungen-Liste gefunden."
                shoppingStatus = message
                try? await api.reportShoppingListExportError(id: export.id, message: message, config: currentConfig)
                return
            }

            selectedReminderCalendarIdentifier = calendar.id
            let createdCount = try await reminderService.createReminders(from: export.items, calendarId: calendar.id, exportId: export.id)
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
    private func importLocalRecipeShoppingList(_ export: ShoppingListExport) async {
        guard !isShoppingWorking else { return }
        isShoppingWorking = true
        defer { isShoppingWorking = false }

        do {
            guard try await reminderService.requestAccessIfNeeded() else {
                shoppingStatus = "Zugriff auf Apple Erinnerungen wurde nicht erlaubt."
                return
            }

            guard let calendar = await shoppingCalendar() else {
                shoppingStatus = "Keine beschreibbare Erinnerungen-Liste gefunden."
                return
            }

            selectedReminderCalendarIdentifier = calendar.id
            let createdCount = try await reminderService.createReminders(from: export.items, calendarId: calendar.id, exportId: export.id)
            shoppingStatus = "\(createdCount) Erinnerungen aus lokalen Rezepten in „\(calendar.title)” erstellt."
        } catch {
            shoppingStatus = "Lokaler Reminder-Import fehlgeschlagen: \(error.localizedDescription)"
        }
    }

    private func shoppingCalendar() async -> ReminderList? {
        let result = await reminderService.calendars(preferredIdentifier: selectedReminderCalendarIdentifier, preferredName: "Einkauf")
        reminderLists = result.lists
        return result.selected
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
            async let habits: Void = bidirectionalHabitSync()
            async let exports: Void = fetchPendingShoppingListExports()
            async let recipes: Void = refreshRecipesFromServer(forceStatus: true)
            _ = await (habits, exports, recipes)
        }
    }

    private func habitBinding(_ habit: HabitDefinition, date: String) -> Binding<Bool> {
        Binding(
            get: { habitHistory.entry(for: habit, date: date)?.completed ?? false },
            set: { completed in
                setHabit(habit, date: date, completed: completed)
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

    private func setHabit(_ habit: HabitDefinition, date: String, completed: Bool) {
        let previous = habitHistory.entry(for: habit, date: date)
        let previousMillis = (HabitTogglePlan.timestamp(previous?.updatedAt ?? "") * 1000).rounded()
        let time = max(Date().timeIntervalSince1970, (previousMillis + 1) / 1000)
        let entry = HabitEntry(habitId: habit.id, habitClientId: habit.clientId, date: date, completed: completed, updatedAt: isoFormatter.string(from: Date(timeIntervalSince1970: time)))
        mergeHabitEntries([entry])
        Task { await syncHabitToggle(entry) }
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
    }

    private func refreshHabitDay(_ date: String) async {
        guard isPaired else { return }
        let config = currentConfig
        do {
            try await Task.sleep(for: .milliseconds(250))
            let day = try await api.fetchHabits(date: date, config: config)
            guard !Task.isCancelled, config == currentConfig, date == day.date, date == selectedHabitDateKey else { return }
            applyHabitSyncResponse(definitions: day.definitions, entries: day.entries)
        } catch {
            // Date navigation remains usable when the server is offline.
        }
    }

    private func loadLocalHabits() {
        guard !didLoadHabitCache else { return }
        didLoadHabitCache = true
        let decoder = JSONDecoder()
        if let data = localHabitsJson.data(using: .utf8),
           let decoded = try? decoder.decode([HabitDefinition].self, from: data),
           !decoded.isEmpty {
            habits = Self.deduplicateHabits(decoded)
        } else {
            habits = Self.defaultHabits
        }

        if let data = UserDefaults.standard.string(forKey: HabitHistoryCache.key)?.data(using: .utf8),
           let decoded = try? decoder.decode([HabitEntry].self, from: data) {
            let clientIds = Dictionary(habits.map { ($0.id, $0.clientId) }, uniquingKeysWith: { first, _ in first })
            habitHistory = HabitHistory(decoded.map { stored in
                var entry = stored
                entry.habitClientId = clientIds[entry.habitId] ?? entry.habitClientId
                return entry
            })
        }
    }

    private func saveLocalHabits() {
        let encoder = JSONEncoder()
        let cleanHabits = Self.deduplicateHabits(habits)
        if habits != cleanHabits {
            habits = cleanHabits
        }
        if let data = try? encoder.encode(habits), let json = String(data: data, encoding: .utf8) {
            localHabitsJson = json
        }
    }

    private func mergeHabitEntries(_ entries: [HabitEntry]) {
        var merged = habitHistory
        guard merged.merge(entries) else { return }
        habitHistory = merged
        persistHabitHistory()
    }

    private func persistHabitHistory() {
        habitHistoryRevision += 1
        let revision = habitHistoryRevision
        let snapshot = habitHistory
        let cache = habitHistoryCache
        Task { await cache.save(snapshot, revision: revision) }
    }

    @MainActor
    private func syncHabitToggle(_ entry: HabitEntry) async {
        guard isPaired else { return }
        guard entry.habitId > 0 else {
            // The server needs the definition before it can accept this offline habit's entry.
            await bidirectionalHabitSync()
            return
        }
        let config = currentConfig
        do {
            // A newer edit from another device may have won. Merge only this entry.
            let response = try await api.syncHabits(HabitTogglePlan.request(for: entry, since: entry.updatedAt), config: config)
            guard config == currentConfig else { return }
            if let remote = response.entries.first(where: { $0.date == entry.date && $0.habitClientId == entry.habitClientId }) {
                mergeHabitEntries([remote])
            }
            habitStatus = ""
        } catch {
            guard config == currentConfig else { return }
            habitStatus = "Eintrag lokal gespeichert; Server-Sync fehlgeschlagen. Beim nächsten App-Start erneut versuchen: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func bidirectionalHabitSync() async {
        guard isPaired else { return }
        let config = currentConfig
        do {
            let payload = HabitSyncPayload(
                // A full reconciliation also repairs local history after a server restore or re-pairing.
                since: nil,
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
                entries: habitHistory.entries.map {
                    HabitEntryPayload(
                        habitId: $0.habitId > 0 ? $0.habitId : nil,
                        habitClientId: $0.habitClientId,
                        date: $0.date,
                        completed: $0.completed,
                        updatedAt: $0.updatedAt
                    )
                }
            )
            let response = try await api.syncHabits(payload, config: config)
            guard !Task.isCancelled, config == currentConfig else { return }
            applyHabitSyncResponse(definitions: response.definitions, entries: response.entries)
            habitStatus = ""
        } catch {
            guard !Task.isCancelled, config == currentConfig else { return }
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

    private func applyHabitSyncResponse(definitions: [HabitDefinition], entries: [HabitEntry]) {
        var updatedHabits = habits
        var remapped: [Int: HabitDefinition] = [:]
        for definition in definitions {
            let sameIdentity = updatedHabits.firstIndex { $0.clientId == definition.clientId || $0.id == definition.id }
            let name = Self.normalizedName(definition.name)
            if let index = sameIdentity ?? updatedHabits.firstIndex(where: { Self.normalizedName($0.name) == name }) {
                let local = updatedHabits[index]
                if local.id != definition.id || local.clientId != definition.clientId {
                    remapped[local.id] = definition
                }
                var resolved = definition
                if local.updatedAt != definition.updatedAt, Self.timestamp(local.updatedAt) > Self.timestamp(definition.updatedAt) {
                    resolved = local
                    resolved.id = definition.id
                    resolved.clientId = definition.clientId
                }
                updatedHabits[index] = resolved
            } else {
                updatedHabits.append(definition)
            }
        }

        updatedHabits = Self.deduplicateHabits(updatedHabits)
        if habits != updatedHabits {
            habits = updatedHabits
            saveLocalHabits()
        }
        if !remapped.isEmpty {
            habitHistory = HabitHistory(habitHistory.entries.map { stored in
                guard let definition = remapped[stored.habitId] else { return stored }
                var entry = stored
                entry.habitId = definition.id
                entry.habitClientId = definition.clientId
                return entry
            })
            persistHabitHistory()
        }
        mergeHabitEntries(entries)
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

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

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

    private static func timestamp(_ value: String) -> TimeInterval {
        HabitTogglePlan.timestamp(value)
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

private struct RecipeSelectionRow: View, Equatable {
    let recipe: Recipe
    let isSelected: Bool
    let portions: Int
    let onSelectionChange: (Bool) -> Void
    let onPortionsChange: (Int) -> Void
    @State private var showingDetails = false

    nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.recipe == rhs.recipe && lhs.isSelected == rhs.isSelected && lhs.portions == rhs.portions
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: Binding(get: { isSelected }, set: onSelectionChange)) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(recipe.name)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(.black)
                    Text(recipeSummary)
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedText)
                }
            }
            .toggleStyle(.switch)
            .tint(.black)

            Stepper(value: Binding(get: { portions }, set: onPortionsChange), in: 1...99) {
                Text("\(portions) Portion\(portions == 1 ? "" : "en")")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.black)
            }
            .tint(.black)

            DisclosureGroup("Rezept ansehen", isExpanded: $showingDetails) {
                if showingDetails { recipeDetails }
            }
            .tint(.black)
        }
        .padding(12)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.black.opacity(0.08)))
    }

    private var portionFactor: Double {
        Double(min(99, max(1, portions))) / max(recipe.servingBase, 0.0001)
    }

    private var recipeDetails: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Zutaten für \(portions) Portion\(portions == 1 ? "" : "en")")
                .font(.headline)
            ForEach(recipe.items.indices, id: \.self) { index in
                let item = recipe.items[index]
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    Text(item.name)
                    Spacer(minLength: 8)
                    Text("\(LocalShoppingListBuilder.formatAmount(item.amount * portionFactor)) \(item.unit)")
                        .multilineTextAlignment(.trailing)
                }
                .font(.callout)
            }

            if !recipe.instructions.isEmpty {
                Divider()
                Text("Zubereitung").font(.headline)
                Text(recipe.instructions)
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !recipe.prepNotes.isEmpty {
                Text("Hinweise").font(.headline)
                Text(recipe.prepNotes)
                    .font(.callout)
                    .foregroundStyle(AppTheme.mutedText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !recipe.nutrientsPerServing.isEmpty {
                Divider()
                Text("Nährwerte für \(portions) Portion\(portions == 1 ? "" : "en")")
                    .font(.headline)
                ForEach(recipe.nutrientsPerServing.indices, id: \.self) { index in
                    let nutrient = recipe.nutrientsPerServing[index]
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(nutrient.label)
                        Spacer(minLength: 8)
                        Text("\(LocalShoppingListBuilder.formatAmount(RecipePresentation.nutrientTotal(perServing: nutrient.amount, portions: portions))) \(nutrient.unit)")
                            .multilineTextAlignment(.trailing)
                    }
                    .font(.callout)
                }
                Text("Schätzwerte aus dem Rezept. Zubereitungstext und Hinweise beschreiben die Basisportion; Zutatenmengen und Nährwerte oben passen sich an deine Portionswahl an.")
                    .font(.caption)
                    .foregroundStyle(AppTheme.mutedText)
            }
        }
        .foregroundStyle(.black)
        .padding(.top, 10)
    }

    private var recipeSummary: String {
        let calories = recipe.nutrientsPerServing.first(where: { $0.key == "calories" })?.amount
        let protein = recipe.nutrientsPerServing.first(where: { $0.key == "protein" })?.amount
        let caloriesText = calories.map { "\(Int($0.rounded())) kcal" }
        let proteinText = protein.map { "\(LocalShoppingListBuilder.formatAmount($0)) g Protein" }
        return [recipe.category, caloriesText, proteinText].compactMap(\.self).joined(separator: " · ")
    }
}

private struct LocalShoppingPreviewCard: View {
    let export: ShoppingListExport
    let reminderLists: [ReminderList]
    @Binding var selectedReminderCalendarIdentifier: String
    let isWorking: Bool
    let onLoadReminderLists: () -> Void
    let onImport: () -> Void
    @State private var showingPreview = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Lokale Einkaufsliste")
                        .font(.headline)
                        .foregroundStyle(.black)
                    Text("\(export.items.count) Einträge aus ausgewählten Rezepten")
                        .font(.caption)
                        .foregroundStyle(AppTheme.mutedText)
                }
                Spacer()
            }

            if reminderLists.isEmpty {
                Button(action: onLoadReminderLists) {
                    Label("Erinnerungen-Listen laden", systemImage: "list.bullet")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.black)
                .disabled(isWorking)
            } else {
                Picker("Ziel-Liste", selection: $selectedReminderCalendarIdentifier) {
                    Text("Automatisch").tag("")
                    ForEach(reminderLists) { list in
                        Text(list.title).tag(list.id)
                    }
                }
                .pickerStyle(.menu)
                .tint(.black)
            }

            DisclosureGroup("Vorschau", isExpanded: $showingPreview) {
                if showingPreview {
                    LazyVStack(alignment: .leading, spacing: 8) {
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
    }
}

private struct ShoppingExportCard: View {
    let export: ShoppingListExport
    let reminderLists: [ReminderList]
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
                    ForEach(reminderLists) { list in
                        Text(list.title).tag(list.id)
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

private struct ReminderList: Identifiable, Sendable {
    let id: String
    let title: String
}

private actor ReminderExportService {
    private lazy var eventStore = EKEventStore()

    func requestAccessIfNeeded() async throws -> Bool {
        let status = EKEventStore.authorizationStatus(for: .reminder)

        switch status {
        case .fullAccess, .authorized:
            return true
        case .notDetermined:
            return try await eventStore.requestFullAccessToReminders()
        case .denied, .restricted, .writeOnly:
            return false
        @unknown default:
            return false
        }
    }

    func calendars(preferredIdentifier: String, preferredName: String) -> (selected: ReminderList?, lists: [ReminderList]) {
        let lists = eventStore.calendars(for: .reminder)
            .filter(\.allowsContentModifications)
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            .map { ReminderList(id: $0.calendarIdentifier, title: $0.title) }
        if let preferred = lists.first(where: { $0.id == preferredIdentifier })
            ?? lists.first(where: { $0.title.localizedCaseInsensitiveCompare(preferredName) == .orderedSame }) {
            return (preferred, lists)
        }
        let defaultId = eventStore.defaultCalendarForNewReminders()?.calendarIdentifier
        return (lists.first { $0.id == defaultId } ?? lists.first, lists)
    }

    func createReminders(from items: [ShoppingListExportItem], calendarId: String, exportId: String) throws -> Int {
        guard let calendar = eventStore.calendar(withIdentifier: calendarId), calendar.allowsContentModifications else {
            throw ReminderExportError.calendarUnavailable
        }
        var createdCount = 0

        do {
            for item in items where !item.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                let reminder = EKReminder(eventStore: eventStore)
                reminder.calendar = calendar
                reminder.title = Self.formatReminderTitle(item)
                reminder.notes = Self.formatReminderNotes(item, exportId: exportId)

                try eventStore.save(reminder, commit: false)
                createdCount += 1
            }
            guard createdCount > 0 else { throw ReminderExportError.emptyList }
            try eventStore.commit()
            return createdCount
        } catch {
            eventStore.reset()
            throw error
        }
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

private enum LocalShoppingListBuilder {
    static func generate(from selections: [RecipeSelection], createdAt: String) -> ShoppingListExport {
        var merged: [String: ShoppingListExportItem] = [:]

        for selection in selections {
            let factor = Double(max(1, selection.portions)) / max(selection.recipe.servingBase, 0.0001)
            for item in selection.recipe.items {
                let name = item.name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { continue }

                let unit = item.unit.trimmingCharacters(in: .whitespacesAndNewlines)
                let normalizedName = normalize(name)
                let category = categorize(normalizedName)
                let key = "\(normalizedName)|\(unit.lowercased())|\(category)"
                let amount = roundAmount(item.amount * factor)

                if var existing = merged[key] {
                    existing.amount = roundAmount((existing.amount ?? 0) + amount)
                    existing.sourceRecipeNames = unique((existing.sourceRecipeNames ?? []) + [selection.recipe.name])
                    if item.excludeFromNutrition {
                        existing.note = "In Rezept sichtbar, nicht in Nährwerten enthalten."
                    }
                    merged[key] = existing
                } else {
                    merged[key] = ShoppingListExportItem(
                        id: "item_\(slugify("\(name)-\(unit)-\(category)"))",
                        name: name,
                        amount: amount,
                        unit: unit,
                        category: category,
                        note: item.excludeFromNutrition ? "In Rezept sichtbar, nicht in Nährwerten enthalten." : nil,
                        sourceRecipeNames: [selection.recipe.name]
                    )
                }
            }
        }

        let items = merged.values.sorted(by: compareItems)
        let recipeSnapshot = selections
            .map { "\($0.recipe.id)-\($0.portions)" }
            .joined(separator: "-")
        return ShoppingListExport(
            id: "local_recipe_\(slugify(recipeSnapshot.isEmpty ? createdAt : recipeSnapshot))",
            title: "Einkaufsliste",
            items: items,
            createdAt: createdAt,
            consumedAt: nil
        )
    }

    static func formatAmount(_ value: Double) -> String {
        if value.rounded() == value {
            return String(Int(value))
        }
        return value.formatted(.number.precision(.fractionLength(0...2)).locale(Locale(identifier: "de_DE")))
    }

    private static let categoryOrder = ["Obst & Gemüse", "Milchprodukte", "Trockenwaren", "Fleisch/Fisch", "Sonstiges"]

    private static func categorize(_ normalized: String) -> String {
        if normalized.contains("paprikapulver") {
            return "Sonstiges"
        }

        if [
            "heidelbeeren",
            "brombeeren",
            "banane",
            "avocado",
            "spinat",
            "apfel",
            "birne",
            "zitronensaft",
            "zitrone",
            "brokkoli",
            "blumenkohl",
            "champignons",
            "knoblauch",
            "gurke",
            "ingwer",
            "paprika",
            "tomaten",
            "zwiebel",
            "erdbeeren",
            "kiwi"
        ].contains(where: { normalized.contains($0) }) {
            return "Obst & Gemüse"
        }

        if ["milch", "joghurt", "skyr", "feta"].contains(where: { normalized.contains($0) }) {
            return "Milchprodukte"
        }

        if [
            "haferflocken",
            "chiasamen",
            "whey",
            "inulin",
            "kreatin",
            "zucker",
            "linsen",
            "kichererbsen",
            "quinoa",
            "reis",
            "rosinen",
            "mandeln",
            "nüsse"
        ].contains(where: { normalized.contains($0) }) {
            return "Trockenwaren"
        }

        if normalized.contains("lachs") {
            return "Fleisch/Fisch"
        }

        return "Sonstiges"
    }

    private static func compareItems(_ left: ShoppingListExportItem, _ right: ShoppingListExportItem) -> Bool {
        let leftCategory = categoryOrder.firstIndex(of: left.category ?? "Sonstiges") ?? categoryOrder.count
        let rightCategory = categoryOrder.firstIndex(of: right.category ?? "Sonstiges") ?? categoryOrder.count
        if leftCategory != rightCategory {
            return leftCategory < rightCategory
        }
        return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
    }

    private static func normalize(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    private static func slugify(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "äöüß"))
        return value
            .lowercased()
            .unicodeScalars
            .map { allowed.contains($0) ? Character($0) : "-" }
            .reduce(into: "") { result, character in
                if character == "-", result.last == "-" {
                    return
                }
                result.append(character)
            }
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }

    private static func roundAmount(_ value: Double) -> Double {
        (value * 100).rounded() / 100
    }

    private static func unique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { seen.insert($0).inserted }
    }
}

private enum ReminderExportError: LocalizedError {
    case emptyList
    case calendarUnavailable

    var errorDescription: String? {
        switch self {
        case .emptyList:
            return "Die Einkaufsliste enthält keine gültigen Einträge."
        case .calendarUnavailable:
            return "Die ausgewählte Erinnerungen-Liste ist nicht mehr verfügbar."
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
