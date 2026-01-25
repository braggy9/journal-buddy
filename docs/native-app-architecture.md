# Journal Buddy - iOS/macOS Native App Architecture

## Overview

A native SwiftUI application for iPhone, iPad, and Mac that provides an **offline-first** journaling experience with intelligent sync to the PostgreSQL backend and Claude AI integration.

---

## Core Design Principles

### 1. Offline-First Architecture
- **Write locally, sync later** - All entries saved immediately to Core Data
- **Background sync** - Automatically sync when network available
- **Conflict resolution** - Last-write-wins with timestamp comparison
- **Never block the user** - UI always responsive, network calls async

### 2. Native Platform Integration
- **SwiftUI** for declarative, cross-platform UI
- **Core Data** for local persistence and relationships
- **CloudKit** optional for iCloud backup
- **Widgets** for quick mood tracking and streak display
- **Shortcuts** for Siri integration ("Hey Siri, journal my thoughts")
- **ShareExtension** for journaling from other apps

### 3. Privacy & Security
- **Local-first data** - Entries stored encrypted on device
- **Keychain** for API credentials
- **Face ID/Touch ID** for app lock
- **No analytics** - Complete privacy

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                    │
│  ┌────────────────────────────────────────────────────┐  │
│  │  SwiftUI Views                                      │  │
│  │  ├── JournalView (main entry editor)              │  │
│  │  ├── ChatView (Claude conversation)               │  │
│  │  ├── HybridView (split screen)                    │  │
│  │  ├── EntriesListView (past entries)               │  │
│  │  ├── InsightsView (analytics dashboard)           │  │
│  │  └── SettingsView (sync, appearance, auth)        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│                      VIEW MODEL LAYER                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │  @ObservableObject ViewModels                      │  │
│  │  ├── JournalViewModel                              │  │
│  │  ├── ChatViewModel                                 │  │
│  │  ├── SyncViewModel                                 │  │
│  │  └── InsightsViewModel                             │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Business Logic & Coordination                      │  │
│  │  ├── DataService (Core Data operations)            │  │
│  │  ├── SyncService (background sync)                 │  │
│  │  ├── APIService (backend communication)            │  │
│  │  ├── ClaudeService (AI integration)                │  │
│  │  └── KeychainService (secure storage)              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│                      DATA LAYER                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Core Data Stack                                    │  │
│  │  ├── JournalEntry (entries with offline flag)      │  │
│  │  ├── Conversation (chat sessions)                  │  │
│  │  ├── Message (chat messages)                       │  │
│  │  ├── SyncMetadata (last sync, conflicts)           │  │
│  │  └── UserPreferences (settings)                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────┐
│                   PERSISTENCE & NETWORK                   │
│  ┌─────────────────────┐    ┌─────────────────────────┐ │
│  │  Core Data SQLite   │    │  REST API / WebSocket   │ │
│  │  (Encrypted)        │    │  (Backend + Claude)     │ │
│  └─────────────────────┘    └─────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Core Data Schema

### JournalEntry Entity
```swift
@objc(JournalEntry)
public class JournalEntry: NSManagedObject {
    @NSManaged public var id: UUID
    @NSManaged public var content: String
    @NSManaged public var mood: String? // "good", "okay", "rough"
    @NSManaged public var energy: Int16  // 0-5 (0 = not set)
    @NSManaged public var tags: [String]
    @NSManaged public var reflection: String?
    @NSManaged public var themes: [String]
    @NSManaged public var wordCount: Int32
    @NSManaged public var createdAt: Date
    @NSManaged public var updatedAt: Date

    // Sync metadata
    @NSManaged public var serverID: String?     // nil if never synced
    @NSManaged public var isSynced: Bool        // false if local-only
    @NSManaged public var needsSync: Bool       // true if modified locally
    @NSManaged public var lastSyncedAt: Date?
    @NSManaged public var isDeleted: Bool       // soft delete

    // Relationships
    @NSManaged public var conversations: NSSet? // One-to-many with Conversation
}
```

### Conversation Entity
```swift
@objc(Conversation)
public class Conversation: NSManagedObject {
    @NSManaged public var id: UUID
    @NSManaged public var serverID: String?
    @NSManaged public var sessionType: String   // "freeform", "entry_reflection", "weekly_review"
    @NSManaged public var createdAt: Date
    @NSManaged public var updatedAt: Date

    // Sync metadata
    @NSManaged public var isSynced: Bool
    @NSManaged public var needsSync: Bool

    // Relationships
    @NSManaged public var messages: NSOrderedSet  // One-to-many with Message
    @NSManaged public var entry: JournalEntry?    // Optional relationship to entry
}
```

