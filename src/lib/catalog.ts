import type { MediaItem, TvEpisode } from '../types/media';

export const ANILIST = 'https://graphql.anilist.co';
export const TVMAZE = 'https://api.tvmaze.com';
export const CINEMETA = 'https://v3-cinemeta.strem.io';
export const ANIPUB_BASE = 'https://anipub.org';
export const MEGA_BASE = 'https://megaplay.buzz';
export const ANIPUB_PARTNER_TOKEN = 'anichi.to';

export const ANIME_CATEGORIES = [
  'Trending',
  'Popular',
  'Comedy',
  'Romance',
  'Action',
  'Fantasy',
  'Adventure',
  'Drama',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Mystery',
  'Horror',
  'Psychological',
  'Sports',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Thriller',
  'Ecchi',
  'Hentai',
];

export const MOVIE_CATEGORIES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western',
  'Adult',
];

export const SERIES_CATEGORIES = [
  'Action',
  'Adventure',
  'Animation',
  'Children',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Music',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'War',
  'Western',
  'Adult',
];

export const CAT_LABEL: Record<string, string> = {
  Adult: '18 Plus',
  Hentai: '18 Plus',
};

export const MOVIE_SERVERS = [
  { name: 'Server 1', url: (tmdb: number | string) => (tmdb ? `https://vidspark.to/movie/${tmdb}` : '') },
  {
    name: 'Server 2',
    url: (tmdb: number | string) => (tmdb ? `https://flixer.gd/watch/movie/${tmdb}?embed=1&autoplay=true` : ''),
  },
];

export const TV_SERVERS = [
  {
    name: 'Server 1',
    url: (tmdb: number | string, s: number, e: number) => (tmdb ? `https://vidspark.to/tv/${tmdb}/${s}/${e}` : ''),
  },
  {
    name: 'Server 2',
    url: (tmdb: number | string, s: number, e: number) =>
      tmdb ? `https://flixer.gd/watch/tv/${tmdb}/${s}/${e}?embed=1&autoplay=true` : '',
  },
];

export const ANIME_SERVERS = [{ name: 'Server 1' }, { name: 'Server 2' }, { name: 'Server 3' }];

export function wrapMovieTvShieldUrl(providerUrl: string, resumeSeconds = 0): string {
  if (!providerUrl) return '';
  if (providerUrl.startsWith('/megaplay.html?')) return providerUrl;
  let url = `/megaplay.html?src=${encodeURIComponent(providerUrl.replace(/^http:\/\//i, 'https://'))}&sv=5&rb=4`;
  if (resumeSeconds > 5) url += `&t=${Math.floor(resumeSeconds)}`;
  return url;
}

export function megaShimSrc(streamUrl: string, resumeSeconds = 0): string {
  if (!streamUrl) return '';
  let url = `/megaplay.html?src=${encodeURIComponent(streamUrl.replace(/^http:\/\//i, 'https://'))}&partner=${ANIPUB_PARTNER_TOKEN}&rb=4`;
  if (resumeSeconds > 5) url += `&t=${Math.floor(resumeSeconds)}`;
  return url;
}

// ---- AniList Queries ----
export const Q_ANIME_TREND = `query($page:Int){Page(page:$page,perPage:24){pageInfo{hasNextPage} media(type:ANIME,sort:TRENDING_DESC,isAdult:false){id idMal title{romaji english} coverImage{large extraLarge} bannerImage averageScore genres episodes seasonYear trailer{id site} description(asHtml:false)}}}`;
export const Q_ANIME_UPCOMING = `query($page:Int){Page(page:$page,perPage:24){pageInfo{hasNextPage} media(status:NOT_YET_RELEASED,sort:POPULARITY_DESC,isAdult:false){id idMal title{romaji english} coverImage{large extraLarge} bannerImage averageScore genres episodes seasonYear description(asHtml:false) nextAiringEpisode{airingAt timeUntilAiring episode}}}}`;
export const Q_ANIME_RELATED = `query($id:Int!){Media(id:$id){recommendations(perPage:12,sort:RATING_DESC){nodes{mediaRecommendation{id idMal title{romaji english} coverImage{large extraLarge} bannerImage averageScore genres episodes seasonYear status description(asHtml:false) isAdult}}}}}`;
export const Q_ANIME_POP = `query($page:Int){Page(page:$page,perPage:24){pageInfo{hasNextPage} media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){id idMal title{romaji english} coverImage{large extraLarge} bannerImage averageScore genres episodes seasonYear trailer{id site}}}}`;
export const Q_ANIME_GENRE = `query($page:Int,$genre:String){Page(page:$page,perPage:24){pageInfo{hasNextPage} media(type:ANIME,genre:$genre,sort:POPULARITY_DESC,isAdult:false){id idMal title{romaji english} coverImage{large extraLarge} bannerImage averageScore genres episodes seasonYear trailer{id site}}}}`;
export const Q_ANIME_GENRE_ADULT = `query($page:Int,$genre:String){Page(page:$page,perPage:24){pageInfo{hasNextPage} media(type:ANIME,genre:$genre,sort:POPULARITY_DESC,isAdult:true){id idMal title{romaji english} coverImage{large extraLarge} bannerImage averageScore genres episodes seasonYear trailer{id site}}}}`;
export const Q_ANIME_SEARCH = `query($q:String){Page(page:1,perPage:30){media(type:ANIME,search:$q,sort:SEARCH_MATCH){id idMal title{romaji english native} synonyms coverImage{large extraLarge} bannerImage averageScore genres episodes seasonYear status trailer{id site} description(asHtml:false)}}}`;
export const Q_ANIME_REL = `query($id:Int){Media(id:$id,type:ANIME){id idMal title{romaji english native} status episodes seasonYear format synonyms relations{edges{relationType node{id idMal type format status title{romaji english native} synonyms episodes seasonYear}}}}}`;
export const Q_ANIME_INFO = `query($id:Int){Media(id:$id,type:ANIME){id idMal title{romaji english native} synonyms status episodes averageScore genres seasonYear description(asHtml:false) coverImage{large extraLarge} bannerImage trailer{id site} nextAiringEpisode{timeUntilAiring episode}}}`;

export function stripHtml(s?: string): string {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim();
}

export function titleOf(m: any): string {
  return m?.title?.english || m?.title?.romaji || m?.title || m?.name || 'Untitled';
}

// ---- Catalog Cache (15 min SWR) ----
const CATALOG_CACHE_TTL = 15 * 60 * 1000;
const catalogInFlight = new Map<string, Promise<any>>();

