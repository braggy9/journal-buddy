import { useState, useRef, useEffect } from 'react';
import { Send, BookOpen, MessageCircle, Sparkles, Hash, Smile, Meh, Frown, ChevronDown, Moon, Sun, Menu, X, TrendingUp, Heart, Brain, Zap } from 'lucide-react';
import { useJournalStore } from '../stores/journalStore';
import { useEntries, useCreateEntry } from '../hooks/useEntries';
import { useInsights } from '../hooks/useInsights';
import { format, parseISO } from 'date-fns';

const MoodIcon = ({ mood, size = 20 }: { mood?: string | null; size?: number }) => {
  const props = { size, strokeWidth: 1.5 };
  switch (mood) {
    case 'good': return <Smile {...props} className="text-emerald-500" />;
    case 'okay': return <Meh {...props} className="text-amber-500" />;
    case 'rough': return <Frown {...props} className="text-rose-500" />;
    default: return <Meh {...props} className="text-slate-400" />;
  }
};

const JournalBuddy = () => {
  // Store state
  const {
    mode,
    setMode,
    darkMode,
    toggleDarkMode,
    sidebarOpen,
    toggleSidebar,
    currentEntry,
    updateCurrentEntry,
    clearCurrentEntry,
    entries: storeEntries,
    currentConversation,
    sendMessage: storeSendMessage,
    isTyping
  } = useJournalStore();

  // Queries
  const { data: entriesData, isLoading: entriesLoading } = useEntries({ limit: 50 });
  const { data: insightsData } = useInsights('week');
  const createEntryMutation = useCreateEntry();

  // Local UI state
  const [chatInput, setChatInput] = useState('');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const availableTags = ['work', 'personal', 'kids', 'health', 'adhd', 'wins', 'struggles', 'ideas', 'gratitude', 'goals'];

  const bg = darkMode ? 'bg-slate-950' : 'bg-slate-50';
  const borderColor = darkMode ? 'border-slate-800' : 'border-slate-200';
  const textPrimary = darkMode ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = darkMode ? 'text-slate-400' : 'text-slate-500';
  const inputBg = darkMode ? 'bg-slate-800' : 'bg-slate-100';

  // Use store entries or fallback to fetched entries
  const entries = storeEntries.length > 0 ? storeEntries : (entriesData?.entries || []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation?.messages]);

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    await storeSendMessage(chatInput);
    setChatInput('');
  };

  const handleSaveEntry = async () => {
    if (!currentEntry.content.trim()) return;

    try {
      await createEntryMutation.mutateAsync({
        content: currentEntry.content,
        mood: currentEntry.mood || undefined,
        tags: currentEntry.tags,
        generateReflection: true
      });
      clearCurrentEntry();
    } catch (error) {
      console.error('Failed to save entry:', error);
    }
  };

  const toggleTag = (tag: string) => {
    const currentTags = currentEntry.tags;
    updateCurrentEntry({
      tags: currentTags.includes(tag)
        ? currentTags.filter(t => t !== tag)
        : [...currentTags, tag]
    });
  };

  // Journal Panel Component
  const JournalPanel = ({ fullWidth = false }) => (
    <div className={`flex flex-col h-full ${fullWidth ? '' : 'border-r ' + borderColor}`}>
      {/* Entry Header */}
      <div className={`p-4 border-b ${borderColor}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-indigo-400" />
            <span className={`font-medium ${textPrimary}`}>New Entry</span>
          </div>
          <span className={`text-sm ${textSecondary}`}>
            {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
        </div>

        {/* Mood Selector */}
        <div className="flex items-center gap-4">
          <span className={`text-sm ${textSecondary}`}>How are you?</span>
          <div className="flex gap-2">
            {(['good', 'okay', 'rough'] as const).map((mood) => (
              <button
                key={mood}
                onClick={() => updateCurrentEntry({ mood })}
                className={`p-2 rounded-lg transition-all ${
                  currentEntry.mood === mood
                    ? (darkMode ? 'bg-slate-700' : 'bg-slate-200')
                    : 'hover:' + (darkMode ? 'bg-slate-800' : 'bg-slate-100')
                }`}
              >
                <MoodIcon mood={mood} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Text Area */}
      <div className="flex-1 p-4">
        <textarea
          ref={textareaRef}
          value={currentEntry.content}
          onChange={(e) => updateCurrentEntry({ content: e.target.value })}
          placeholder="What's on your mind?"
          className={`w-full h-full resize-none ${inputBg} ${textPrimary} rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:${textSecondary}`}
        />
      </div>

      {/* Tags & Actions */}
      <div className={`p-4 border-t ${borderColor}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {currentEntry.tags.map(tag => (
              <span
                key={tag}
                onClick={() => toggleTag(tag)}
                className="px-2 py-1 text-xs rounded-full bg-indigo-500/20 text-indigo-300 cursor-pointer hover:bg-indigo-500/30"
              >
                #{tag} ×
              </span>
            ))}
            <button
              onClick={() => setShowTagPicker(!showTagPicker)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full ${inputBg} ${textSecondary} hover:${textPrimary}`}
            >
              <Hash size={12} />
              Add tag
              <ChevronDown size={12} />
            </button>
          </div>
          <button
            onClick={handleSaveEntry}
            disabled={!currentEntry.content.trim() || createEntryMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createEntryMutation.isPending ? 'Saving...' : 'Save Entry'}
          </button>
        </div>

        {/* Tag Picker Dropdown */}
        {showTagPicker && (
          <div className={`flex flex-wrap gap-2 p-3 rounded-lg ${inputBg} mt-2`}>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2 py-1 text-xs rounded-full transition-colors ${
                  currentEntry.tags.includes(tag)
                    ? 'bg-indigo-500/30 text-indigo-300'
                    : `${darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-600'} hover:bg-indigo-500/20`
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Chat Panel Component
  const ChatPanel = () => {
    const messages = currentConversation?.messages || [];

    return (
      <div className="flex flex-col h-full">
        {/* Chat Header */}
        <div className={`p-4 border-b ${borderColor}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <span className={`font-medium ${textPrimary}`}>Journal Buddy</span>
              <p className={`text-xs ${textSecondary}`}>Your reflective companion</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className={`text-sm ${textSecondary}`}>Start a conversation with your journal buddy...</p>
            </div>
          )}
          {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-3 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : `${darkMode ? 'bg-slate-800' : 'bg-slate-100'} ${textPrimary} rounded-bl-sm`
              }`}>
                <p className="text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className={`p-3 rounded-2xl rounded-bl-sm ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className={`p-4 border-t ${borderColor}`}>
          <div className={`flex items-center gap-2 ${inputBg} rounded-xl p-2`}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
              placeholder="Talk to your journal buddy..."
              className={`flex-1 bg-transparent ${textPrimary} px-2 focus:outline-none placeholder:${textSecondary}`}
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || isTyping}
              className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Sidebar with past entries
  const Sidebar = () => (
    <div className={`w-72 border-r ${borderColor} flex flex-col`}>
      <div className={`p-4 border-b ${borderColor}`}>
        <h2 className={`font-semibold ${textPrimary}`}>Recent Entries</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {entriesLoading && (
          <div className="p-4 text-center">
            <p className={`text-sm ${textSecondary}`}>Loading entries...</p>
          </div>
        )}
        {!entriesLoading && entries.length === 0 && (
          <div className="p-4 text-center">
            <p className={`text-sm ${textSecondary}`}>No entries yet. Start journaling!</p>
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.id} className={`p-4 border-b ${borderColor} hover:${inputBg} cursor-pointer transition-colors`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm ${textSecondary}`}>
                {format(parseISO(entry.created_at), 'MMM d, yyyy')}
              </span>
              {entry.mood && <MoodIcon mood={entry.mood} size={16} />}
            </div>
            <p className={`text-sm ${textPrimary} line-clamp-2 mb-2`}>{entry.content}</p>
            {entry.tags && entry.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {entry.tags.slice(0, 3).map(tag => (
                  <span key={tag} className={`text-xs ${textSecondary}`}>#{tag}</span>
                ))}
              </div>
            )}
            {entry.reflection && (
              <div className="mt-2 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles size={10} className="text-indigo-400" />
                  <span className="text-xs text-indigo-400">Claude's reflection</span>
                </div>
                <p className="text-xs text-indigo-300/80 line-clamp-2">{entry.reflection}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Insights Panel */}
      <div className={`p-4 border-t ${borderColor}`}>
        <h3 className={`text-sm font-medium ${textPrimary} mb-3`}>This Week</h3>
        <div className="space-y-2">
          {insightsData ? (
            <>
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-emerald-400" />
                <span className={`text-xs ${textSecondary}`}>
                  Mood trending {insightsData.moodTrend}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Brain size={14} className="text-violet-400" />
                <span className={`text-xs ${textSecondary}`}>
                  {insightsData.entryCount} entries
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-amber-400" />
                <span className={`text-xs ${textSecondary}`}>
                  {insightsData.streak} day streak
                </span>
              </div>
            </>
          ) : (
            <p className={`text-xs ${textSecondary}`}>Start journaling to see insights</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`h-screen flex ${bg}`}>
      {/* Sidebar */}
      {sidebarOpen && <Sidebar />}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className={`h-14 border-b ${borderColor} flex items-center justify-between px-4`}>
          <div className="flex items-center gap-4">
            <button onClick={toggleSidebar} className={`p-2 rounded-lg hover:${inputBg}`}>
              {sidebarOpen ? <X size={18} className={textSecondary} /> : <Menu size={18} className={textSecondary} />}
            </button>
            <div className="flex items-center gap-2">
              <Heart size={20} className="text-rose-400" />
              <span className={`font-semibold ${textPrimary}`}>Journal Buddy</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Selector */}
            <div className={`flex rounded-lg ${inputBg} p-1`}>
              {[
                { id: 'journal' as const, icon: BookOpen, label: 'Journal' },
                { id: 'hybrid' as const, icon: Sparkles, label: 'Both' },
                { id: 'chat' as const, icon: MessageCircle, label: 'Chat' }
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    mode === id
                      ? 'bg-indigo-600 text-white'
                      : `${textSecondary} hover:${textPrimary}`
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg hover:${inputBg}`}
            >
              {darkMode ? <Sun size={18} className={textSecondary} /> : <Moon size={18} className={textSecondary} />}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {mode === 'journal' && <JournalPanel fullWidth />}
          {mode === 'chat' && <ChatPanel />}
          {mode === 'hybrid' && (
            <>
              <div className="flex-1">
                <JournalPanel />
              </div>
              <div className="flex-1">
                <ChatPanel />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default JournalBuddy;