### Message Entity
```swift
@objc(Message)
public class Message: NSManagedObject {
    @NSManaged public var id: UUID
    @NSManaged public var serverID: String?
    @NSManaged public var role: String          // "user" or "assistant"
    @NSManaged public var content: String
    @NSManaged public var createdAt: Date

    // Sync metadata
    @NSManaged public var isSynced: Bool
    @NSManaged public var needsSync: Bool
    @NSManaged public var sendAttempts: Int16   // Retry counter for failed sends

    // Relationships
    @NSManaged public var conversation: Conversation
}
```

### SyncMetadata Entity
```swift
@objc(SyncMetadata)
public class SyncMetadata: NSManagedObject {
    @NSManaged public var key: String           // Unique key (e.g., "lastFullSync")
    @NSManaged public var stringValue: String?
    @NSManaged public var dateValue: Date?
    @NSManaged public var intValue: Int64
    @NSManaged public var updatedAt: Date
}
```

---

## Sync Strategy

### Sync Triggers
1. **On app foreground** - Full sync when app becomes active
2. **After entry save** - Immediate sync of new entry
3. **After message send** - Immediate sync of chat message
4. **Background refresh** - Periodic sync every 15 minutes (iOS Background App Refresh)
5. **Manual sync** - Pull-to-refresh gesture

### Sync Algorithm (Entries)

```swift
func syncEntries() async throws {
    let context = CoreDataStack.shared.backgroundContext

    // STEP 1: Push local changes to server
    let unsyncedEntries = try context.fetch(JournalEntry.fetchRequest()
        .where(\JournalEntry.needsSync == true && \JournalEntry.isDeleted == false))

    for entry in unsyncedEntries {
        if entry.serverID == nil {
            // New entry - POST to server
            let response = try await APIService.shared.createEntry(
                content: entry.content,
                mood: entry.mood,
                tags: entry.tags,
                createdAt: entry.createdAt
            )
            entry.serverID = response.id
            entry.isSynced = true
            entry.needsSync = false
            entry.lastSyncedAt = Date()

        } else {
            // Modified entry - PATCH to server
            let response = try await APIService.shared.updateEntry(
                id: entry.serverID!,
                content: entry.content,
                mood: entry.mood,
                tags: entry.tags,
                updatedAt: entry.updatedAt
            )

            // Conflict resolution: Last-write-wins
            if response.updatedAt > entry.updatedAt {
                // Server has newer version - merge
                entry.content = response.content
                entry.reflection = response.reflection
                entry.themes = response.themes
            }

            entry.isSynced = true
            entry.needsSync = false
            entry.lastSyncedAt = Date()
        }
    }

    // STEP 2: Pull new/updated entries from server
    let lastSync = UserDefaults.standard.object(forKey: "lastEntriesSync") as? Date
    let serverEntries = try await APIService.shared.getEntries(
        since: lastSync
    )

    for serverEntry in serverEntries {
        // Check if we have this entry locally
        let localEntry = try? context.fetch(JournalEntry.fetchRequest()
            .where(\JournalEntry.serverID == serverEntry.id)).first

        if let local = localEntry {
            // Update existing entry (if server is newer)
            if serverEntry.updatedAt > local.updatedAt {
                local.content = serverEntry.content
                local.mood = serverEntry.mood
                local.tags = serverEntry.tags
                local.reflection = serverEntry.reflection
                local.themes = serverEntry.themes
                local.updatedAt = serverEntry.updatedAt
                local.isSynced = true
                local.needsSync = false
            }
        } else {
            // Create new entry from server
            let newEntry = JournalEntry(context: context)
            newEntry.id = UUID()
            newEntry.serverID = serverEntry.id
            newEntry.content = serverEntry.content
            newEntry.mood = serverEntry.mood
            newEntry.tags = serverEntry.tags
            newEntry.reflection = serverEntry.reflection
            newEntry.themes = serverEntry.themes
            newEntry.createdAt = serverEntry.createdAt
            newEntry.updatedAt = serverEntry.updatedAt
            newEntry.isSynced = true
            newEntry.needsSync = false
        }
    }

    // STEP 3: Handle deletions
    let deletedLocalEntries = try context.fetch(JournalEntry.fetchRequest()
        .where(\JournalEntry.isDeleted == true && \JournalEntry.needsSync == true))

    for entry in deletedLocalEntries {
        if let serverID = entry.serverID {
            try await APIService.shared.deleteEntry(id: serverID)
        }
        context.delete(entry) // Hard delete locally
    }

    try context.save()
    UserDefaults.standard.set(Date(), forKey: "lastEntriesSync")
}
```