function readCatalogCache<T>(key: string): { savedAt: number; value: T } | null {
  try {
    const raw = localStorage.getItem('animestream.catalog.v1:' + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCatalogCache(key: string, value: unknown): void {
  try {
    localStorage.setItem('animestream.catalog.v1:' + key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // ignore storage quota
  }
}

export async function cachedCatalog<T>(key: string, loader: () => Promise<T>, ttl = CATALOG_CACHE_TTL): Promise<T> {
  const cached = readCatalogCache<T>(key);
  if (cached && cached.value && (Array.isArray(cached.value) || typeof cached.value === 'object')) {
    if (Date.now() - cached.savedAt < ttl) return cached.value;
    if (!catalogInFlight.has(key)) {
      const refresh = Promise.resolve()
        .then(loader)
        .then((value) => {
          writeCatalogCache(key, value);
          return value;
        })
        .catch(() => cached.value)
        .finally(() => catalogInFlight.delete(key));
      catalogInFlight.set(key, refresh);
    }
    return cached.value;
  }
  const existing = catalogInFlight.get(key);
  if (existing) return existing;
  const req = Promise.resolve()
    .then(loader)
    .then((value) => {
      writeCatalogCache(key, value);
      return value;
    })
    .finally(() => catalogInFlight.delete(key));
  catalogInFlight.set(key, req);
  return req;
}

// ---- Rate-limited AniList GraphQL client ----
const ANI_MAX_PARALLEL = 5;
let aniActive = 0;
const aniQueue: (() => void)[] = [];

function aniAcquire(): Promise<void> {
  if (aniActive < ANI_MAX_PARALLEL) {
    aniActive++;
    return Promise.resolve();
  }
  return new Promise((res) => aniQueue.push(res));
}

function aniRelease(): void {
  aniActive--;
  const next = aniQueue.shift();
  if (next) {
    aniActive++;
    next();
  }
}

async function postAnilist(query: string, variables: Record<string, unknown>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 700 * attempt + Math.random() * 400));
    const res = await fetch(ANILIST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after'));
      await new Promise((r) =>
        setTimeout(r, Number.isFinite(wait) && wait > 0 ? Math.min(wait * 1000, 15000) : 2000 + attempt * 1500)
      );
      continue;
    }
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const json = await res.json();
    if (json.errors?.length && !json.data) throw new Error(json.errors[0].message);
    return json.data;
  }
  throw new Error('AniList rate limit reached. Please retry in a moment.');
}

export async function anilist(query: string, variables: Record<string, unknown> = {}) {
  const key = 'anilist:' + query + ':' + JSON.stringify(variables);
  return cachedCatalog(key, async () => {
    await aniAcquire();
    try {
      return await postAnilist(query, variables);
    } finally {
      aniRelease();
    }
  });
}

// ---- Mappers ----
export function mapAnime(m: any): MediaItem {
  return {
    ...m,
    _type: 'anime',
    id: m.id,
    ani_id: m.id,
    mal_id: m.idMal || 0,
    _title: titleOf(m),
    romaji: m.title?.romaji || '',
    nativeTitle: m.title?.native || '',
    _poster: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || m.poster || '',
    _backdrop: m.bannerImage || m.coverImage?.extraLarge || m.coverImage?.large || '',
    _sub: [
      m.seasonYear,
      m.averageScore ? `★ ${(m.averageScore / 10).toFixed(1)}` : '',
      (m.genres || []).slice(0, 2).join(', '),
    ]
      .filter(Boolean)
      .join(' · '),
    _year: Number(m.seasonYear) || 0,
    _genres: Array.isArray(m.genres) ? m.genres : [],
    _src: 'AniList',
  };
}

export function mapCinemetaMovie(m: any): MediaItem {
  const imdb = m.imdb_id || (String(m.id || '').startsWith('tt') ? m.id : '');
  const year = m.year || String(m.released || '').slice(0, 4);
  return {
    _type: 'movie',
    id: imdb || m.moviedb_id || m.id,
    imdb,
    tmdb: m.moviedb_id || '',
    _title: m.name || m.title || 'Movie',
    _poster: imdb ? `https://images.metahub.space/poster/medium/${imdb}/img` : m.poster || '',
    _posterFallback: m.poster || '',
    _backdrop: imdb ? `https://images.metahub.space/background/medium/${imdb}/img` : m.background || '',
    _sub: [year, m.imdbRating ? `★ ${m.imdbRating}` : '', (m.genre || []).slice(0, 2).join(', ')]
      .filter(Boolean)
      .join(' · '),
    _year: Number(year) || 0,
    _genres: Array.isArray(m.genre) ? m.genre : [],
    genres: Array.isArray(m.genre) ? m.genre : [],
    _src: 'Cinemeta',
    summary: m.description || '',
    description: m.description || '',
  };
}

export function mapTvmaze(s: any): MediaItem {
  const imdb = s.externals?.imdb || '';
  return {
    _type: 'tv',
    id: s.id,
    imdb,
    tvmaze: s.id,
    _title: s.name || 'Series',
    _poster: s.image?.original || s.image?.medium || '',
    _posterFallback: s.image?.medium && s.image?.medium !== s.image?.original ? s.image.medium : '',
    _backdrop: imdb ? `https://images.metahub.space/background/medium/${imdb}/img` : s.image?.original || '',
    _sub: [
      (s.premiered || '').slice(0, 4),
      s.rating?.average ? `★ ${s.rating.average}` : '',
      (s.genres || []).slice(0, 2).join(', '),
    ]
      .filter(Boolean)
      .join(' · '),
    _year: Number((s.premiered || '').slice(0, 4)) || 0,
    _src: 'TVmaze',
    summary: stripHtml(s.summary),
    description: stripHtml(s.summary),
    premiered: s.premiered,
    genres: Array.isArray(s.genres) ? s.genres : [],
    _genres: Array.isArray(s.genres) ? s.genres : [],
  };
}

// (Manga/Comic mappers removed)

export function posterCandidates(item: Partial<MediaItem> | null | undefined): string[] {
  if (!item) return [];
  const type = item._type || 'anime';
  const urls = [
    item._poster,
    item._posterFallback,
    item.bannerImage,
    item.cover,
    item.imdb && String(item.imdb).startsWith('tt')
      ? `https://images.metahub.space/poster/medium/${item.imdb}/img`
      : '',
    type === 'movie' && item.tmdb ? `/api/poster?tmdb=${encodeURIComponent(String(item.tmdb))}` : '',
  ];
  return [...new Set(urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0))];
}

