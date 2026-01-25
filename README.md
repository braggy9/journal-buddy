# Journal Buddy

A conversational journaling companion that combines traditional journal capture with an active AI partner. Built with React, Node/Express, PostgreSQL, and Claude.

## Project Structure

```
journal-buddy-project/
├── README.md                 # This file
├── database/
│   └── schema.sql           # PostgreSQL schema
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts         # Express server entry
│       ├── db/
│       │   └── index.ts     # Database connection
│       ├── routes/
│       │   ├── entries.ts   # Journal entries CRUD
│       │   ├── chat.ts      # Chat with Claude
│       │   └── insights.ts  # Analytics & patterns
│       ├── services/
│       │   └── claude.ts    # Claude API integration
│       └── middleware/
│           ├── validate.ts
│           └── errorHandler.ts
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── components/
│       │   └── JournalBuddy.tsx  # Main UI component
│       ├── stores/
│       │   └── journalStore.ts   # Zustand state
│       ├── hooks/
│       │   ├── useEntries.ts
│       │   └── useInsights.ts
│       └── lib/
│           └── api.ts            # API client
└── docs/
    ├── architecture.md      # Full system architecture
    └── system-prompt.md     # Claude prompt design
```

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 15+
- Anthropic API key

### 1. Database Setup

```bash
# Create database
createdb journal_buddy

# Run schema
psql journal_buddy < database/schema.sql
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings:
#   DATABASE_URL=postgresql://localhost:5432/journal_buddy
#   ANTHROPIC_API_KEY=your_key_here

# Start development server
npm run dev
```

Server runs on http://localhost:3001

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

App runs on http://localhost:5173

## Features

### Core Functionality
- **Dual-mode interface**: Journal mode, Chat mode, or Hybrid (split-screen)
- **Mood & energy tracking**: Quick selection before each entry
- **Tag system**: Categorise entries for filtering
- **AI reflections**: Claude generates thoughtful reflections on entries
- **Pattern detection**: Identify recurring themes and emotional trends

### Claude Integration
- **Conversational partner**: Active dialogue when you want to think out loud
- **Context-aware**: References recent entries, notices patterns
- **Personality**: Direct, witty, avoids therapy-speak
- **Weekly summaries**: AI-generated reflections on your week

## API Endpoints

### Entries
- `GET /api/entries` - List entries
- `POST /api/entries` - Create entry
- `GET /api/entries/:id` - Get single entry
- `PATCH /api/entries/:id` - Update entry
- `DELETE /api/entries/:id` - Soft delete entry
- `POST /api/entries/:id/reflect` - Generate reflection

### Chat
- `POST /api/chat` - Send message to Claude
- `GET /api/chat/conversations` - List conversations
- `GET /api/chat/conversations/:id` - Get conversation with messages

### Insights
- `GET /api/insights` - Get stats for period (week/month/quarter)
- `GET /api/insights/summary` - Get AI-generated summary
- `GET /api/insights/patterns` - Get pattern analysis

## Development Notes

### Environment Variables

**Backend (.env)**
```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/journal_buddy
FRONTEND_URL=http://localhost:5173
ANTHROPIC_API_KEY=your_key_here
```

**Frontend**
```
VITE_API_URL=http://localhost:3001/api
```

### Tech Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Zustand, TanStack Query
- **Backend**: Express, PostgreSQL, Zod validation
- **AI**: Claude Sonnet 4.5 via Anthropic API

## Extending

### TomOS Integration
To integrate with existing TomOS:
1. Add journal tables to TomOS PostgreSQL
2. Mount routes under `/api/journal/...`
3. Use existing TomOS auth middleware

### Mobile App
For native iOS/macOS:
- Use SwiftUI for UI
- Store entries in Core Data, sync to PostgreSQL
- Call Claude API when online

## Documentation

- **[Architecture Spec](docs/architecture.md)** - Full system design
- **[System Prompt Design](docs/system-prompt.md)** - How Claude behaves

---

Built with Claude 🤖
