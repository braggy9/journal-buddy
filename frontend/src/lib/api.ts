const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Types matching backend
export interface Entry {
  id: string;
  content: string;
  word_count: number;
  mood: 'good' | 'okay' | 'rough' | null;
  energy: '1' | '2' | '3' | '4' | '5' | null;
  tags: string[];
  reflection: string | null;
  themes: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateEntryParams {
  content: string;
  mood?: 'good' | 'okay' | 'rough';
  energy?: '1' | '2' | '3' | '4' | '5';
  tags?: string[];
  generateReflection?: boolean;
}

export interface SendMessageParams {
  message: string;
  conversationId?: string;
  entryId?: string;
}

export interface ChatResponse {
  conversationId: string;
  response: string;
}

export interface Insights {
  period: { start: string; end: string };
  entryCount: number;
  totalWords: number;
  moodDistribution: { good: number; okay: number; rough: number };
  moodTrend: 'up' | 'stable' | 'down';
  topTags: Array<{ tag: string; count: number }>;
  topThemes: string[];
  streak: number;
}

// Fetch wrapper with error handling
async function fetcher<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add auth header when implementing auth
      'X-User-Id': '00000000-0000-0000-0000-000000000001',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// API methods
export const api = {
  // Entries
  async getEntries(params?: {
    limit?: number;
    offset?: number;
    mood?: string;
    tag?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ entries: Entry[]; count: number }> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.set(key, String(value));
      });
    }
    const query = searchParams.toString();
    return fetcher(`/entries${query ? `?${query}` : ''}`);
  },

  async getEntry(id: string): Promise<Entry> {
    return fetcher(`/entries/${id}`);
  },

  async createEntry(params: CreateEntryParams): Promise<Entry> {
    return fetcher('/entries', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async updateEntry(id: string, updates: Partial<CreateEntryParams>): Promise<Entry> {
    return fetcher(`/entries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  async deleteEntry(id: string): Promise<void> {
    await fetcher(`/entries/${id}`, { method: 'DELETE' });
  },

  async generateReflection(
    entryId: string,
    style?: 'brief' | 'deep' | 'questioning'
  ): Promise<{ reflection: string }> {
    return fetcher(`/entries/${entryId}/reflect`, {
      method: 'POST',
      body: JSON.stringify({ style })
    });
  },

  // Chat
  async sendMessage(params: SendMessageParams): Promise<ChatResponse> {
    return fetcher('/chat', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async getConversations(params?: {
    limit?: number;
    offset?: number;
  }): Promise<{ conversations: any[]; count: number }> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.set(key, String(value));
      });
    }
    const query = searchParams.toString();
    return fetcher(`/chat/conversations${query ? `?${query}` : ''}`);
  },

  async getConversation(id: string): Promise<any> {
    return fetcher(`/chat/conversations/${id}`);
  },

  // Insights
  async getInsights(period?: 'week' | 'month' | 'quarter'): Promise<Insights> {
    const params = period ? `?period=${period}` : '';
    return fetcher(`/insights${params}`);
  },

  async getSummary(period?: 'week' | 'month'): Promise<{ summary: string | null }> {
    const params = period ? `?period=${period}` : '';
    return fetcher(`/insights/summary${params}`);
  },

  async getPatterns(): Promise<{
    patterns: {
      themes: Array<{ theme: string; frequency: number; sentiment: string }>;
      emotionalPattern: string;
      unresolvedThreads: string[];
      contradictions: string[];
      growthIndicators: string[];
    } | null;
  }> {
    return fetcher('/insights/patterns');
  }
};
