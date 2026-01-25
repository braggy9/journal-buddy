import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { generateReflection } from '../services/claude';
import { validateBody } from '../middleware/validate';

export const entriesRouter = Router();

// Validation schemas
const createEntrySchema = z.object({
  content: z.string().min(1),
  mood: z.enum(['good', 'okay', 'rough']).optional(),
  energy: z.enum(['1', '2', '3', '4', '5']).optional(),
  tags: z.array(z.string()).optional().default([]),
  generateReflection: z.boolean().optional().default(false)
});

const updateEntrySchema = z.object({
  content: z.string().min(1).optional(),
  mood: z.enum(['good', 'okay', 'rough']).nullable().optional(),
  energy: z.enum(['1', '2', '3', '4', '5']).nullable().optional(),
  tags: z.array(z.string()).optional()
});

// Types
interface Entry {
  id: string;
  user_id: string;
  content: string;
  word_count: number;
  mood: 'good' | 'okay' | 'rough' | null;
  energy: '1' | '2' | '3' | '4' | '5' | null;
  tags: string[];
  reflection: string | null;
  themes: string[];
  created_at: Date;
  updated_at: Date;
}

// GET /api/entries - List entries
entriesRouter.get('/', async (req, res, next) => {
  try {
    // TODO: Get user_id from auth middleware
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';

    const { limit = 20, offset = 0, mood, tag, startDate, endDate } = req.query;

    let sql = `
      SELECT * FROM entries
      WHERE user_id = $1 AND deleted_at IS NULL
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (mood) {
      sql += ` AND mood = $${paramIndex++}`;
      params.push(mood);
    }

    if (tag) {
      sql += ` AND $${paramIndex++} = ANY(tags)`;
      params.push(tag);
    }

    if (startDate) {
      sql += ` AND created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), Number(offset));

    const result = await query<Entry>(sql, params);

    res.json({
      entries: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/entries/:id - Get single entry
entriesRouter.get('/:id', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { id } = req.params;

    const result = await query<Entry>(
      'SELECT * FROM entries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/entries - Create entry
entriesRouter.post('/', validateBody(createEntrySchema), async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { content, mood, energy, tags, generateReflection: shouldGenerateReflection } = req.body;

    // Create entry
    const result = await query<Entry>(
      `INSERT INTO entries (user_id, content, mood, energy, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, content, mood || null, energy || null, tags]
    );

    const entry = result.rows[0];

    // Generate reflection if requested
    if (shouldGenerateReflection) {
      try {
        const reflection = await generateReflection(userId, entry);
        await query(
          'UPDATE entries SET reflection = $1 WHERE id = $2',
          [reflection, entry.id]
        );
        entry.reflection = reflection;
      } catch (reflectionError) {
        console.error('Failed to generate reflection:', reflectionError);
        // Don't fail the request, just return without reflection
      }
    }

    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/entries/:id - Update entry
entriesRouter.patch('/:id', validateBody(updateEntrySchema), async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id, userId);

    const result = await query<Entry>(
      `UPDATE entries
       SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex++} AND user_id = $${paramIndex++} AND deleted_at IS NULL
       RETURNING *`,
      params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/entries/:id - Soft delete entry
entriesRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { id } = req.params;

    const result = await query(
      `UPDATE entries
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// POST /api/entries/:id/reflect - Generate reflection for existing entry
entriesRouter.post('/:id/reflect', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { id } = req.params;
    const { style = 'brief' } = req.body;

    // Get entry
    const entryResult = await query<Entry>(
      'SELECT * FROM entries WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId]
    );

    if (entryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const entry = entryResult.rows[0];

    // Generate reflection
    const reflection = await generateReflection(userId, entry, style);

    // Save reflection
    await query(
      'UPDATE entries SET reflection = $1 WHERE id = $2',
      [reflection, id]
    );

    res.json({ reflection });
  } catch (error) {
    next(error);
  }
});