### Sync Status Indicators

```swift
enum SyncStatus {
    case synced           // All data up to date
    case syncing          // Sync in progress
    case needsSync        // Local changes not synced
    case offline          // No network, pending sync
    case error(Error)     // Sync failed
}
```

UI shows sync status in navbar:
- ✓ (green) - Synced
- ↻ (blue spinning) - Syncing
- ⚠ (orange) - Needs sync
- ⊗ (red) - Error

---

## Claude AI Integration (Offline-Aware)

### Challenge
Claude API requires network, but app is offline-first. How to handle?

### Solution: Queue + Retry Pattern

```swift
class ClaudeService {
    private let queue = DispatchQueue(label: "com.journalbuddy.claude")

    /// Request reflection for an entry
    func requestReflection(for entry: JournalEntry) async throws {
        guard NetworkMonitor.shared.isConnected else {
            // Mark entry as "pending reflection"
            entry.needsReflection = true
            try CoreDataStack.shared.viewContext.save()
            throw ClaudeError.offline
        }

        // Build context from recent entries
        let recentEntries = try await DataService.shared.getRecentEntries(days: 7)
        let context = buildContext(from: recentEntries)

        // Call Claude API
        let reflection = try await APIService.shared.generateReflection(
            entryId: entry.serverID ?? entry.id.uuidString,
            content: entry.content,
            context: context
        )

        // Update entry with reflection
        entry.reflection = reflection
        entry.needsReflection = false
        entry.needsSync = true // Need to sync reflection to server
        try CoreDataStack.shared.viewContext.save()
    }

    /// Send chat message
    func sendMessage(_ content: String, in conversation: Conversation) async throws -> Message {
        // Save user message immediately (optimistic UI)
        let userMessage = Message(context: CoreDataStack.shared.viewContext)
        userMessage.id = UUID()
        userMessage.role = "user"
        userMessage.content = content
        userMessage.createdAt = Date()
        userMessage.conversation = conversation
        userMessage.needsSync = true
        try CoreDataStack.shared.viewContext.save()

        guard NetworkMonitor.shared.isConnected else {
            // Message saved locally, will sync later
            throw ClaudeError.offline
        }

        // Send to Claude via backend
        let response = try await APIService.shared.sendChatMessage(
            message: content,
            conversationId: conversation.serverID,
            entryId: conversation.entry?.serverID
        )

        // Save assistant response
        let assistantMessage = Message(context: CoreDataStack.shared.viewContext)
        assistantMessage.id = UUID()
        assistantMessage.serverID = response.messageId
        assistantMessage.role = "assistant"
        assistantMessage.content = response.content
        assistantMessage.createdAt = Date()
        assistantMessage.conversation = conversation
        assistantMessage.isSynced = true
        try CoreDataStack.shared.viewContext.save()

        return assistantMessage
    }

    /// Background task: Retry pending AI requests
    func retryPendingRequests() async {
        guard NetworkMonitor.shared.isConnected else { return }

        // Find entries waiting for reflections
        let pendingEntries = try? CoreDataStack.shared.backgroundContext.fetch(
            JournalEntry.fetchRequest().where(\JournalEntry.needsReflection == true)
        )

        for entry in (pendingEntries ?? []) {
            try? await requestReflection(for: entry)
        }
    }
}
```

### User Experience
- **User writes entry offline** → Saved immediately to Core Data
- **User taps "Generate Reflection"** → Shows "Reflection pending - will generate when online"
- **Network becomes available** → Background task automatically requests reflection
- **Notification** → "Reflection ready for your entry about..."

---

## UI Design (SwiftUI)

### Main Tab Structure

```swift
struct RootView: View {
    @StateObject private var journalVM = JournalViewModel()
    @StateObject private var syncVM = SyncViewModel()
    @AppStorage("selectedTab") private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // Tab 1: Journal/Chat Hybrid
            HybridView()
                .tabItem {
                    Label("Journal", systemImage: "book")
                }
                .tag(0)

            // Tab 2: Past Entries
            EntriesListView()
                .tabItem {
                    Label("Entries", systemImage: "list.bullet")
                }
                .tag(1)

            // Tab 3: Insights
            InsightsView()
                .tabItem {
                    Label("Insights", systemImage: "chart.bar")
                }
                .tag(2)

            // Tab 4: Settings
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
                .tag(3)
        }
        .environmentObject(journalVM)
        .environmentObject(syncVM)
        .overlay(alignment: .top) {
            SyncStatusBanner()
        }
    }
}
```

