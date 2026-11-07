import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import inboxRoutes from './routes/inbox.routes';
import companionRoutes from './routes/companion.routes';
import rhythmRoutes from './routes/rhythm.routes';
import friendsRoutes from './routes/friends.routes';
import { serveInvitePage } from './controllers/friends.controller';
import { servePrivacyPolicy } from './controllers/privacy.controller';
import { setupPauseSockets } from './sockets/pause.socket';
import { purgeExpiredMessages } from './controllers/inbox.controller';
import prisma from './config/db';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Configure Socket.io with permissive CORS and multi-transport support for Web, Mobile, and Desktop
export const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'Instaloop Mindful Backend',
    version: '1.0.0',
    philosophy: 'Anti-scroll, finite attention sovereignty',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes
app.get('/api/rhythm/live-sync', (req, res) => {
  const realCount = io.engine?.clientsCount || 0;
  res.json({ count: realCount });
});
app.use('/api/auth', authRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/companions', companionRoutes);
app.use('/api/rhythm', rhythmRoutes);
app.use('/api/friends', friendsRoutes);

// Secret Invite Landing Pages (Open in App or Download)
app.get('/privacy', servePrivacyPolicy);
app.get('/terms', servePrivacyPolicy);
app.get('/invite/:handle?', serveInvitePage);
app.get('/invite', serveInvitePage);
app.get('/join', serveInvitePage);

// Direct APK Download Endpoint
app.get('/download/apk', (req, res) => {
  const localApk = path.join(__dirname, '../public/instaloop-release.apk');
  const rootApk = path.join(__dirname, '../../instaloop-release.apk');
  if (fs.existsSync(localApk)) {
    return res.download(localApk, 'instaloop-release.apk');
  }
  if (fs.existsSync(rootApk)) {
    return res.download(rootApk, 'instaloop-release.apk');
  }
  return res.redirect('https://github.com/aksharmndh9-boop/instaloop-backend/releases/download/v1.0.0/instaloop-release.apk');
});

// Setup WebSockets
setupPauseSockets(io);

// Start Server
const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  console.log(`=================================================`);
  console.log(`🌿 Instaloop Mindful Backend is live on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📱 Connect physical phones on Wi-Fi: http://192.168.1.8:${PORT}`);
  console.log(`📡 WebSocket ready for real-time presence & pauses`);
  
  // Test database connection non-blockingly
  try {
    await prisma.$connect();
    console.log(`🗄️  Prisma Database connected successfully!`);
  } catch (err: any) {
    console.log(`⚠️  Database offline or pending: using resilient mindful in-memory state`);
  }

  // Auto-delete / expire inbox messages older than 30 days (while keeping streaks intact)
  await purgeExpiredMessages();
  setInterval(() => {
    purgeExpiredMessages();
  }, 24 * 60 * 60 * 1000);
  
  console.log(`=================================================`);
});
