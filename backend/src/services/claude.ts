import Anthropic from '@anthropic-ai/sdk';
import { query } from '../db';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Types
interface Entry {
  id: string;
  content: string;
  mood: string | null;
  tags: string[];
  themes: string[];
  created_at: Date;
}

interface ContextPayload {
  recentEntries: Array<{
    date: string;
    content: string;
    mood: string | null;
    themes: string[];
  }>;
  moodTrend: string;
  recurringThemes: string[];
  longTermSummary: string;
}

// Base system prompt
const BASE_SYSTEM_PROMPT = `You are Tom's journal companion - a thoughtful presence who reads alongside him,
notices patterns, and engages when he wants to think out loud.

## Your Core Purpose

You're not here to fix things or optimise Tom's life. You're here to help him
*process* - to turn the noise in his head into something he can look at, examine,
and understand. Sometimes that means asking questions. Sometimes it means just
reflecting back what you hear. Sometimes it means noticing something he missed.

## How You Show Up

### Active Listening Over Advice
Your default mode is curiosity, not solution-finding. When Tom shares something:
- First, acknowledge what he's actually saying (not what you think he should focus on)
- Reflect back the emotional texture, not just the facts
- Ask questions that deepen exploration, not questions that steer toward answers

### Pattern Recognition
You have access to Tom's journal history. Use it. Reference specific entries,
notice when themes repeat, track how his language changes over time.

### Match His Energy
Read the room. If he's venting, validate. If he's processing, follow his thread.
If he's celebrating, celebrate with him. If he's low energy, keep responses shorter.

### Directness Over Comfort
Tom values honesty. Don't hedge with "it might be worth considering..." - just say the thing.

### One Thread at a Time
Don't overwhelm with multiple questions or observations. Pick the most interesting
thread and pull it. Let him guide where this goes.

## Communication Style

- Dry humour welcome - Tom appreciates wit
- Concise by default - expand only if asked
- Specific over general - reference actual things he said
- Questions are single - one at a time
- No therapy-speak - avoid "processing," "holding space," etc.`;

// Assemble context from database
export async function assembleContext(userId: string): Promise<ContextPayload> {
  // Get recent entries (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentEntriesResult = await query<Entry>(
    `SELECT id, content, mood, tags, themes, created_at
     FROM entries
     WHERE user_id = $1 AND created_at >= $2 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId, sevenDaysAgo.toISOString()]
  );

  const recentEntries = recentEntriesResult.rows.map(e => ({
    date: e.created_at.toISOString().split('T')[0],
    content: e.content,
    mood: e.mood,
    themes: e.themes || []
  }));

  // Calculate mood trend
  const moodTrend = calculateMoodTrend(recentEntries);

  // Extract recurring themes
  const themeCounts = new Map<string, number>();
  recentEntries.forEach(e => {
    e.themes.forEach(theme => {
      themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
    });
  });
  const recurringThemes = Array.from(themeCounts.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([theme]) => theme)
    .slice(0, 5);

  // Get most recent monthly summary
  const summaryResult = await query<{ summary: string }>(
    `SELECT summary FROM summaries
     WHERE user_id = $1 AND period_type = 'monthly'
     ORDER BY period_start DESC
     LIMIT 1`,
    [userId]
  );
  const longTermSummary = summaryResult.rows[0]?.summary || '';

  return {
    recentEntries,
    moodTrend,
    recurringThemes,
    longTermSummary
  };
}

function calculateMoodTrend(entries: Array<{ mood: string | null }>): string {
  const moodValues = entries
    .filter(e => e.mood)
    .map(e => {
      switch (e.mood) {
        case 'good': return 1;
        case 'okay': return 0;
        case 'rough': return -1;
        default: return 0;
      }
    });

  if (moodValues.length < 2) return 'Not enough data';

  const midpoint = Math.floor(moodValues.length / 2);
  const recentAvg = moodValues.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
  const olderAvg = moodValues.slice(midpoint).reduce((a, b) => a + b, 0) / (moodValues.length - midpoint);

  if (recentAvg > olderAvg + 0.2) return 'Trending up compared to earlier this week';
  if (recentAvg < olderAvg - 0.2) return 'Trending down compared to earlier this week';
  return 'Relatively stable this week';
}

function buildSystemPrompt(context: ContextPayload, currentEntry?: string): string {
  const contextSection = `
## Current Context

### Recent Entries (Last 7 Days)
${context.recentEntries.map(e => `
**${e.date}** (${e.mood || 'no mood logged'})
${e.content}
`).join('\n---\n')}

### Mood Pattern
${context.moodTrend}

### Recurring Themes
${context.recurringThemes.length > 0 ? context.recurringThemes.join(', ') : 'No clear patterns yet'}

### Long-Term Context
${context.longTermSummary || 'No long-term summary available yet'}
`;

  const sessionSection = currentEntry ? `
## This Session

### Current Entry Being Discussed
${currentEntry}
` : '';

  return `${BASE_SYSTEM_PROMPT}\n\n---\n${contextSection}\n${sessionSection}`;
}

// Main chat function
export async function chat(
  context: ContextPayload,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentEntry?: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(context, currentEntry);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: systemPrompt,
    messages: conversationHistory.map(m => ({
      role: m.role,
      content: m.content
    }))
  });

  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text || 'I\'m having trouble responding right now.';
}

// Generate reflection for an entry
export async function generateReflection(
  userId: string,
  entry: Entry,
  style: 'brief' | 'deep' | 'questioning' = 'brief'
): Promise<string> {
  // Get recent entries for context
  const recentResult = await query<{ content: string; mood: string; created_at: Date }>(
    `SELECT content, mood, created_at FROM entries
     WHERE user_id = $1 AND id != $2 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId, entry.id]
  );

  const recentContext = recentResult.rows.map(e =>
    `${e.created_at.toISOString().split('T')[0]} (${e.mood || 'no mood'}): ${e.content.slice(0, 200)}...`
  ).join('\n');

  const styleInstructions = {
    brief: 'Keep it to 2-3 sentences maximum. One observation or one question, not both.',
    deep: 'You can be more thorough - 3-4 sentences exploring patterns or tensions.',
    questioning: 'Focus on asking a single, thought-provoking question based on what you noticed.'
  };

  const prompt = `Generate a reflection on this journal entry.

## Guidelines
- Acknowledge the core emotion or experience first
- Notice one interesting thing (a pattern, tension, contradiction, or insight)
- ${styleInstructions[style]}
- Don't be preachy or prescriptive
- Match Tom's tone - if he's being dry, you can be dry

## Entry
${entry.content}

## Mood
${entry.mood || 'Not specified'}

## Recent Context
${recentContext || 'No recent entries'}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 300,
    system: 'You are Tom\'s journal companion. Generate brief, thoughtful reflections on his entries. Be direct, avoid therapy-speak, and don\'t be preachy.',
    messages: [{ role: 'user', content: prompt }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text || '';
}

// Generate weekly summary
export async function generateWeeklySummary(
  entries: Array<{ content: string; mood: string; created_at: Date }>
): Promise<string> {
  const entriesText = entries.map(e => `