// ---- Feed Loaders ----
export async function fetchMoviesApi(page = 1): Promise<MediaItem[] & { _pages?: number }> {
  const res = await fetch(`/api/movies?page=${page}`);
  if (!res.ok) throw new Error(`Movies API ${res.status}`);
  const data = await res.json();
  const items = (data.result || []).map((m: any) => {
    const imdb = m.imdb_id || '';
    const tmdb = m.tmdb_id || '';
    return {
      _type: 'movie' as const,
      id: imdb || tmdb,
      imdb,
      tmdb,
      _title: String(m.title || 'Movie').replace(/\s+\d{4}$/, ''),
      _poster: m.poster || (imdb ? `https://images.metahub.space/poster/medium/${imdb}/img` : ''),
      _backdrop: m.backdrop || (imdb ? `https://images.metahub.space/background/medium/${imdb}/img` : ''),
      _sub: [m.year || String(m.released || '').slice(0, 4), m.quality || 'Movie'].filter(Boolean).join(' · '),
      _year: Number(m.year || String(m.released || '').slice(0, 4)) || 0,
      _genres: Array.isArray(m.genre) ? m.genre : [],
      _src: 'VidSrc',
    };
  }) as MediaItem[] & { _pages?: number };
  items._pages = Number(data.pages) || 0;
  return items;
}

export async function fetchCinemetaCatalogFeed(kind: 'movie' | 'series', extra = ''): Promise<MediaItem[]> {
  const path = extra ? `${CINEMETA}/catalog/${kind}/top/${extra}.json` : `${CINEMETA}/catalog/${kind}/top.json`;
  return cachedCatalog(`cinemeta:${path}`, async () => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Catalog ${res.status}`);
    const data = await res.json();
    return (data.metas || [])
      .map((m: any) => {
        const it = mapCinemetaMovie(m);
        if (kind === 'series') {
          it._type = 'tv';
          it.id = it.imdb || it.id;
        }
        return it;
      })
      .filter((m: MediaItem) => Boolean(m.imdb || m.tmdb));
  });
}

let newMoviesFallbackPromise: Promise<MediaItem[]> | null = null;
export async function fetchNewMovies(page = 1): Promise<MediaItem[] & { _pages?: number }> {
  try {
    const primary = await fetchMoviesApi(page);
    if (primary.length) return primary;
  } catch {
    // fall through to Cinemeta fallback
  }
  if (!newMoviesFallbackPromise) {
    newMoviesFallbackPromise = Promise.all(
      [
        fetchCinemetaCatalogFeed('movie'),
        fetchCinemetaCatalogFeed('movie', 'genre=Action'),
        fetchCinemetaCatalogFeed('movie', 'genre=Comedy'),
        fetchCinemetaCatalogFeed('movie', 'genre=Animation'),
        fetchCinemetaCatalogFeed('movie', 'genre=Adventure'),
        fetchCinemetaCatalogFeed('movie', 'genre=Drama'),
        fetchCinemetaCatalogFeed('movie', 'genre=Sci-Fi'),
      ].map((p) => p.catch(() => [] as MediaItem[]))
    )
      .then((groups) => {
        const unique = new Map<string, MediaItem>();
        groups.flat().forEach((m) => {
          if (m?.imdb && !unique.has(m.imdb)) unique.set(m.imdb, m);
        });
        return [...unique.values()].sort(
          (a, b) => (b._year || 0) - (a._year || 0) || a._title.localeCompare(b._title)
        );
      })
      .catch(() => []);
  }
  const all = await newMoviesFallbackPromise;
  const out = all.slice((page - 1) * 24, page * 24) as MediaItem[] & { _pages?: number };
  out._pages = Math.max(1, Math.ceil(all.length / 24));
  return out;
}

export async function fetchTvmazePopular(): Promise<MediaItem[]> {
  return cachedCatalog('tvmaze:popular-shows', async () => {
    const pages = await Promise.all(
      [0, 1, 2].map((p) =>
        fetch(`${TVMAZE}/shows?page=${p}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    );
    const all = pages.flat();
    all.sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));
    return all.filter((s) => s.externals?.imdb).slice(0, 60).map(mapTvmaze);
  });
}

function tvmazePoolPages(): number[] {
  const bucket = Math.floor(Date.now() / (6 * 3600 * 1000));
  const base = (bucket % 5) * 9;
  return [base, base + 44, base + 96];
}