### Hybrid View (Like Web App)

```swift
struct HybridView: View {
    @State private var mode: ViewMode = .hybrid

    enum ViewMode {
        case journal, chat, hybrid
    }

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                // Journal Panel
                if mode == .journal || mode == .hybrid {
                    JournalEditorView()
                        .frame(width: mode == .hybrid ? geometry.size.width / 2 : nil)
                }

                // Chat Panel
                if mode == .chat || mode == .hybrid {
                    ChatView()
                        .frame(width: mode == .hybrid ? geometry.size.width / 2 : nil)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                ModePickerView(mode: $mode)
            }
        }
    }
}
```

### Journal Editor View

```swift
struct JournalEditorView: View {
    @EnvironmentObject var vm: JournalViewModel
    @State private var content = ""
    @State private var selectedMood: Mood?
    @State private var tags: [String] = []

    var body: some View {
        VStack(spacing: 0) {
            // Header with mood selector
            VStack(spacing: 12) {
                HStack {
                    Text("New Entry")
                        .font(.headline)
                    Spacer()
                    Text(Date.now, style: .date)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                MoodSelector(selectedMood: $selectedMood)
            }
            .padding()

            Divider()

            // Text editor
            TextEditor(text: $content)
                .padding()
                .overlay(alignment: .topLeading) {
                    if content.isEmpty {
                        Text("What's on your mind?")
                            .foregroundColor(.secondary)
                            .padding(.top, 8)
                            .padding(.leading, 5)
                            .allowsHitTesting(false)
                    }
                }

            Divider()

            // Tags and save button
            HStack {
                TagPickerView(selectedTags: $tags)
                Spacer()
                Button(action: saveEntry) {
                    Label("Save", systemImage: "checkmark.circle.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(content.isEmpty)
            }
            .padding()
        }
    }

    private func saveEntry() {
        Task {
            await vm.saveEntry(
                content: content,
                mood: selectedMood,
                tags: tags
            )
            content = ""
            selectedMood = nil
            tags = []
        }
    }
}
```

---

## Platform-Specific Features

### iOS Widget (Home Screen)

```swift
struct JournalWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: "JournalBuddyWidget",
            provider: JournalWidgetProvider()
        ) { entry in
            JournalWidgetView(entry: entry)
        }
        .configurationDisplayName("Journal Streak")
        .description("Track your journaling streak")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct JournalWidgetView: View {
    let entry: JournalWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "flame.fill")
                    .foregroundColor(.orange)
                Text("\(entry.streak) day streak")
                    .font(.headline)
            }

            Text("Last entry: \(entry.lastEntryDate, style: .relative) ago")
                .font(.caption)
                .foregroundColor(.secondary)

            if entry.moodTrend == .up {
                Label("Mood trending up", systemImage: "arrow.up.right")
                    .font(.caption)
                    .foregroundColor(.green)
            }
        }
        .padding()
    }
}
```

### Siri Shortcuts

```swift
import Intents

class JournalEntryIntent: INIntent {
    // "Hey Siri, journal my thoughts"
    // "Hey Siri, add to my journal"
}

class JournalIntentHandler: NSObject, JournalEntryIntentHandling {
    func handle(intent: JournalEntryIntent, completion: @escaping (JournalEntryIntentResponse) -> Void) {
        // Trigger voice-to-text entry
        // Save to Core Data
        // Sync in background
        completion(JournalEntryIntentResponse(code: .success, userActivity: nil))
    }
}
```

### macOS Menu Bar App

```swift
class MenuBarController: NSObject {
    var statusItem: NSStatusItem!

    func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "book", accessibilityDescription: "Journal Buddy")
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Quick Entry", action: #selector(quickEntry), keyEquivalent: "j"))
        menu.addItem(NSMenuItem(title: "Today's Entries", action: #selector(showToday), keyEquivalent: "t"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))

        statusItem.menu = menu
    }

    @objc func quickEntry() {
        // Show floating window for quick entry
    }
}
```

---

## Project Structure

