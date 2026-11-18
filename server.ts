import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initDatabase, PUBLIC_UPLOADS_PATH } from './server/db';
import { attachSession } from './server/auth';
import { authRouter } from './server/routes/auth';
import { publicRouter } from './server/routes/public';
import { playerRouter } from './server/routes/player';
import { adminRouter } from './server/routes/admin';

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  initDatabase();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(attachSession);

  // Serve only public uploaded assets (images and non-confidential audio)
  app.use('/uploads/public', express.static(PUBLIC_UPLOADS_PATH));

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/player', playerRouter);
  app.use('/api/admin', adminRouter);

  // Maintenance mode & health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, platform: 'AURVAN UNIVERSE' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AURVAN UNIVERSE server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AURVAN UNIVERSE server:', err);
  process.exit(1);
});
