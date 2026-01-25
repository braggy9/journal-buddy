import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import { entriesRouter } from './routes/entries';
import { chatRouter } from './routes/chat';
import { insightsRouter } from './routes/insights';
import { errorHandler } from './middleware/errorHandler';
import { db } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/entries', entriesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/insights', insightsRouter);

// Error handling
app.use(errorHandler);

// Export app for Vercel
export default app;

// Start server (only in development)
if (process.env.NODE_ENV !== 'production') {
  async function start() {
    try {
      // Test database connection
      await db.query('SELECT NOW()');
      console.log('✓ Database connected');

      app.listen(PORT, () => {
        console.log(`✓ Server running on port ${PORT}`);
        console.log(`  Health: http://localhost:${PORT}/health`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  start();
}
