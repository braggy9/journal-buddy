import { Router } from 'express';
import { query } from '../db';
import { generateWeeklySummary, detectPatterns } from '../services/claude';

export const insightsRouter = Router();

// Types
interface MoodStats {
  good: number;
  okay: number;
  rough: number;
}

interface WeeklyInsights {
  period: { start: string; end: string };
  entryCount: number;
  totalWords: number;
  moodDistribution: MoodStats;
  moodTrend: 'up' | 'stable' | 'down';
  topTags: Array<{ tag: string; count: number }>;
  topThemes: string[];
  streak: number;
  summary?: string;
}

// GET /api/insights - Get insights for a period
insightsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { period = 'week' } = req.query;

    // Determine date range
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get entries for period
    const entriesResult = await query<{
      id: string;
      content: string;
      mood: string | null;
      tags: string[];
      themes: string[];
      word_count: number;
      created_at: Date;
    }>(
      `SELECT id, content, mood, tags, themes, word_count, created_at
       FROM entries
       WHERE user_id = $1 AND created_at >= $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId, startDate.toISOString()]
    );

    const entries = entriesResult.rows;

    // Calculate mood distribution
    const moodDistribution: MoodStats = { good: 0, okay: 0, rough: 0 };
    entries.forEach(e => {
      if (e.mood && e.mood in moodDistribution) {
        moodDistribution[e.mood as keyof MoodStats]++;
      }
    });

    // Calculate mood trend (compare first half to second half)
    const midpoint = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(midpoint);  // Older entries
    const secondHalf = entries.slice(0, midpoint);  // Newer entries

    const moodScore = (entries: typeof firstHalf) => {
      const weights = { good: 1, okay: 0, rough: -1 };
      return entries.reduce((sum, e) => {
        if (e.mood && e.mood in weights) {
          return sum + weights[e.mood as keyof typeof weights];
        }
        return sum;
      }, 0) / Math.max(entries.length, 1);
    };

    const firstHalfScore = moodScore(firstHalf);
    const secondHalfScore = moodScore(secondHalf);
    const moodTrend = secondHalfScore > firstHalfScore + 0.1 ? 'up' :
                      secondHalfScore < firstHalfScore - 0.1 ? 'down' : 'stable';

    // Calculate top tags
    const tagCounts = new Map<string, number>();
    entries.forEach(e => {
      e.tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    // Extract top themes
    const themeCounts = new Map<string, number>();
    entries.forEach(e => {
      e.themes.forEach(theme => {
        themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
      });
    });
    const topThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);

    // Calculate streak
    const streak = await calculateStreak(userId);

    // Calculate total words
    const totalWords = entries.reduce((sum, e) => sum + (e.word_count || 0), 0);

    const insights: WeeklyInsights = {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: now.toISOString().split('T')[0]
      },
      entryCount: entries.length,
      totalWords,
      moodDistribution,
      moodTrend,
      topTags,
      topThemes,
      streak
    };

    res.json(insights);
  } catch (error) {
    next(error);
  }
});

// GET /api/insights/summary - Generate AI summary for period
insightsRouter.get('/summary', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { period = 'week' } = req.query;

    // Get or generate summary
    const periodType = period === 'month' ? 'monthly' : 'weekly';
    const now = new Date();
    const startDate = periodType === 'monthly'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : getWeekStart(now);

    // Check if we already have a summary
    const existingSummary = await query<{ summary: string }>(
      `SELECT summary FROM summaries
       WHERE user_id = $1 AND period_start = $2 AND period_type = $3`,
      [userId, startDate.toISOString().split('T')[0], periodType]
    );

    if (existingSummary.rowCount > 0) {
      return res.json({ summary: existingSummary.rows[0].summary });
    }

    // Generate new summary
    const entries = await query<{ content: string; mood: string; created_at: Date }>(
      `SELECT content, mood, created_at FROM entries
       WHERE user_id = $1 AND created_at >= $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [userId, startDate.toISOString()]
    );

    if (entries.rowCount === 0) {
      return res.json({ summary: null, message: 'No entries for this period' });
    }

    const summary = await generateWeeklySummary(entries.rows);

    // Save summary for future use
    await query(
      `INSERT INTO summaries (user_id, period_start, period_end, period_type, summary, entry_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, period_start, period_type)
       DO UPDATE SET summary = $5, entry_count = $6`,
      [
        userId,
        startDate.toISOString().split('T')[0],
        now.toISOString().split('T')[0],
        periodType,
        summary,
        entries.rowCount
      ]
    );

    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

// GET /api/insights/patterns - Detect patterns in entries
insightsRouter.get('/patterns', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';

    // Get last 30 days of entries
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const entries = await query<{ content: string; mood: string; tags: string[]; created_at: Date }>(
      `SELECT content, mood, tags, created_at FROM entries
       WHERE user_id = $1 AND created_at >= $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId, thirtyDaysAgo.toISOString()]
    );

    if (entries.rowCount < 3) {
      return res.json({
        patterns: null,
        message: 'Need more entries to detect patterns'
      });
    }

    const patterns = await detectPatterns(entries.rows);

    res.json({ patterns });
  } catch (error) {
    next(error);
  }
});

// Helper functions
async function calculateStreak(userId: string): Promise<number> {
  const result = await query<{ entry_date: string }>(
    `SELECT DISTINCT DATE(created_at) as entry_date
     FROM entries
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY entry_date DESC`,
    [userId]
  );

  if (result.rowCount === 0) return 0;

  const dates = result.rows.map(r => new Date(r.entry_date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  let currentDate = today;

  for (const date of dates) {
    const entryDate = new Date(date);
    entryDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (currentDate.getTime() - entryDate.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (diffDays === 0 || diffDays === 1) {
      streak++;
      currentDate = entryDate;
    } else {
      break;
    }
  }

  return streak;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
