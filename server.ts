import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  createBackendApp,
  escHtmlAttr,
  getRequestOrigin,
  resolveRouteSeo,
  verifyFirebaseIdToken,
} from './serverApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = createBackendApp();

// ============================================================================
// REAL-TIME WATCH ROOM WEBSOCKET RELAY (PRESENCE + SIGNED PLAYBACK + EVENTS)
// ============================================================================

interface RoomClient {
  ws: WebSocket;
  uid: string;
  connectionId: string;
  roomId: string;
  channelToken: string;
  role: 'host' | 'guest';
  displayName: string;
  lastHeartbeatAt: number;
}

const roomClients = new Map<string, Set<RoomClient>>();
const roomLastHostSeq = new Map<string, number>();

function getPresenceSnapshot(roomId: string) {
  const set = roomClients.get(roomId);
  const byUid: Record<string, { online: boolean; connections: number; lastSeen: number }> = {};
  if (set) {
    for (const c of set) {
      if (!byUid[c.uid]) {
        byUid[c.uid] = { online: true, connections: 1, lastSeen: c.lastHeartbeatAt };
      } else {
        byUid[c.uid].connections += 1;
        byUid[c.uid].lastSeen = Math.max(byUid[c.uid].lastSeen, c.lastHeartbeatAt);
      }
    }
  }
  return byUid;
}

function broadcastToRoom(
  roomId: string,
  channelToken: string | null,
  payload: Record<string, unknown>,
  exclude?: RoomClient
) {
  const set = roomClients.get(roomId);
  if (!set) return;
  const serialized = JSON.stringify(payload);
  for (const client of set) {
    if (exclude && client === exclude) continue;
    if (channelToken && client.channelToken !== channelToken) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  }
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/rooms' });

wss.on('connection', (ws) => {
  let activeClient: RoomClient | null = null;

  const detach = () => {
    if (!activeClient) return;
    const { roomId, channelToken } = activeClient;
    const set = roomClients.get(roomId);
    if (set) {
      set.delete(activeClient);
      if (set.size === 0) {
        roomClients.delete(roomId);
        roomLastHostSeq.delete(roomId);
      } else {
        broadcastToRoom(roomId, channelToken, {
          type: 'presence',
          roomId,
          presence: getPresenceSnapshot(roomId),
        });
      }
    }
    activeClient = null;
  };

  ws.on('message', async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'join_channel') {
      const token = String(msg.idToken || '');
      const user = await verifyFirebaseIdToken(token);
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication required.' }));
        ws.close(4001, 'Unauthorized');
        return;
      }
      const roomId = String(msg.roomId || '');
      const channelToken = String(msg.channelToken || '');
      const connectionId = String(msg.connectionId || '');
      const role = msg.role === 'host' ? 'host' : 'guest';
      const displayName = String(msg.displayName || user.name || 'AMStream Member').slice(0, 40);
      if (!roomId || !channelToken || !connectionId) return;

      if (activeClient) detach();

      activeClient = {
        ws,
        uid: user.uid,
        connectionId,
        roomId,
        channelToken,
        role,
        displayName,
        lastHeartbeatAt: Date.now(),
      };
      if (!roomClients.has(roomId)) roomClients.set(roomId, new Set());
      roomClients.get(roomId)!.add(activeClient);

      ws.send(JSON.stringify({ type: 'connected', roomId, channelToken }));
      broadcastToRoom(roomId, null, {
        type: 'presence',
        roomId,
        presence: getPresenceSnapshot(roomId),
      });
      return;
    }

    if (!activeClient) return;

    if (msg.type === 'heartbeat') {
      activeClient.lastHeartbeatAt = Date.now();
      activeClient.role = msg.role === 'host' ? 'host' : 'guest';
      if (msg.channelToken && typeof msg.channelToken === 'string') {
        activeClient.channelToken = msg.channelToken;
      }
      broadcastToRoom(activeClient.roomId, activeClient.channelToken, {
        type: 'presence',
        roomId: activeClient.roomId,
        presence: getPresenceSnapshot(activeClient.roomId),
      });
      return;
    }

    if (msg.type === 'host_event') {
      if (activeClient.role !== 'host') {
        ws.send(JSON.stringify({ type: 'error', message: 'Only the host can publish playback state.' }));
        return;
      }
      const payload = msg.payload;
      if (!payload || typeof payload !== 'object') return;
      if (payload.host_uid !== activeClient.uid) return;
      const seq = Number(payload.playback_seq) || 0;
      const prevSeq = roomLastHostSeq.get(activeClient.roomId) || 0;
      if (seq < prevSeq) return;
      roomLastHostSeq.set(activeClient.roomId, seq);

      broadcastToRoom(
        activeClient.roomId,
        activeClient.channelToken,
        { type: 'host_event', roomId: activeClient.roomId, payload },
        activeClient
      );
      return;
    }

    if (msg.type === 'room_signal') {
      broadcastToRoom(
        activeClient.roomId,
        null,
        {
          type: 'room_signal',
          roomId: activeClient.roomId,
          kind: String(msg.kind || ''),
          newHostUid: msg.newHostUid || null,
          newChannelToken: msg.newChannelToken || null,
        },
        activeClient
      );
    }
  });

  ws.on('close', detach);
  ws.on('error', detach);
});

async function startServer() {
  const distDir = path.join(__dirname, 'dist');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    (process.env.NODE_ENV !== 'development' && fs.existsSync(path.join(distDir, 'index.html')));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const indexPath = path.join(distDir, 'index.html');
    const rawHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/ws/') || req.path.startsWith('/_p/')) return next();
      if (!rawHtml) return res.status(503).send('Production bundle not built. Run npm run build first.');
      const seo = resolveRouteSeo(req.path);
      const origin = getRequestOrigin(req);
      const canonical = `${origin}${req.path || '/'}`;
      const html = rawHtml
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escHtmlAttr(seo.title)}</title>`)
        .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escHtmlAttr(canonical)}" />`)
        .replace(
          /<meta name="robots" content="[^"]*"\s*\/?>/i,
          `<meta name="robots" content="${escHtmlAttr(seo.robots || 'index, follow')}" />`
        )
        .replace(
          /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
          `<meta name="description" content="${escHtmlAttr(seo.description)}" />`
        )
        .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escHtmlAttr(seo.title)}" />`)
        .replace(
          /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
          `<meta property="og:description" content="${escHtmlAttr(seo.description)}" />`
        )
        .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escHtmlAttr(seo.title)}" />`)
        .replace(
          /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
          `<meta name="twitter:description" content="${escHtmlAttr(seo.description)}" />`
        );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AMStream server listening on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer();