async function fetchTvmazeGenre(genre: string): Promise<MediaItem[]> {
  const mark = tvmazePoolPages().join('-');
  const want = genre.replace(/[\s-]+/g, '').toLowerCase();
  return cachedCatalog(`tvmazegen:${want}:${mark}`, async () => {
    const lists = await Promise.all(
      tvmazePoolPages().map((p) =>
        fetch(`${TVMAZE}/shows?page=${p}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => [])
      )
    );
    return lists
      .flat()
      .filter((s) => (s.genres || []).some((g: string) => g.replace(/[\s-]+/g, '').toLowerCase() === want))
      .slice(0, 42)
      .map(mapTvmaze);
  }).catch(() => []);
}

const WIKI_ITEM: Record<string, string> = { movie: 'Q11424', series: 'Q5398426' };
const WIKI_GENRE_QID: Record<string, string> = {
  action: 'Q188473',
  adventure: 'Q319221',
  animation: 'Q202866',
  comedy: 'Q157443',
  crime: 'Q959790',
  documentary: 'Q93204',
  drama: 'Q130232',
  fantasy: 'Q157394',
  history: 'Q17013749',
  horror: 'Q200092',
  music: 'Q109733358',
  mystery: 'Q218768',
  romance: 'Q1054574',
  'science fiction': 'Q471839',
  thriller: 'Q2484376',
  war: 'Q369747',
  western: 'Q172980',
};

async function fetchWikiShelf(kind: 'movie' | 'series', genre: string): Promise<MediaItem[]> {
  const qid = WIKI_GENRE_QID[genre.toLowerCase()];
  const item = WIKI_ITEM[kind];
  if (!qid || !item) return [];
  const sparql = `SELECT ?imdb ?title (MAX(?d) AS ?date) WHERE {
    ?f wdt:P31/wdt:P279* wd:${item} ; wdt:P136 wd:${qid} ; wdt:P345 ?imdb .
    OPTIONAL { ?f wdt:P577 ?d }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?f rdfs:label ?title . }
  } GROUP BY ?imdb ?title ORDER BY DESC(?date) LIMIT 60`;
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, {
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) return [];
  const j = await res.json();
  const rows = j?.results?.bindings || [];
  const year = new Date().getFullYear();
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const b of rows) {
    const imdb = b.imdb?.value || '';
    if (!imdb || seen.has(imdb) || !/^tt\d+/.test(imdb)) continue;
    const yr = b.date?.value ? Number(String(b.date.value).slice(0, 4)) : 0;
    if (yr > year) continue;
    seen.add(imdb);
    out.push({
      _type: kind === 'series' ? 'tv' : 'movie',
      id: imdb,
      imdb,
      _title: b.title?.value || 'Untitled',
      _poster: `https://images.metahub.space/poster/medium/${imdb}/img`,
      _backdrop: `https://images.metahub.space/background/medium/${imdb}/img`,
      _sub: [yr || '', genre === 'Adult' ? '18 Plus' : genre].filter(Boolean).join(' · '),
      _year: yr,
      _genres: [genre],
      _src: 'Wikidata',
    });
  }
  return out;
}

export async function fetchCinemetaShelf(kind: 'movie' | 'series', genre: string, skip = 0): Promise<MediaItem[]> {
  const want = genre.toLowerCase().replace(/[\s-]+/g, ' ');
  const sameGenre = (g: string) => g.toLowerCase().replace(/[\s-]+/g, ' ') === want;
  return cachedCatalog(`shelf:${kind}:${genre}:${skip}`, async () => {
    let out: MediaItem[] = [];
    if (kind === 'series' && !skip) {
      out = await fetchTvmazeGenre(genre).catch(() => []);
    }
    if (out.length < 6) {
      try {
        const suffix = skip ? `&skip=${skip}` : '';
        const res = await fetch(`${CINEMETA}/catalog/${kind}/top/genre=${encodeURIComponent(genre)}${suffix}.json`);
        if (res.ok) {
          const j = await res.json();
          out = (j.metas || [])
            .map((m: any) => {
              const it = mapCinemetaMovie(m);
              if (kind === 'series') {
                it._type = 'tv';
                it.id = it.imdb || it.id || '';
              }
              return it;
            })
            .filter((x: MediaItem) => Boolean(x.imdb));
        }
      } catch {
        // ignore
      }
    }
    if (out.length >= 6) {
      const tags = out.filter((m) => (m._genres || []).length > 0);
      if (tags.length) {
        const matched = out.filter((m) => (m._genres || []).some(sameGenre));
        if (matched.length >= 6) out = matched;
        else if (matched.length) out = matched.concat(out.filter((m) => !matched.includes(m)));
      }
    }
    if (!skip && out.length < 6) {
      try {
        const res = await fetch(`${CINEMETA}/catalog/${kind}/genre/${encodeURIComponent(genre)}.json`);
        if (res.ok) {
          const j = await res.json();
          out = (j.metas || [])
            .map((m: any) => {
              const it = mapCinemetaMovie(m);
              if (kind === 'series') {
                it._type = 'tv';
                it.id = it.imdb || it.id || '';
              }
              return it;
            })
            .filter((m: MediaItem) => Boolean(m.imdb) && (m._genres || []).some(sameGenre));
        }
      } catch {
        // ignore
      }
    }
    if (!skip && out.length < 6) {
      out = await fetchWikiShelf(kind, genre).catch(() => []);
    }
    return out;
  });
}

export async function fetchAnimeGenre(genre: string, page = 1): Promise<{ items: MediaItem[]; hasNextPage: boolean }> {
  const query =
    genre === 'Trending'
      ? Q_ANIME_TREND
      : genre === 'Popular'
      ? Q_ANIME_POP
      : genre === 'Hentai'
      ? Q_ANIME_GENRE_ADULT
      : Q_ANIME_GENRE;
  const vars = genre === 'Trending' || genre === 'Popular' ? { page } : { page, genre };
  const data = await anilist(query, vars);
  const media = data?.Page?.media || [];
  return {
    items: media.map(mapAnime),
    hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
  };
}

export async function fetchUpcomingAnime(page = 1): Promise<MediaItem[]> {
  const data = await anilist(Q_ANIME_UPCOMING, { page });
  return (data?.Page?.media || []).map((m: any) => {
    const item = mapAnime(m);
    const label = airingLabel(item);
    const rest = [item.seasonYear, (item.genres || []).slice(0, 1).join('')].filter(Boolean).join(' · ');
    item._sub = rest ? `${label} · ${rest}` : label;
    return item;
  });
}

export function airingLabel(m: Partial<MediaItem>): string {
  const s = Number(m?.nextAiringEpisode?.timeUntilAiring);
  if (!Number.isFinite(s) || s <= 0) return 'Coming soon';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  if (d >= 1) return `In ${d}d${h ? ` ${h}h` : ''}`;
  if (h >= 1) return `In ${h}h ${min}m`;
  return `In ${Math.max(1, min)}m`;
}

// ---- Accurate Search Across Anime, Series, and Movies ----
export async function searchAllMedia(q: string): Promise<{ anime: MediaItem[]; tv: MediaItem[]; movie: MediaItem[] }> {
  const query = q.trim();
  if (query.length < 2) return { anime: [], tv: [], movie: [] };

  const [anime, tvmazeShows, cinemetaTv, cinemetaMovies] = await Promise.all([
    anilist(Q_ANIME_SEARCH, { q: query })
      .then((d) => (d?.Page?.media || []).map(mapAnime))
      .catch(() => [] as MediaItem[]),
    fetch(`${TVMAZE}/search/shows?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: any[]) => arr.map((x) => mapTvmaze(x.show)).filter((s) => Boolean(s.imdb || s.tvmaze)))
      .catch(() => [] as MediaItem[]),
    fetchCinemetaCatalogFeed('series', `search=${encodeURIComponent(query)}`).catch(() => [] as MediaItem[]),
    fetchCinemetaCatalogFeed('movie', `search=${encodeURIComponent(query)}`).catch(() => [] as MediaItem[]),
  ]);

  // Merge TVmaze + Cinemeta TV results, preserving IMDb/TMDB/TVmaze IDs
  const tvByImdb = new Map<string, MediaItem>();
  const tvList: MediaItem[] = [];
  for (const s of tvmazeShows) {
    if (s.imdb) tvByImdb.set(s.imdb, s);
    tvList.push(s);
  }
  for (const c of cinemetaTv) {
    if (c.imdb && tvByImdb.has(c.imdb)) {
      const existing = tvByImdb.get(c.imdb)!;
      if (c.tmdb && !existing.tmdb) existing.tmdb = c.tmdb;
      if (c._poster && !existing._poster) existing._poster = c._poster;
    } else {
      tvList.push(c);
    }
  }

  return { anime, tv: tvList, movie: cinemetaMovies };
}

// ---- Accurate TMDB / IMDb ID Normalization & Resolution ----
export function normalizeMovieIds(tmdb: unknown, imdb: unknown): { tmdb: number; imdb: string } {
  let t = String(tmdb ?? '').trim();
  let i = String(imdb ?? '').trim();
  if (/^tt\d+$/i.test(t)) {
    i = i || t;
    t = '';
  }
  if (/^tt\d+$/i.test(i)) {
    if (!/^\d+$/.test(t)) t = '';
  } else if (/^\d+$/.test(i) && !(Number(t) || 0)) {
    t = i;
    i = '';
  } else {
    i = '';
  }
  if (!/^\d+$/.test(t)) t = '';
  return { tmdb: Number(t) || 0, imdb: i };
}

export async function resolveTmdbId(
  kind: 'movie' | 'series',
  imdb: string,
  title?: string,
  year?: string | number
): Promise<{ tmdb: number; imdb: string }> {
  const cleanImdb = /^tt\d+$/i.test(String(imdb || '')) ? String(imdb) : '';
  const cacheKey = `animestream.tmdb.${kind}.v2:${cleanImdb || title || ''}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached && /^\d+$/.test(cached)) return { tmdb: Number(cached), imdb: cleanImdb };
  } catch {
    // ignore
  }

  // 1. Try Cinemeta search by title if IMDb ID missing
  let resolvedImdb = cleanImdb;
  if (!resolvedImdb && title) {
    try {
      const sr = await fetch(`${CINEMETA}/catalog/${kind}/top/search=${encodeURIComponent(title)}.json`);
      if (sr.ok) {
        const metas = (await sr.json())?.metas || [];
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const target = norm(title);
        const yrStr = year ? String(year).slice(0, 4) : '';
        const match =
          metas.find((m: any) => norm(String(m.name || '')) === target && (!yrStr || String(m.year || '').startsWith(yrStr))) ||
          metas.find((m: any) => norm(String(m.name || '')) === target) ||
          metas[0];
        if (match) {
          resolvedImdb = String(match.imdb_id || (String(match.id || '').startsWith('tt') ? match.id : ''));
          if (match.moviedb_id && /^\d+$/.test(String(match.moviedb_id))) {
            const id = String(match.moviedb_id);
            try { localStorage.setItem(cacheKey, id); } catch {}
            return { tmdb: Number(id), imdb: resolvedImdb };
          }
        }
      }
    } catch {
      // fall through
    }
  }

  // 2. Try Cinemeta meta by IMDb directly from browser (fast, CORS-open)
  if (resolvedImdb) {
    try {
      const res = await fetch(`${CINEMETA}/meta/${kind}/${encodeURIComponent(resolvedImdb)}.json`);
      if (res.ok) {
        const meta = (await res.json())?.meta;
        if (meta?.moviedb_id && /^\d+$/.test(String(meta.moviedb_id))) {
          const id = String(meta.moviedb_id);
          try { localStorage.setItem(cacheKey, id); } catch {}
          return { tmdb: Number(id), imdb: resolvedImdb };
        }
      }
    } catch {
      // fall through
    }
  }

  // 3. Direct client-side Wikidata SPARQL (IMDb P345 -> TMDB film P4947 / TV P4983, CORS-open)
  if (/^tt\d+$/i.test(resolvedImdb)) {
    try {
      const prop = kind === 'series' ? 'wdt:P4983' : 'wdt:P4947';
      const sparql = `SELECT ?tmdb WHERE { ?item wdt:P345 "${resolvedImdb}" ; ${prop} ?tmdb . } LIMIT 1`;
      const wr = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, {
        headers: { Accept: 'application/sparql-results+json' },
      });
      if (wr.ok) {
        const val = (await wr.json())?.results?.bindings?.[0]?.tmdb?.value;
        if (val && /^\d+$/.test(String(val))) {
          try { localStorage.setItem(cacheKey, String(val)); } catch {}
          return { tmdb: Number(val), imdb: resolvedImdb };
        }
      }
    } catch {
      // fall through
    }
  }

  // 4. Optional local backend fallback when available
  try {
    const params = new URLSearchParams({ kind });
    if (resolvedImdb) params.set('imdb', resolvedImdb);
    if (title) params.set('title', title);
    if (year) params.set('year', String(year));
    const res = await fetch(`/api/resolve-tmdb?${params.toString()}`);
    if (res.ok && /application\/json/i.test(res.headers.get('content-type') || '')) {
      const data = await res.json();
      const id = /^\d+$/.test(String(data.tmdb || '')) ? Number(data.tmdb) : 0;
      const apiImdb = /^tt\d+$/i.test(String(data.imdb || '')) ? String(data.imdb) : resolvedImdb;
      if (id > 0) {
        try { localStorage.setItem(cacheKey, String(id)); } catch {}
      }
      return { tmdb: id, imdb: apiImdb };
    }
  } catch {
    // ignore
  }

  return { tmdb: 0, imdb: resolvedImdb };
}

export async function fetchTvEpisodesAndMeta(tvmazeId: string | number, imdb?: string): Promise<{
  seasons: Record<number, TvEpisode[]>;
  seasonList: number[];
  totalEpisodes: number;
  show?: any;
  resolvedTvmazeId?: number;
}> {
  let id = /^\d+$/.test(String(tvmazeId || '')) ? Number(tvmazeId) : 0;
  if (!id && imdb && /^tt\d+$/i.test(imdb)) {
    const lookup = await fetch(`${TVMAZE}/lookup/shows?imdb=${encodeURIComponent(imdb)}`).catch(() => null);
    if (lookup?.ok) {
      const s = await lookup.json();
      if (s?.id) id = Number(s.id);
    }
  }

  if (id > 0) {
    try {
      const [eps, show] = await Promise.all([
        fetch(`${TVMAZE}/shows/${id}/episodes`).then((r) => (r.ok ? r.json() : [])),
        fetch(`${TVMAZE}/shows/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const bySeason: Record<number, TvEpisode[]> = {};
      for (const e of eps) {
        if (!e.season || !e.number) continue;
        if (!bySeason[e.season]) bySeason[e.season] = [];
        bySeason[e.season].push(e);
      }
      const seasonList = Object.keys(bySeason)
        .map(Number)
        .sort((a, b) => a - b);
      if (seasonList.length) {
        return { seasons: bySeason, seasonList, totalEpisodes: eps.length, show, resolvedTvmazeId: id };
      }
    } catch {
      // fall through
    }
  }

  const fallbackEps = Array.from({ length: 12 }, (_, i) => ({ season: 1, number: i + 1, name: `Episode ${i + 1}` }));
  return { seasons: { 1: fallbackEps }, seasonList: [1], totalEpisodes: 12 };
}

// ---- Anime Stream & Episode Resolution (100% Client-Side per Proxy Spec) ----
const ANIPUB_ID_CACHE_PREFIX = 'animestream.anipub.id.v1:';
const ANIPUB_ID_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const MEGA_PROBE_PREFIX = 'animestream.mega.v2:';
const MEGA_PROBE_TTL = 24 * 60 * 60 * 1000;

export function anipubNormalizeTitle(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function anipubTitleCandidates(media: any, fallback?: string): string[] {
  const values = [
    fallback,
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
    ...(Array.isArray(media?.synonyms) ? media.synonyms : []),
  ];
  const seen = new Set<string>();
  return values
    .map((v) => String(v || '').trim())
    .filter((v) => {
      const key = anipubNormalizeTitle(v);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function readMegaProbe(key: string): boolean | null {
  try {
    const raw = JSON.parse(localStorage.getItem(MEGA_PROBE_PREFIX + key) || 'null');
    if (raw && raw.expiresAt > Date.now()) return Boolean(raw.ok);
    return null;
  } catch {
    return null;
  }
}

export function writeMegaProbe(key: string, ok: boolean): void {
  try {
    localStorage.setItem(MEGA_PROBE_PREFIX + key, JSON.stringify({ ok: Boolean(ok), expiresAt: Date.now() + MEGA_PROBE_TTL }));
  } catch {
    // ignore
  }
}

async function probeStreamPage(key: string, url: string): Promise<boolean> {
  const cached = readMegaProbe(key);
  if (cached !== null) return cached;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 7000) : null;
  try {
    const res = await fetch(url, { headers: { Accept: 'text/html' }, signal: ctl?.signal });
    const text = await res.text();
    const m = /<title>([^<]*)<\/title>/i.exec(text);
    const ok = res.ok && !(m && /error|not found/i.test(m[1]));
    writeMegaProbe(key, ok);
    return ok;
  } catch {
    return true;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function anipubVideoId(rawUrl: string): string {
  const m = /\/video\/(\d+)/i.exec(String(rawUrl || ''));
  return m ? m[1] : '';
}

function anipubEmbedUrl(value: string): string {
  const raw = String(value || '').trim().replace(/^src=/i, '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, ANIPUB_BASE);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.href;
  } catch {
    return '';
  }
}

async function findAniPubAnimeId(aniId: number, candidates: string[]): Promise<number> {
  const cacheKey = `${ANIPUB_ID_CACHE_PREFIX}${aniId || anipubNormalizeTitle(candidates[0] || '')}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Number(cached.id) > 0 && cached.expiresAt > Date.now()) return Number(cached.id);
  } catch {
    // ignore
  }

  for (const title of candidates) {
    try {
      const r = await fetch(`${ANIPUB_BASE}/api/find/${encodeURIComponent(title)}`, { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const found = await r.json();
        const id = Number(found?.id);
        if (found?.exist === true && Number.isInteger(id) && id > 0) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ id, expiresAt: Date.now() + ANIPUB_ID_CACHE_TTL }));
          } catch {
            // ignore
          }
          return id;
        }
      }
    } catch {
      // try next
    }
  }

  for (const title of candidates.slice(0, 3)) {
    try {
      const r = await fetch(`${ANIPUB_BASE}/api/search/${encodeURIComponent(title)}`, { headers: { Accept: 'application/json' } });
      if (r.ok) {
        const results = await r.json();
        const hit = Array.isArray(results)
          ? results.find((item) => anipubNormalizeTitle(item?.Name) === anipubNormalizeTitle(title))
          : null;
        const id = Number(hit?.Id ?? hit?.id ?? hit?._id);
        if (hit && Number.isInteger(id) && id > 0) {
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ id, expiresAt: Date.now() + ANIPUB_ID_CACHE_TTL }));
          } catch {
            // ignore
          }
          return id;
        }
      }
    } catch {
      // try next
    }
  }

  throw new Error('This title is not available to stream yet.');
}

