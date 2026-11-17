import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createStreamProxyRouter, toProxyUrl } from './streamProxy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readFirebaseProjectId(): string {
  const candidates = [
    path.join(__dirname, 'firebase-applet-config.json'),
    path.join(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const cfgPath of candidates) {
    try {
      if (fs.existsSync(cfgPath)) {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (cfg?.projectId) return String(cfg.projectId);
      }
    } catch {
      // try next path
    }
  }
  return String(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '');
}

export const firebaseProjectId = readFirebaseProjectId();

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export async function verifyFirebaseIdToken(
  token: string
): Promise<{ uid: string; email?: string; name?: string } | null> {
  if (!token || !firebaseProjectId) return null;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${firebaseProjectId}`,
      audience: firebaseProjectId,
    });
    const uid = typeof payload.sub === 'string' ? payload.sub : '';
    if (!uid) return null;
    return {
      uid,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  } catch {
    return null;
  }
}

export function escHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function resolveRouteSeo(reqPath: string): { title: string; description: string; robots?: string } {
  const clean = reqPath.split('?')[0] || '/';
  const map: Record<string, { title: string; description: string; robots?: string }> = {
    '/': {
      title: 'AMStream — Watch Anime, Movies, Series & Watch Rooms',
      description:
        'Stream anime, movies, and TV series ad-free with synced 4-viewer Watch Rooms, instant skip controls, and Firebase cloud watchlist sync.',
    },
    '/anime': {
      title: 'Watch Anime Online Ad-Free — AMStream',
      description:
        'Stream trending and classic anime in SUB & DUB with instant intro/outro skip, multiple servers, and synced Watch Rooms.',
    },
    '/movies': {
      title: 'Watch HD Movies Ad-Free — AMStream',
      description:
        'Explore new releases, action blockbusters, sci-fi classics, and top-rated movies with multi-server playback and Watch Rooms.',
    },
    '/series': {
      title: 'Watch TV Series Online — AMStream',
      description:
        'Binge popular TV shows, dramas, crime thrillers, and fantasy series with episode memory and synchronized Watch Rooms.',
    },
    '/category': {
      title: 'Browse Genres & Categories — AMStream',
      description:
        'Explore every Anime, Movie, and TV Series genre directory on AMStream to discover trending and classic favorites.',
    },
    '/coming': {
      title: 'Coming Soon & Upcoming Anime — AMStream',
      description:
        'Preview upcoming anime premieres, new seasons, and release schedules ahead of broadcast on AMStream.',
    },
    '/list': {
      title: 'My List — AMStream',
      description: 'Manage your saved anime, movies, and TV series synced across devices with AMStream.',
    },
    '/continue': {
      title: 'Continue Watching — AMStream',
      description: 'Pick up right where you paused with synced episode and timestamp memory across devices on AMStream.',
    },
    '/account': {
      title: 'Account & Cloud Sync — AMStream',
      description: 'Manage your AMStream profile, Firebase cloud watchlist sync, and default playback preferences.',
      robots: 'noindex, nofollow',
    },
  };
  if (map[clean]) return map[clean];
  if (clean.startsWith('/genre/')) {
    const g = decodeURIComponent(clean.slice(7)) || 'Anime';
    return {
      title: `${g} Anime — AMStream`,
      description: `Browse top-rated and trending ${g} anime series and films with ad-free playback on AMStream.`,
    };
  }
  if (clean.startsWith('/room/')) {
    return {
      title: `Watch Room ${clean.slice(6).toUpperCase()} — AMStream`,
      description: 'Synchronized multi-viewer cinema theater with live chat on AMStream.',
      robots: 'noindex, nofollow',
    };
  }
  return map['/'];
}

export function getRequestOrigin(req: express.Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${host}`;
}