```
JournalBuddy/
├── JournalBuddyApp.swift          # App entry point
├── Models/
│   ├── CoreData/
│   │   ├── JournalBuddy.xcdatamodeld  # Core Data model
│   │   ├── JournalEntry+Extensions.swift
│   │   ├── Conversation+Extensions.swift
│   │   └── Message+Extensions.swift
│   └── DTOs/
│       ├── EntryDTO.swift          # Data transfer objects for API
│       └── ConversationDTO.swift
├── ViewModels/
│   ├── JournalViewModel.swift
│   ├── ChatViewModel.swift
│   ├── SyncViewModel.swift
│   └── InsightsViewModel.swift
├── Views/
│   ├── Root/
│   │   └── RootView.swift
│   ├── Journal/
│   │   ├── JournalEditorView.swift
│   │   ├── MoodSelector.swift
│   │   └── TagPickerView.swift
│   ├── Chat/
│   │   ├── ChatView.swift
│   │   ├── MessageRow.swift
│   │   └── TypingIndicator.swift
│   ├── Entries/
│   │   ├── EntriesListView.swift
│   │   └── EntryDetailView.swift
│   ├── Insights/
│   │   ├── InsightsView.swift
│   │   ├── MoodChartView.swift
│   │   └── ThemeCloudView.swift
│   └── Settings/
│       └── SettingsView.swift
├── Services/
│   ├── CoreDataStack.swift
│   ├── DataService.swift
│   ├── SyncService.swift
│   ├── APIService.swift
│   ├── ClaudeService.swift
│   ├── KeychainService.swift
│   └── NetworkMonitor.swift
├── Utilities/
│   ├── Extensions/
│   │   ├── Date+Formatting.swift
│   │   └── String+Helpers.swift
│   └── Constants.swift
└── Resources/
    ├── Assets.xcassets
    └── Info.plist
```

---

## Development Roadmap

### Phase 1: Core Offline Functionality (Week 1-2)
- [ ] Set up Xcode project with SwiftUI + Core Data
- [ ] Implement Core Data schema and stack
- [ ] Build journal editor view (text, mood, tags)
- [ ] Implement local save/read/update/delete
- [ ] Create entries list view
- [ ] Add dark mode support

### Phase 2: Backend Integration (Week 3)
- [ ] Build APIService with URLSession
- [ ] Implement authentication (Keychain for API key)
- [ ] Create SyncService with basic push/pull
- [ ] Add sync status indicator UI
- [ ] Handle network errors gracefully
- [ ] Test offline → online sync

### Phase 3: Claude Integration (Week 4)
- [ ] Integrate Claude API via backend
- [ ] Build chat interface
- [ ] Implement context assembly (recent entries)
- [ ] Add reflection generation
- [ ] Queue system for offline AI requests
- [ ] Background retry logic

### Phase 4: Insights & Polish (Week 5)
- [ ] Build insights dashboard (mood trends, streaks)
- [ ] Add theme detection visualization
- [ ] Implement search/filter for entries
- [ ] Onboarding flow
- [ ] Settings screen (sync preferences, appearance)
- [ ] App icon and branding

### Phase 5: Platform Features (Week 6+)
- [ ] iOS Widget (streak, last entry)
- [ ] Siri Shortcuts integration
- [ ] Share extension (journal from Safari, Notes, etc.)
- [ ] macOS menu bar app
- [ ] iPad-optimized layout
- [ ] Face ID/Touch ID app lock

### Phase 6: Advanced Features (Future)
- [ ] Voice journaling (speech-to-text)
- [ ] Rich text formatting
- [ ] Photo attachments
- [ ] Export entries (PDF, Markdown)
- [ ] Themes and customization
- [ ] CloudKit sync for backup (optional)

---

## Technology Stack

- **Language**: Swift 6.0
- **UI**: SwiftUI 6.0
- **Persistence**: Core Data
- **Networking**: URLSession + async/await
- **Security**: Keychain, CryptoKit
- **Architecture**: MVVM + Services
- **Minimum iOS**: 17.0
- **Minimum macOS**: 14.0 (Sonoma)

---

## Key Technical Decisions

### Why Core Data over SwiftData?
- More mature and battle-tested
- Better conflict resolution control
- Easier migration path
- More Stack Overflow answers 😄

### Why Not CloudKit?
- Backend already has PostgreSQL
- Want full control over sync logic
- CloudKit optional in future for backup

### Why SwiftUI over UIKit?
- Modern, declarative, cross-platform
- Faster development
- Better animations out of the box

### Why Offline-First?
- Journaling is personal and immediate
- Network shouldn't block writing
- Better UX (instant saves)
- Resilient to poor connectivity

---

## Next Steps

1. **Validate UX Flow** - Sketch screens, decide on navigation
2. **Set Up Xcode Project** - Create workspace, add Core Data model
3. **Prototype Core Features** - Journal editor + local save
4. **Build Incrementally** - Ship working app in phases

---

*Last Updated: 2026-01-22*