export async function resolveAnimeEpisodeStream(params: {
  aniId: number;
  malId: number;
  episode: number;
  wantedLang: 'sub' | 'dub';
  candidates: string[];
  anipubId?: number;
  anipubEpisodes?: string[];
  resumeSeconds?: number;
  preferredServerIdx?: number;
}): Promise<{
  url: string;
  effectiveLang: 'sub' | 'dub';
  dubNote: string;
  anipubId?: number;
  anipubEpisodes?: string[];
}> {
  const { aniId, malId, episode, wantedLang, candidates, resumeSeconds = 0, preferredServerIdx = 0 } = params;

  const tryAniPubMirror = async () => {
    const anipubId = params.anipubId || (await findAniPubAnimeId(aniId, candidates));
    let episodeUrls = params.anipubEpisodes;
    if (!Array.isArray(episodeUrls)) {
      const res = await fetch(`${ANIPUB_BASE}/v1/api/details/${encodeURIComponent(String(anipubId))}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Stream lookup failed (${res.status}).`);
      const data = await res.json();
      const local = data?.local;
      if (!local) throw new Error('No streaming record for this anime.');
      const urls = [anipubEmbedUrl(local.link)];
      (Array.isArray(local.ep) ? local.ep : []).forEach((item: any) => urls.push(anipubEmbedUrl(item?.link)));
      while (urls.length && !urls[urls.length - 1]) urls.pop();
      episodeUrls = urls;
    }

    if (!episodeUrls.length) throw new Error(`No playable source for Episode ${episode}.`);
    const raw = episodeUrls[Math.min(episode - 1, episodeUrls.length - 1)] || '';
    if (!raw) throw new Error(`No playable source for Episode ${episode}.`);

    const vidId = anipubVideoId(raw);
    let effectiveLang: 'sub' | 'dub' = wantedLang;
    let dubNote = '';
    if (wantedLang === 'dub' && vidId) {
      const hasDub = await probeStreamPage(`a:${vidId}:dub`, `${MEGA_BASE}/stream/s-2/${vidId}/dub`);
      if (!hasDub) {
        effectiveLang = 'sub';
        dubNote = `No dub for Episode ${episode} yet.`;
      }
    }

    const finalUrl = vidId
      ? megaShimSrc(`${MEGA_BASE}/stream/s-2/${vidId}/${effectiveLang}`, resumeSeconds)
      : megaShimSrc(raw, resumeSeconds);

    return { url: finalUrl, effectiveLang, dubNote, anipubId, anipubEpisodes: episodeUrls };
  };

  if (preferredServerIdx === 1 && malId > 0) {
    return {
      url: wrapMovieTvShieldUrl(`https://vidlink.pro/anime/${malId}/${episode}/${wantedLang}`, resumeSeconds),
      effectiveLang: wantedLang,
      dubNote: '',
    };
  }

  if (preferredServerIdx >= 1) {
    try {
      return await tryAniPubMirror();
    } catch {
      // Fall back to primary routes if mirror unavailable
    }
  }

  const routes: { probe: (l: 'sub' | 'dub') => Promise<boolean>; src: (l: 'sub' | 'dub') => string }[] = [];

  if (malId > 0) {
    routes.push({
      probe: (l) => probeStreamPage(`m:${malId}:${episode}:${l}`, `${MEGA_BASE}/stream/mal/${malId}/${episode}/${l}`),
      src: (l) => megaShimSrc(`${MEGA_BASE}/stream/mal/${malId}/${episode}/${l}`, resumeSeconds),
    });
  }
  if (aniId > 0) {
    routes.push({
      probe: (l) => probeStreamPage(`i:${aniId}:${episode}:${l}`, `${MEGA_BASE}/stream/ani/${aniId}/${episode}/${l}`),
      src: (l) => megaShimSrc(`${MEGA_BASE}/stream/ani/${aniId}/${episode}/${l}`, resumeSeconds),
    });
  }

  const attempts = routes.map(async (route) => {
    if (wantedLang === 'dub') {
      const [hasDub, hasSub] = await Promise.all([route.probe('dub'), route.probe('sub')]);
      if (hasDub) return { url: route.src('dub'), lang: 'dub' as const, note: '' };
      if (hasSub) return { url: route.src('sub'), lang: 'sub' as const, note: `No dub for Episode ${episode} yet.` };
      return null;
    }
    if (await route.probe('sub')) return { url: route.src('sub'), lang: 'sub' as const, note: '' };
    return null;
  });

  const hit = (await Promise.all(attempts)).find(Boolean);
  if (hit) {
    return { url: hit.url, effectiveLang: hit.lang, dubNote: hit.note };
  }

  return await tryAniPubMirror();
}