export function createBackendApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      service: 'AMStream',
      proxy: true,
      projectId: firebaseProjectId || null,
      timestamp: Date.now(),
    });
  });

  app.use('/_p', createStreamProxyRouter());

  app.get('/api/stream-proxy', (req, res) => {
    const raw = String(req.query.url || '').trim();
    if (!/^https?:\/\//i.test(raw)) return res.status(400).send('Invalid url');
    try {
      return res.redirect(302, toProxyUrl(raw));
    } catch {
      return res.status(400).send('Invalid url');
    }
  });

  app.use(express.json({ limit: '100kb' }));

  const tmdbCache = new Map<string, { tmdb: string; imdb: string; expiresAt: number }>();
  const joinAttempts = new Map<string, number[]>();
  const messageTimestamps = new Map<string, number[]>();

  function pruneWindow(timestamps: number[], windowMs: number, now: number): number[] {
    return timestamps.filter((t) => now - t < windowMs);
  }

  async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  app.get('/api/movies', async (req, res) => {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    try {
      const response = await fetchWithTimeout(`https://vid-src.top/movie/${page}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'AMStream/2.0' },
      });
      if (!response.ok) throw new Error(`Upstream ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data.result)) {
        data.result = data.result.map((m: Record<string, unknown>) => {
          const imdb = String(m.imdb_id || '');
          const tmdb = String(m.tmdb_id || '');
          return {
            ...m,
            imdb_id: imdb,
            tmdb_id: tmdb,
            poster: imdb ? `https://images.metahub.space/poster/medium/${imdb}/img` : '',
            backdrop: imdb ? `https://images.metahub.space/background/medium/${imdb}/img` : '',
            embed_url: String(m.embed_url || '').replace(/^http:\/\//, 'https://'),
            embed_url_tmdb: String(m.embed_url_tmdb || '').replace(/^http:\/\//, 'https://'),
          };
        });
      }
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Movies unavailable', result: [], pages: 0 });
    }
  });

  app.get('/api/tv', async (req, res) => {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    try {
      const response = await fetchWithTimeout(`https://vid-src.top/tv/${page}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'AMStream/2.0' },
      });
      if (!response.ok) throw new Error(`Upstream ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data.result)) {
        data.result = data.result.map((m: Record<string, unknown>) => {
          const imdb = String(m.imdb_id || '');
          return {
            ...m,
            poster: imdb ? `https://images.metahub.space/poster/medium/${imdb}/img` : '',
            backdrop: imdb ? `https://images.metahub.space/background/medium/${imdb}/img` : '',
            embed_url: String(m.embed_url || '').replace(/^http:\/\//, 'https://'),
            embed_url_tmdb: String(m.embed_url_tmdb || '').replace(/^http:\/\//, 'https://'),
          };
        });
      }
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'TV unavailable', result: [], pages: 0 });
    }
  });

  app.get('/api/series', async (req, res) => {
    const id = String(req.query.id || '');
    if (!id) return res.status(400).json({ error: 'Missing id' });
    try {
      const response = await fetchWithTimeout(`https://anikotoapi.site/series/${encodeURIComponent(id)}`);
      const data = await response.json();
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Series error' });
    }
  });

  app.get('/api/recent', async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    try {
      const response = await fetchWithTimeout(`https://anikotoapi.site/recent-anime?page=${page}&per_page=30`);
      const data = await response.json();
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Recent error' });
    }
  });

  app.get('/api/resolve-tmdb', async (req, res) => {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    const kind = req.query.kind === 'series' ? 'series' : 'movie';
    let imdb = String(req.query.imdb || '').trim();
    const title = String(req.query.title || '').trim();
    const year = String(req.query.year || '').trim().slice(0, 4);

    if (!imdb && !title) return res.status(400).json({ error: 'imdb or title required' });

    const cacheKey = `${kind}:${imdb}:${title.toLowerCase()}:${year}`;
    const cached = tmdbCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ tmdb: cached.tmdb, imdb: cached.imdb });
    }

    let tmdb = '';

    try {
      if (!imdb && title) {
        const searchUrl = `https://v3-cinemeta.strem.io/catalog/${kind}/top/search=${encodeURIComponent(title)}.json`;
        const sr = await fetchWithTimeout(searchUrl, {}, 5000).catch(() => null);
        if (sr?.ok) {
          const sj = await sr.json();
          const metas = Array.isArray(sj.metas) ? sj.metas : [];
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const target = norm(title);
          const match =
            metas.find(
              (m: any) => norm(String(m.name || '')) === target && (!year || String(m.year || '').startsWith(year))
            ) ||
            metas.find((m: any) => norm(String(m.name || '')) === target) ||
            metas[0];
          if (match) {
            imdb = String(match.imdb_id || (String(match.id || '').startsWith('tt') ? match.id : ''));
            if (match.moviedb_id) tmdb = String(match.moviedb_id);
          }
        }
      }

      if (!tmdb && /^tt\d+$/.test(imdb)) {
        const mr = await fetchWithTimeout(
          `https://v3-cinemeta.strem.io/meta/${kind}/${encodeURIComponent(imdb)}.json`,
          {},
          5000
        ).catch(() => null);
        if (mr?.ok) {
          const mj = await mr.json();
          if (mj?.meta?.moviedb_id) tmdb = String(mj.meta.moviedb_id);
        }
      }

      if (!tmdb && /^tt\d+$/.test(imdb)) {
        const prop = kind === 'series' ? 'wdt:P4983' : 'wdt:P4947';
        const sparql = `SELECT ?tmdb WHERE { ?item wdt:P345 "${imdb}" ; ${prop} ?tmdb . } LIMIT 1`;
        const wr = await fetchWithTimeout(
          `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
          { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'AMStream/2.0' } },
          6000
        ).catch(() => null);
        if (wr?.ok) {
          const wj = await wr.json();
          const val = wj?.results?.bindings?.[0]?.tmdb?.value;
          if (val && /^\d+$/.test(String(val))) tmdb = String(val);
        }
      }

      if (!tmdb && title) {
        const prop = kind === 'series' ? 'wdt:P4983' : 'wdt:P4947';
        const typeQ = kind === 'series' ? 'wd:Q5398426' : 'wd:Q11424';
        const cleanTitle = title.replace(/["\\]/g, ' ').trim();
        const sparql = `SELECT ?tmdb ?imdb WHERE {
          ?item wdt:P31/wdt:P279* ${typeQ} ; ${prop} ?tmdb ; rdfs:label "${cleanTitle}"@en .
          OPTIONAL { ?item wdt:P345 ?imdb }
        } LIMIT 1`;
        const wr = await fetchWithTimeout(
          `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
          { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'AMStream/2.0' } },
          6000
        ).catch(() => null);
        if (wr?.ok) {
          const wj = await wr.json();
          const row = wj?.results?.bindings?.[0];
          if (row?.tmdb?.value && /^\d+$/.test(String(row.tmdb.value))) tmdb = String(row.tmdb.value);
          if (!imdb && row?.imdb?.value && /^tt\d+$/.test(String(row.imdb.value))) imdb = String(row.imdb.value);
        }
      }

      if (tmdb || imdb) {
        tmdbCache.set(cacheKey, { tmdb, imdb, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      }
      res.json({ tmdb, imdb });
    } catch {
      res.json({ tmdb, imdb });
    }
  });

  app.get('/api/poster', async (req, res) => {
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    const tmdb = String(req.query.tmdb || '').replace(/[^\d]/g, '');
    const imdb = String(req.query.imdb || '').replace(/[^a-z0-9]/gi, '');
    if (!tmdb && !imdb) return res.status(400).json({ error: 'tmdb or imdb required' });
    try {
      if (imdb) {
        return res.redirect(302, `https://images.metahub.space/poster/medium/${imdb}/img`);
      }
      const pageUrl = `https://www.themoviedb.org/movie/${tmdb}`;
      const html = await fetchWithTimeout(
        pageUrl,
        {
          redirect: 'follow',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
        },
        7000
      ).then((r) => r.text());
      const m = html.match(/property="og:image" content="([^"]+)"/) || html.match(/name="twitter:image" content="([^"]+)"/);
      if (!m || !m[1] || !m[1].startsWith('http')) return res.status(404).end();
      const img = await fetchWithTimeout(m[1], { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*,*/*' } }, 7000);
      if (!img.ok) return res.status(404).end();
      res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
      res.status(200).send(Buffer.from(await img.arrayBuffer()));
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Poster error' });
    }
  });

  app.get('/api/cover', async (_req, res) => {
    try {
      const [animeRes, movieRes] = await Promise.all([
        fetchWithTimeout('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            query: 'query{Page(page:1,perPage:8){media(type:ANIME,sort:TRENDING_DESC,isAdult:false){coverImage{extraLarge large}}}}',
          }),
        })
          .then((r) => r.json())
          .then((j) =>
            (j?.data?.Page?.media || []).map((m: any) => m.coverImage?.extraLarge || m.coverImage?.large).filter(Boolean)
          )
          .catch(() => []),
        fetchWithTimeout('https://v3-cinemeta.strem.io/catalog/movie/top.json')
          .then((r) => r.json())
          .then((j) =>
            (j?.metas || [])
              .slice(0, 8)
              .map((m: any) => m.poster || (m.imdb_id ? `https://images.metahub.space/poster/large/${m.imdb_id}/img` : ''))
              .filter(Boolean)
          )
          .catch(() => []),
      ]);
      const pool = [...animeRes, ...movieRes].map((u) => String(u).replace(/^http:\/\//i, 'https://'));
      if (!pool.length) return res.status(404).end();
      const start = Math.floor(Math.random() * pool.length);
      for (let i = 0; i < pool.length; i++) {
        const img = await fetchWithTimeout(pool[(start + i) % pool.length], {}, 5000).catch(() => null);
        if (!img || !img.ok) continue;
        res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
        return res.status(200).send(Buffer.from(await img.arrayBuffer()));
      }
      res.status(404).end();
    } catch {
      res.status(404).end();
    }
  });

  app.get('/api/share', async (req, res) => {
    const t = String(req.query.t || '');
    const id = String(req.query.id || '');
    const origin = getRequestOrigin(req);
    const valid = ['anime', 'movie', 'tv'].includes(t) && /^[\w.-]+$/.test(id);
    const target = valid ? `${origin}/t/${encodeURIComponent(t)}/${encodeURIComponent(id)}` : origin;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
      `<!doctype html><html><head><meta charset="utf-8"><title>AMStream</title><meta http-equiv="refresh" content="0;url=${esc(
        target
      )}"><script>location.replace(${JSON.stringify(target)});</script></head><body><a href="${esc(target)}">Open in AMStream</a></body></html>`
    );
  });

  app.post('/api/rooms/join-gate', async (req, res) => {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const user = await verifyFirebaseIdToken(token);
    if (!user) return res.status(401).json({ error: 'Please sign in to join a Watch Room.' });

    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
      .split(',')[0]
      .trim();
    const key = `join:${user.uid}:${ip}`;
    const now = Date.now();
    const recent = pruneWindow(joinAttempts.get(key) || [], 10 * 60 * 1000, now);
    if (recent.length >= 20) {
      return res.status(429).json({ error: 'Too many room-code attempts. Wait a few minutes and try again.' });
    }
    recent.push(now);
    joinAttempts.set(key, recent);
    return res.json({ ok: true });
  });

  app.post('/api/rooms/message-gate', async (req, res) => {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const user = await verifyFirebaseIdToken(token);
    if (!user) return res.status(401).json({ error: 'Please sign in to send messages.' });

    const roomId = String(req.body?.roomId || '');
    const body = String(req.body?.body || '').trim();
    if (!roomId || !body) return res.status(400).json({ error: 'Write a message first.' });
    if (body.length > 500) return res.status(400).json({ error: 'Messages must be 500 characters or fewer.' });

    const key = `msg:${roomId}:${user.uid}`;
    const now = Date.now();
    const recent = pruneWindow(messageTimestamps.get(key) || [], 10 * 1000, now);
    if (recent.length >= 8) {
      return res.status(429).json({ error: 'Slow down a little before sending another message.' });
    }
    recent.push(now);
    messageTimestamps.set(key, recent);
    return res.json({ ok: true });
  });

  app.get('/robots.txt', (req, res) => {
    const origin = getRequestOrigin(req);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /_p/',
        'Disallow: /ws/',
        'Disallow: /account',
        'Disallow: /room/',
        '',
        `Sitemap: ${origin}/sitemap.xml`,
      ].join('\n')
    );
  });

  app.get('/sitemap.xml', (req, res) => {
    const origin = getRequestOrigin(req);
    const routes = [
      { path: '/', changefreq: 'daily', priority: '1.0' },
      { path: '/anime', changefreq: 'daily', priority: '0.9' },
      { path: '/movies', changefreq: 'daily', priority: '0.9' },
      { path: '/series', changefreq: 'daily', priority: '0.9' },
      { path: '/category', changefreq: 'weekly', priority: '0.8' },
      { path: '/coming', changefreq: 'daily', priority: '0.8' },
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes
      .map(
        (r) =>
          `  <url>\n    <loc>${escHtmlAttr(origin + r.path)}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`
      )
      .join('\n')}\n</urlset>\n`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.send(xml);
  });

  return app;
}
