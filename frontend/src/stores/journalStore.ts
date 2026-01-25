import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../lib/api';

// Types
export type Mode = 'journal' | 'chat' | 'hybrid';
export type Mood = 'good' | 'okay' | 'rough';

export interface Entry {
  id: string;
  content: string;
  mood: Mood | null;
  energy: '1' | '2' | '3' | '4' | '5' | null;
  tags: string[];
  reflection: string | null;
  themes: string[];
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  entry_id: string | null;
  session_type: 'freeform' | 'entry_reflection' | 'weekly_review';
  messages: Message[];
  created_at: string;
  updated_at: string;
}

interface CurrentEntry {
  content: string;
  mood: Mood | null;
  tags: string[];
}

interface JournalStore {
  // Mode
  mode: Mode;
  setMode: (mode: Mode) => void;

  // UI
  darkMode: boolean;
  toggleDarkMode: () => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Current entry being written
  currentEntry: CurrentEntry;
  updateCurrentEntry: (updates: Partial<CurrentEntry>) => void;
  clearCurrentEntry: () => void;

  // Saved entries
  entries: Entry[];
  setEntries: (entries: Entry[]) => void;
  addEntry: (entry: Entry) => void;
  updateEntry: (id: string, updates: Partial<Entry>) => void;

  // Chat
  currentConversation: Conversation | null;
  setCurrentConversation: (conversation: Conversation | null) => void;
  addMessage: (message: Message) => void;
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;

  // Selected entry (for chat context)
  selectedEntryId: string | null;
  selectEntry: (id: string | null) => void;

  // Actions
  saveEntry: () => Promise<Entry | null>;
  sendMessage: (content: string) => Promise<void>;
  generateReflection: (entryId: string) => Promise<string | null>;
}

const DEFAULT_CURRENT_ENTRY: CurrentEntry = {
  content: '',
  mood: null,
  tags: []
};

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      // Mode
      mode: 'hybrid',
      setMode: (mode) => set({ mode }),

      // UI
      darkMode: true,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      // Current entry
      currentEntry: DEFAULT_CURRENT_ENTRY,
      updateCurrentEntry: (updates) => set((state) => ({
        currentEntry: { ...state.currentEntry, ...updates }
      })),
      clearCurrentEntry: () => set({ currentEntry: DEFAULT_CURRENT_ENTRY }),

      // Entries
      entries: [],
      setEntries: (entries) => set({ entries }),
      addEntry: (entry) => set((state) => ({
        entries: [entry, ...state.entries]
      })),
      updateEntry: (id, updates) => set((state) => ({
        entries: state.entries.map(e =>
          e.id === id ? { ...e, ...updates } : e
        )
      })),

      // Chat
      currentConversation: null,
      setCurrentConversation: (conversation) => set({ currentConversation: conversation }),
      addMessage: (message) => set((state) => ({
        currentConversation: state.currentConversation ? {
          ...state.currentConversation,
          messages: [...state.currentConversation.messages, message]
        } : null
      })),
      isTyping: false,
      setIsTyping: (typing) => set({ isTyping: typing }),

      // Selected entry
      selectedEntryId: null,
      selectEntry: (id) => set({ selectedEntryId: id }),

      // Actions
      saveEntry: async () => {
        const { currentEntry, clearCurrentEntry, addEntry } = get();

        if (!currentEntry.content.trim()) return null;

        try {
          const entry = await api.createEntry({
            content: currentEntry.content,
            mood: currentEntry.mood || undefined,
            tags: currentEntry.tags,
            generateReflection: true
          });

          addEntry(entry);
          clearCurrentEntry();
          return entry;
        } catch (error) {
          console.error('Failed to save entry:', error);
          return null;
        }
      },

      sendMessage: async (content: string) => {
        const {
          currentConversation,
          setCurrentConversation,
          addMessage,
          setIsTyping,
          selectedEntryId
        } = get();

        // Add user message optimistically
        const userMessage: Message = {
          id: `temp-${Date.now()}`,
          role: 'user',
          content,
          created_at: new Date().toISOString()
        };

        if (currentConversation) {
          addMessage(userMessage);
        } else {
          // Start new conversation
          setCurrentConversation({
            id: `temp-conv-${Date.now()}`,
            entry_id: selectedEntryId,
            session_type: selectedEntryId ? 'entry_reflection' : 'freeform',
            messages: [userMessage],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }

        setIsTyping(true);

        try {
          const response = await api.sendMessage({
            message: content,
            conversationId: currentConversation?.id.startsWith('temp') ? undefined : currentConversation?.id,
            entryId: selectedEntryId || undefined
          });

          // Update conversation with real ID if it was new
          const assistantMessage: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: response.response,
            created_at: new Date().toISOString()
          };

          set((state) => ({
            currentConversation: state.currentConversation ? {
              ...state.currentConversation,
              id: response.conversationId,
              messages: [...state.currentConversation.messages, assistantMessage]
            } : null
          }));
        } catch (error) {
          console.error('Failed to send message:', error);
          // Remove the optimistic message on error
          set((state) => ({
            currentConversation: state.currentConversation ? {
              ...state.currentConversation,
              messages: state.currentConversation.messages.slice(0, -1)
            } : null
          }));
        } finally {
          setIsTyping(false);
        }
      },

      generateReflection: async (entryId: string) => {
        try {
          const { reflection } = await api.generateReflection(entryId);
          get().updateEntry(entryId, { reflection });
          return reflection;
        } catch (error) {
          console.error('Failed to generate reflection:', error);
          return null;
        }
      }
    }),
    {
      name: 'journal-buddy-storage',
      partialize: (state) => ({
        mode: state.mode,
        darkMode: state.darkMode,
        sidebarOpen: state.sidebarOpen
      })
    }
  )
);
