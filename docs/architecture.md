# Journal Buddy - Architecture Specification

## Overview

A conversational journaling application that combines traditional journal capture with an active AI companion. The system shifts fluidly between passive recording and engaged dialogue, leveraging accumulated context to provide genuinely personalised reflections.

---

## Core Philosophy

**Not a chatbot with a journal bolted on.** The journal entries are the primary artifact. Claude is a companion who reads alongside you, notices patterns, and is available to talk when you want - but never intrusive.

**Memory is the differentiator.** Unlike stateless AI conversations, Journal Buddy maintains continuity across sessions. Claude remembers what you wrote last week, notices when themes repeat, and can reference specific past entries.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  React Frontend (Vite + Tailwind)                        │   │
│  │  ├── Journal Mode (rich text editor)                     │   │
│  │  ├── Chat Mode (conversational UI)                       │   │
│  │  ├── Hybrid Mode (split screen)                          │   │
│  │  └── Review Mode (browse past entries)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          API LAYER                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Express/Node Backend (or extend TomOS)                  │   │
│  │  ├── /entries - CRUD for journal entries                 │   │
│  │  ├── /chat - Claude conversation endpoint                │   │
│  │  ├── /reflect - Request reflection on specific entry     │   │
│  │  ├── /insights - Pattern analysis & summaries            │   │
│  │  └── /context - Retrieve context for Claude              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL                                              │   │
│  │  ├── entries (raw journal content)                       │   │
│  │  ├── conversations (chat history)                        │   │
│  │  ├── reflections (Claude's generated reflections)        │   │
│  │  ├── themes (extracted patterns/topics)                  │   │
│  │  └── summaries (compressed context for long-term memory) │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INTELLIGENCE LAYER                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Claude API (Sonnet 4.5)                                 │   │
│  │  ├── Real-time chat responses                            │   │
│  │  ├── Entry reflection generation                         │   │
│  │  ├── Pattern detection & theme extraction                │   │
│  │  └── Weekly/monthly summary generation                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Entry
```typescript
interface Entry {
  id: string;
  userId: string;
  createdAt: DateTime;
  updatedAt: DateTime;

  // Core content
  content: string;           // Markdown-formatted journal text
  wordCount: number;

  // Metadata
  mood: 'good' | 'okay' | 'rough' | null;
  energy: 1 | 2 | 3 | 4 | 5 | null;  // Optional energy level
  tags: string[];

  // AI-generated
  reflection: string | null;  // Claude's optional reflection
  themes: string[];           // Extracted themes for pattern matching
  embedding: number[];        // Vector embedding for semantic search
}
```

### Conversation
```typescript
interface Conversation {
  id: string;
  userId: string;
  createdAt: DateTime;

  // Context
  entryId: string | null;     // If conversation is about a specific entry
  sessionType: 'freeform' | 'entry_reflection' | 'weekly_review';

  messages: Message[];
}

interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: DateTime;
}
```

### Summary (for context compression)
```typescript
interface Summary {
  id: string;
  userId: string;
  periodStart: DateTime;
  periodEnd: DateTime;
  periodType: 'weekly' | 'monthly';

  summary: string;           // Narrative summary of the period
  themes: string[];          // Key themes from the period
  moodTrend: 'up' | 'stable' | 'down';
  notableEntries: string[];  // IDs of significant entries
}
```

---

## Context Management Strategy

The core challenge: Claude has limited context windows, but memory should span months/years.

### Approach: Hierarchical Context

```
┌─────────────────────────────────────────────────────┐
│  CURRENT SESSION (always included)                   │
│  - Current entry being written                       │
│  - Recent chat messages (last 10-20)                 │
│  - Today's entries                                   │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  SHORT-TERM CONTEXT (last 7 days)                   │
│  - Recent entries (full text, last 5-7)             │
│  - Recent themes extracted                          │
│  - Mood pattern for the week                        │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  MEDIUM-TERM CONTEXT (last 30 days)                 │
│  - Weekly summaries (compressed)                    │
│  - Recurring themes                                 │
│  - Notable entries (flagged or high-engagement)     │
└─────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│  LONG-TERM CONTEXT (all time)                       │
│  - Monthly summaries (heavily compressed)           │
│  - Core themes & patterns                           │
│  - User preferences & communication style           │
│  - Significant life events                          │
└─────────────────────────────────────────────────────┘
```

### Context Assembly Function

```typescript
async function assembleContext(userId: string): Promise<ContextPayload> {
  const [
    recentEntries,
    weekSummary,
    monthSummaries,
    userProfile
  ] = await Promise.all([
    getRecentEntries(userId, { days: 7 }),
    getWeekSummary(userId),
    getMonthSummaries(userId, { months: 3 }),
    getUserProfile(userId)
  ]);

  return {
    currentSession: {
      // Populated by frontend
    },
    shortTerm: {
      entries: recentEntries.map(e => ({
        date: e.createdAt,
        content: e.content,
        mood: e.mood,
        themes: e.themes
      })),
      moodTrend: calculateMoodTrend(recentEntries)
    },
    mediumTerm: {
      weeklySummary: weekSummary?.summary,
      recurringThemes: extractRecurringThemes(recentEntries)
    },
    longTerm: {
      monthlySummaries: monthSummaries.map(s => s.summary),
      coreThemes: userProfile.coreThemes,
      preferences: userProfile.preferences
    }
  };
}
```

---

## API Endpoints

### POST /api/entries
Create a new journal entry.

```typescript
// Request
{
  content: string;
  mood?: 'good' | 'okay' | 'rough';
  energy?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  generateReflection?: boolean;  // Request Claude reflection
}

// Response
{
  id: string;
  createdAt: string;
  reflection?: string;  // If requested and generated
}
```

### POST /api/chat
Send a message in conversational mode.

```typescript
// Request
{
  message: string;
  conversationId?: string;  // Continue existing, or start new
  entryId?: string;         // If discussing a specific entry
}

// Response
{
  conversationId: string;
  response: string;
  suggestedFollowUps?: string[];  // Optional conversation prompts
}
```

### GET /api/insights
Get pattern analysis and insights.

```typescript
// Query params
?period=week|month|all

// Response
{
  period: { start: string; end: string };
  entryCount: number;
  moodDistribution: { good: number; okay: number; rough: number };
  moodTrend: 'up' | 'stable' | 'down';
  topThemes: string[];
  streak: number;  // Consecutive days with entries
  insights: string[];  // AI-generated observations
}
```

### POST /api/reflect
Request a reflection on a specific entry.

```typescript
// Request
{
  entryId: string;
  style?: 'brief' | 'deep' | 'questioning';
}

// Response
{
  reflection: string;
  suggestedQuestions?: string[];
}
```

---

## Claude Integration

### Base System Prompt Structure

```markdown
You are Tom's journal companion. Your purpose is to help him process thoughts,
notice patterns, and reflect on his life - not to solve his problems or give advice
unless explicitly asked.

## Your Approach

**Listen first.** Mirror back what you hear. Ask clarifying questions before jumping
to insights.

**Notice patterns.** You have access to his recent entries and long-term themes.
Reference specific past entries when relevant ("Last Tuesday you mentioned...").

**Match his energy.** If he's venting, validate. If he's exploring, explore with him.
If he's celebrating, celebrate.

**Be direct.** Tom appreciates honesty over comfort. Don't hedge unnecessarily.

**Respect autonomy.** Offer observations, not prescriptions. "I notice X" rather than
"You should Y."

## Communication Style

- Dry humour is welcome
- Concise unless depth is requested
- Avoid therapy-speak and platitudes
- Ask one question at a time, not three
- Reference specific details from his entries

## Context

${assembledContext}

## Current Themes (from recent entries)
${extractedThemes}

## Mood Trend
${moodTrendDescription}
```

### Reflection Generation Prompt

```markdown
Generate a brief reflection on this journal entry. Your reflection should:

1. Acknowledge the core emotion or experience
2. Notice something interesting (a pattern, tension, or insight)
3. Optionally, pose a single question for further exploration

Entry:
${entryContent}

Recent context:
${recentEntriesSummary}

Keep it to 2-3 sentences. Don't be preachy. Match his tone.
```

---

## Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── Journal/
│   │   ├── Editor.tsx          # Rich text editor (TipTap)
│   │   ├── MoodSelector.tsx    # Mood picker widget
│   │   ├── TagPicker.tsx       # Tag selection
│   │   └── EntryCard.tsx       # Display past entries
│   ├── Chat/
│   │   ├── ChatWindow.tsx      # Main chat interface
│   │   ├── Message.tsx         # Individual message bubble
│   │   └── TypingIndicator.tsx
│   ├── Layout/
│   │   ├── Sidebar.tsx         # Entry list & navigation
│   │   ├── TopBar.tsx          # Mode selector, settings
│   │   └── ModeToggle.tsx      # Journal/Chat/Hybrid switch
│   └── Insights/
│       ├── WeeklySummary.tsx
│       ├── MoodChart.tsx
│       └── ThemeCloud.tsx
├── hooks/
│   ├── useEntries.ts           # Entry CRUD operations
│   ├── useChat.ts              # Chat state & API calls
│   └── useInsights.ts          # Insights fetching
├── stores/
│   └── journalStore.ts         # Zustand state management
└── lib/
    ├── api.ts                  # API client
    └── formatters.ts           # Date, mood formatting
```

### State Management (Zustand)

```typescript
interface JournalStore {
  // Mode
  mode: 'journal' | 'chat' | 'hybrid';
  setMode: (mode: Mode) => void;

  // Current entry
  currentEntry: {
    content: string;
    mood: Mood | null;
    tags: string[];
  };
  updateCurrentEntry: (updates: Partial<CurrentEntry>) => void;
  saveEntry: () => Promise<void>;

  // Chat
  conversations: Conversation[];
  currentConversation: Conversation | null;
  sendMessage: (content: string) => Promise<void>;

  // Entries
  entries: Entry[];
  fetchEntries: (params?: FetchParams) => Promise<void>;

  // UI
  sidebarOpen: boolean;
  darkMode: boolean;
}
```

---

## Deployment Architecture

### Option A: Extend TomOS (Recommended)

Add journal functionality to existing TomOS backend:

```
TomOS PostgreSQL
├── existing tables...
└── journal_entries
└── journal_conversations
└── journal_summaries

TomOS API
├── existing routes...
└── /api/journal/...
```

**Pros:** Single database, shared auth, unified system
**Cons:** Tighter coupling

### Option B: Standalone Service

Separate microservice that talks to TomOS:

```
Journal Service (Node/Express)
├── Own PostgreSQL instance
├── Calls TomOS API for user data
└── Independent deployment
```

**Pros:** Clean separation, can iterate independently
**Cons:** More infrastructure, eventual consistency

### Hosting

- **Frontend:** Vercel (you're already using this)
- **Backend:** Railway, Render, or Fly.io
- **Database:** Supabase, Neon, or self-hosted Postgres

---

## Security & Privacy Considerations

Journal entries are deeply personal. Security is non-negotiable.

1. **Encryption at rest:** All entries encrypted in database
2. **Encryption in transit:** TLS everywhere
3. **Access control:** Only the user can see their entries
4. **Data export:** User can export all data at any time
5. **Data deletion:** User can permanently delete all data
6. **Claude API:** Entries sent to Claude are not used for training (check Anthropic's data policy)

---

## MVP Scope (Weekend Sprint)

### Must Have
- [ ] Basic journal editor (plain text is fine)
- [ ] Save entries to database
- [ ] Chat with Claude (context = last 5 entries)
- [ ] Mode toggle (journal/chat/hybrid)
- [ ] Dark mode

### Should Have
- [ ] Mood selection
- [ ] Tag system
- [ ] Past entries sidebar
- [ ] Claude reflections on entries

### Nice to Have
- [ ] Voice-to-text capture
- [ ] Weekly summary generation
- [ ] Pattern/theme detection
- [ ] Search/filter entries

---

## Future Enhancements

1. **Voice journaling:** Transcribe voice memos into entries
2. **Mobile app:** React Native or SwiftUI for native experience
3. **Proactive check-ins:** "It's been 3 days - want to check in?"
4. **Integration with TomOS:** Pull in calendar, tasks, metrics context
5. **Shareable summaries:** Export weekly reflections
6. **Mood correlations:** Connect mood to external factors (sleep, weather, calendar)

---

## Next Steps

1. **Validate the UX:** Play with the prototype, decide what feels right
2. **Set up the backend:** Either extend TomOS or scaffold new service
3. **Build Phase 1:** Basic entry capture → storage → Claude chat
4. **Iterate:** Add features based on actual usage