export async function fetchAniSkipTimes(
  malId: number,
  episode: number
): Promise<{ intro?: { start: number; end: number }; outro?: { start: number; end: number } }> {
  if (!malId || malId <= 0 || !episode || episode <= 0) return {};
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 3500) : null;
  try {
    const res = await fetch(
      `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types[]=op&types[]=ed&episodeLength=0`,
      { headers: { Accept: 'application/json' }, signal: ctl?.signal }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const out: { intro?: { start: number; end: number }; outro?: { start: number; end: number } } = {};
    if (data?.found && Array.isArray(data.results)) {
      for (const r of data.results) {
        const s = Number(r?.interval?.startTime);
        const e = Number(r?.interval?.endTime);
        if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s + 3) continue;
        if (r.skipType === 'op' && !out.intro) out.intro = { start: s, end: e };
        if (r.skipType === 'ed' && !out.outro) out.outro = { start: s, end: e };
      }
    }
    return out;
  } catch {
    return {};
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- Anime Prequel / Sequel Seasons Chain ----
const ANIME_TV_FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);

async function animeRelations(id: number) {
  const d = await anilist(Q_ANIME_REL, { id }).catch(() => null);
  const m = d?.Media;
  if (!m) return null;
  const edges = m.relations?.edges || [];
  const pick = (type: string) =>
    edges.find((e: any) => e.relationType === type && e.node?.type === 'ANIME' && ANIME_TV_FORMATS.has(e.node.format))?.node;
  return { node: m, prequel: pick('PREQUEL'), sequel: pick('SEQUEL') };
}