**${e.created_at.toISOString().split('T')[0]}** (${e.mood || 'no mood'})
${e.content}
`).join('\n---\n');

  const prompt = `Generate a weekly reflection for Tom's journal.

## This Week's Entries
${entriesText}

## Guidelines
Write a brief (3-4 paragraph) reflection that:
1. Captures the overall texture of the week - not a summary of events, but the emotional arc
2. Notes any patterns or threads that ran through multiple entries
3. Highlights one moment or insight that stood out
4. Ends with a gentle observation or question looking forward

## Tone
- Warm but not saccharine
- Specific, referencing actual things he wrote
- Concise - this should feel like a thoughtful note, not an essay
- No therapy-speak or productivity framing

## Format
No headers or bullet points. Just flowing paragraphs.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 800,
    system: 'You are Tom\'s journal companion. Generate thoughtful weekly summaries that capture the emotional arc of his week.',
    messages: [{ role: 'user', content: prompt }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  return textBlock?.text || '';
}

// Detect patterns in entries
export async function detectPatterns(
  entries: Array<{ content: string; mood: string; tags: string[]; created_at: Date }>
): Promise<{
  themes: Array<{ theme: string; frequency: number; sentiment: string }>;
  emotionalPattern: string;
  unresolvedThreads: string[];
  contradictions: string[];
  growthIndicators: string[];
}> {
  const entriesText = entries.map(e => `
**${e.created_at.toISOString().split('T')[0]}** (${e.mood || 'no mood'}) [${e.tags.join(', ')}]
${e.content}
`).join('\n---\n');

  const prompt = `Analyze these journal entries and extract patterns.

## Entries
${entriesText}

## Extract:

1. **Recurring themes** - Topics or concerns that appear multiple times
   Format: { theme: string, frequency: number, sentiment: 'positive' | 'negative' | 'neutral' }

2. **Emotional patterns** - How mood tends to shift (e.g., "starts week strong, dips mid-week")

3. **Unresolved threads** - Things mentioned but not fully explored or resolved

4. **Contradictions** - Places where stated beliefs/values conflict with actions or other statements

5. **Growth indicators** - Signs of progress, insight, or positive change

Return as JSON only, no explanation:
{
  "themes": [...],
  "emotionalPattern": "...",
  "unresolvedThreads": [...],
  "contradictions": [...],
  "growthIndicators": [...]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    system: 'You are analyzing journal entries for patterns. Return only valid JSON, no explanation.',
    messages: [{ role: 'user', content: prompt }]
  });

  const textBlock = response.content.find(block => block.type === 'text');
  try {
    return JSON.parse(textBlock?.text || '{}');
  } catch {
    return {
      themes: [],
      emotionalPattern: 'Unable to detect patterns',
      unresolvedThreads: [],
      contradictions: [],
      growthIndicators: []
    };
  }
}
