import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { chat, assembleContext } from '../services/claude';
import { validateBody } from '../middleware/validate';

export const chatRouter = Router();

// Validation schemas
const sendMessageSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid().optional(),
  entryId: z.string().uuid().optional()
});

// Types
interface Conversation {
  id: string;
  user_id: string;
  entry_id: string | null;
  session_type: 'freeform' | 'entry_reflection' | 'weekly_review';
  title: string | null;
  created_at: Date;
  updated_at: Date;
}

interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
}

// POST /api/chat - Send message
chatRouter.post('/', validateBody(sendMessageSchema), async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { message, conversationId, entryId } = req.body;

    let conversation: Conversation;

    if (conversationId) {
      // Continue existing conversation
      const convResult = await query<Conversation>(
        'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, userId]
      );

      if (convResult.rowCount === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      conversation = convResult.rows[0];
    } else {
      // Create new conversation
      const sessionType = entryId ? 'entry_reflection' : 'freeform';
      const convResult = await query<Conversation>(
        `INSERT INTO conversations (user_id, entry_id, session_type)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, entryId || null, sessionType]
      );
      conversation = convResult.rows[0];
    }

    // Save user message
    await query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'user', $2)`,
      [conversation.id, message]
    );

    // Get conversation history
    const messagesResult = await query<Message>(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversation.id]
    );

    const conversationHistory = messagesResult.rows.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    // Get context for Claude
    const context = await assembleContext(userId);

    // Get entry if this conversation is about one
    let currentEntry: string | undefined;
    if (conversation.entry_id) {
      const entryResult = await query<{ content: string }>(
        'SELECT content FROM entries WHERE id = $1',
        [conversation.entry_id]
      );
      if (entryResult.rowCount > 0) {
        currentEntry = entryResult.rows[0].content;
      }
    }

    // Generate response
    const response = await chat(
      context,
      conversationHistory,
      currentEntry
    );

    // Save assistant message
    await query(
      `INSERT INTO messages (conversation_id, role, content)
       VALUES ($1, 'assistant', $2)`,
      [conversation.id, response]
    );

    // Update conversation timestamp
    await query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [conversation.id]
    );

    res.json({
      conversationId: conversation.id,
      response
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/conversations - List conversations
chatRouter.get('/conversations', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { limit = 20, offset = 0 } = req.query;

    const result = await query<Conversation & { message_count: number }>(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, Number(limit), Number(offset)]
    );

    res.json({
      conversations: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/chat/conversations/:id - Get conversation with messages
chatRouter.get('/conversations/:id', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { id } = req.params;

    const convResult = await query<Conversation>(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (convResult.rowCount === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messagesResult = await query<Message>(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      ...convResult.rows[0],
      messages: messagesResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/chat/conversations/:id - Delete conversation
chatRouter.delete('/conversations/:id', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || '00000000-0000-0000-0000-000000000001';
    const { id } = req.params;

    const result = await query(
      `UPDATE conversations
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