export async function loadAnimeSeasonChain(aniId: number): Promise<any[]> {
  const first = await animeRelations(aniId);
  if (!first) return [];
  const seen = new Set<number>([first.node.id]);
  const chain = [first.node];

  let back = first;
  let hops = 0;
  while (back.prequel && !seen.has(back.prequel.id) && hops++ < 8) {
    const r = await animeRelations(back.prequel.id);
    if (!r) break;
    seen.add(r.node.id);
    chain.unshift(r.node);
    back = r;
  }

  let fwd = first;
  hops = 0;
  while (fwd.sequel && !seen.has(fwd.sequel.id) && hops++ < 8) {
    const r = await animeRelations(fwd.sequel.id);
    if (!r) break;
    seen.add(r.node.id);
    chain.push(r.node);
    fwd = r;
  }

  const released = chain.filter((s) => s.status !== 'NOT_YET_RELEASED');
  return released.length ? released : chain;
}

export async function latestReleasedAnimeSeason(id: number): Promise<any | null> {
  let cur: number | undefined = id;
  let hops = 0;
  const seen = new Set<number>();
  while (cur && !seen.has(cur) && hops++ < 10) {
    seen.add(cur);
    const d: any = await anilist(Q_ANIME_REL, { id: cur }).catch(() => null);
    const m: any = d?.Media;
    if (!m) return null;
    if (m.status !== 'NOT_YET_RELEASED') return m;
    const edges: any[] = m.relations?.edges || [];
    const anime = (e: any) => e.node?.type === 'ANIME';
    const nextEdge: any =
      edges.find((e: any) => e.relationType === 'PREQUEL' && anime(e) && ANIME_TV_FORMATS.has(e.node.format)) ||
      edges.find((e: any) => e.relationType === 'PARENT' && anime(e)) ||
      edges.find((e: any) => e.relationType === 'PREQUEL' && anime(e));
    cur = nextEdge?.node?.id;
  }
  return null;
}

function sameMediaIdentity(a: Partial<MediaItem>, b: Partial<MediaItem>): boolean {
  if (a.id && b.id && String(a.id) === String(b.id)) return true;
  if (a.imdb && b.imdb && String(a.imdb).toLowerCase() === String(b.imdb).toLowerCase()) return true;
  if (a.tmdb && b.tmdb && String(a.tmdb) === String(b.tmdb)) return true;
  if (a.tvmaze && b.tvmaze && String(a.tvmaze) === String(b.tvmaze)) return true;
  const ta = anipubNormalizeTitle(String(a._title || a.title || ''));
  const tb = anipubNormalizeTitle(String(b._title || b.title || ''));
  return Boolean(ta && tb && ta === tb);
}

