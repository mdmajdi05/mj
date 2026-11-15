import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import { authRouter } from './routes/auth';
import { chatRouter } from './routes/chat';
import { attachSocketHandlers } from './sockets';
import { originGuard } from './lib/origin';
import { HttpError } from './lib/http-error';
import { prisma } from './lib/prisma';

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.WEB_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

app.set('trust proxy', Number(process.env.TRUST_PROXY || 1));
app.disable('x-powered-by');
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Next.js uses inline bootstrap scripts; CSP is handled at the reverse proxy.
    contentSecurityPolicy: false
  })
);
app.use(
  cors({
    origin: (origin, callback) => {
      // Do not throw here: a rejected origin should fall through to the CSRF
      // guard below so it gets a clean 403 instead of a 500 error page.
      return callback(null, !origin || allowedOrigins.includes(origin));
    },
    credentials: true
  })
);
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(originGuard);

const health = (_req: express.Request, res: express.Response) =>
  res.json({
    ok: true,
    service: 'private-duo-api',
    version: process.env.npm_package_version || '1.0.0',
    time: new Date().toISOString()
  });

app.get('/health', health);
app.get('/api/health', health);
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof HttpError ? error.message : 'Unexpected server error';
    if (status >= 500) console.error('API error', error);
    if (!res.headersSent) res.status(status).json({ error: message });
  }
);

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  maxHttpBufferSize: 1_000_000,
  transports: ['websocket', 'polling'],
  pingTimeout: 25_000,
  pingInterval: 20_000
});

attachSocketHandlers(io);
app.set('io', io);

const port = Number(process.env.PORT || 4000);
server.requestTimeout = 300_000;
server.headersTimeout = 120_000;

server.listen(port, () => {
  console.log(`Study with Game API listening on ${port}`);
  console.log(`Allowed web origins: ${allowedOrigins.join(', ')}`);
});

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down.`);
  io.close();
  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