function dedupeRelatedList(current: Partial<MediaItem>, items: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of items) {
    if (!item || sameMediaIdentity(item, current)) continue;
    const key =
      (item.imdb ? `imdb:${item.imdb.toLowerCase()}` : '') ||
      (item.tvmaze ? `tv:${item.tvmaze}` : '') ||
      `${item._type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 24) break;
  }
  return out;
}

export async function fetchRelatedMedia(m: MediaItem): Promise<MediaItem[]> {
  if (m._type === 'anime' && Number(m.id) > 0) {
    const d = await anilist(Q_ANIME_RELATED, { id: Number(m.id) }).catch(() => null);
    const recs = (d?.Media?.recommendations?.nodes || [])
      .map((n: any) => n?.mediaRecommendation)
      .filter((x: any) => x && !x.isAdult && x.status !== 'NOT_YET_RELEASED')
      .map(mapAnime);
    if (recs.length) return dedupeRelatedList(m, recs);

    const g = (m.genres || m._genres || [])[0] || 'Trending';
    const fallback = await fetchAnimeGenre(g, 1).catch(() => ({ items: [] as MediaItem[], hasNextPage: false }));
    return dedupeRelatedList(m, fallback.items);
  }

  if (m._type === 'movie' || m._type === 'tv') {
    const cinKind = m._type === 'movie' ? 'movie' : 'series';
    let genres = [...(m.genres || []), ...(m._genres || [])].filter(Boolean);
    let imdb = String(m.imdb || (String(m.id || '').startsWith('tt') ? m.id : '')).trim();

    if (!genres.length && !imdb && m._type === 'tv' && m.tvmaze && /^\d+$/.test(String(m.tvmaze))) {
      const sr = await fetch(`${TVMAZE}/shows/${encodeURIComponent(String(m.tvmaze))}`).catch(() => null);
      if (sr?.ok) {
        const show = await sr.json().catch(() => null);
        if (Array.isArray(show?.genres)) genres = show.genres.filter(Boolean);
        if (show?.externals?.imdb) imdb = String(show.externals.imdb);
      }
    }

    if (!genres.length && /^tt\d+$/i.test(imdb)) {
      const mr = await fetch(`${CINEMETA}/meta/${cinKind}/${encodeURIComponent(imdb)}.json`).catch(() => null);
      if (mr?.ok) {
        const mj = await mr.json().catch(() => null);
        const mg = mj?.meta?.genre;
        if (Array.isArray(mg)) genres = mg.filter(Boolean);
      }
    }

    if (!genres.length && m._title) {
      const found = await fetchCinemetaCatalogFeed(cinKind, `search=${encodeURIComponent(m._title)}`).catch(() => []);
      const hit = found[0];
      if (hit) genres = [...(hit.genres || []), ...(hit._genres || [])].filter(Boolean);
    }

    const pickedGenres = [...new Set(genres)].slice(0, 2);
    const shelfPromises = pickedGenres.map((g) =>
      fetchCinemetaCatalogFeed(cinKind, `genre=${encodeURIComponent(g)}`)
        .then((res) => (res.length ? res : fetchCinemetaShelf(cinKind, g)))
        .catch(() => fetchCinemetaShelf(cinKind, g).catch(() => [] as MediaItem[]))
    );
    const shelfResults = shelfPromises.length ? await Promise.all(shelfPromises) : [];
    let combined = shelfResults.flat();

    if (combined.length < 10) {
      const extraFeed =
        m._type === 'movie'
          ? await fetchCinemetaCatalogFeed('movie').catch(() => [] as MediaItem[])
          : await Promise.all([
              fetchCinemetaCatalogFeed('series').catch(() => [] as MediaItem[]),
              fetchTvmazePopular().catch(() => [] as MediaItem[]),
            ]).then((arr) => arr.flat());
      combined = [...combined, ...extraFeed];
    }

    return dedupeRelatedList(m, combined);
  }

  return [];
}

// ---- Hero Trailer YouTube Resolver ----
const TRAILER_CACHE_KEY = 'animestream.trailers.v1';

export async function resolveTrailerId(item: Partial<MediaItem>): Promise<string> {
  if (!item) return '';
  if (item._type === 'anime') {
    const tr = item.trailer;
    return tr?.id && /youtube/i.test(String(tr.site || 'youtube')) ? String(tr.id) : '';
  }
  if (item._type !== 'movie' && item._type !== 'tv') return '';
  const imdb = item.imdb || '';
  if (!/^tt\d+$/i.test(imdb)) return '';

  let cache: Record<string, string> = {};
  try {
    cache = JSON.parse(localStorage.getItem(TRAILER_CACHE_KEY) || '{}') || {};
    if (cache[imdb]) return cache[imdb];
  } catch {
    cache = {};
  }

  try {
    const kind = item._type === 'movie' ? 'movie' : 'series';
    const r = await fetch(`${CINEMETA}/meta/${kind}/${encodeURIComponent(imdb)}.json`);
    if (!r.ok) return '';
    const meta = (await r.json())?.meta;
    if (!meta) return '';
    const list = [
      ...(Array.isArray(meta.trailerStreams) ? meta.trailerStreams : []),
      ...(Array.isArray(meta.trailers) ? meta.trailers : []),
    ];
    let id = '';
    for (const s of list) {
      const raw = typeof s === 'string' ? s : s?.ytId || s?.url || '';
      const m =
        /^youtube:(.+)/i.exec(raw) ||
        /youtu\.?be[^/]*\/(?:watch\?v=|embed\/)?([\w-]{6,15})/i.exec(raw) ||
        /^([\w-]{8,15})$/.exec(raw);
      if (m) {
        id = m[1];
        break;
      }
    }
    if (id) {
      cache[imdb] = id;
      try {
        const keys = Object.keys(cache);
        if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete cache[k]);
        localStorage.setItem(TRAILER_CACHE_KEY, JSON.stringify(cache));
      } catch {
        // ignore
      }
    }
    return id;
  } catch {
    return '';
  }
}

export function youtubeHeroEmbedUrl(id: string, start = 12): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&controls=0&loop=1&playlist=${encodeURIComponent(
    id
  )}&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&start=${start}`;
}

export async function resolveSharedTitle(type: string, id: string): Promise<MediaItem | null> {
  if (type === 'anime') {
    const d = await anilist(Q_ANIME_INFO, { id: Number(id) }).catch(() => null);
    return d?.Media ? mapAnime(d.Media) : null;
  }
  if (type === 'movie') {
    const r = await fetch(`${CINEMETA}/meta/movie/${encodeURIComponent(id)}.json`).catch(() => null);
    if (r?.ok) {
      const j = await r.json();
      if (j?.meta) return mapCinemetaMovie({ ...j.meta, imdb_id: id });
    }
  }
  if (type === 'tv') {
    if (/^tt\d+$/i.test(id)) {
      const lr = await fetch(`${TVMAZE}/lookup/shows?imdb=${encodeURIComponent(id)}`).catch(() => null);
      if (lr?.ok) return mapTvmaze(await lr.json());
      const cr = await fetch(`${CINEMETA}/meta/series/${encodeURIComponent(id)}.json`).catch(() => null);
      if (cr?.ok) {
        const cj = await cr.json();
        if (cj?.meta) {
          const it = mapCinemetaMovie({ ...cj.meta, imdb_id: id });
          it._type = 'tv';
          it.id = it.imdb || id;
          return it;
        }
      }
    }
    const r = await fetch(`${TVMAZE}/shows/${encodeURIComponent(id)}`).catch(() => null);
    if (r?.ok) return mapTvmaze(await r.json());
  }
  return null;
}
