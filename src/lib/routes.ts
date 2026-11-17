import type { MediaItem } from '../types/media';

export function progressKeyOf(m: Partial<MediaItem>): string {
  const type = m._type || 'anime';
  if (type === 'anime') return `anime:${m.ani_id || m.id || ''}`;
  if (type === 'tv') return `tv:${m.imdb || m.tmdb || m.tvmaze || m.id || ''}`;
  return `movie:${m.imdb || m.tmdb || m.id || ''}`;
}

export function mediaDetailsUrl(m: Partial<MediaItem>): string {
  const type = m._type || 'anime';
  const id = encodeURIComponent(String(m.id || m.imdb || m.tmdb || m.tvmaze || ''));
  return `/t/${encodeURIComponent(type)}/${id}`;
}

export function mediaPlayUrl(
  m: Partial<MediaItem>,
  opts: { episode?: number; season?: number; lang?: 'sub' | 'dub'; t?: number } = {}
): string {
  const type = m._type || 'anime';
  const p = new URLSearchParams();
  if (opts.episode && opts.episode > 1) p.set('e', String(opts.episode));
  if (opts.season && opts.season > 1) p.set('s', String(opts.season));
  if (opts.lang) p.set('lang', opts.lang);
  if (opts.t && opts.t > 5) p.set('t', String(Math.floor(opts.t)));

  let base = '/';
  if (type === 'anime') {
    const ani = m.ani_id || m.id || 0;
    const mal = m.mal_id || m.idMal || 0;
    base = `/play/anime/${encodeURIComponent(String(ani))}`;
    if (mal) p.set('mal', String(mal));
  } else if (type === 'tv') {
    const tvKey = m.imdb || m.tmdb || m.tvmaze || m.id || '';
    base = `/play/tv/${encodeURIComponent(String(tvKey))}`;
    if (m.tvmaze) p.set('tvmaze', String(m.tvmaze));
    if (m.tmdb) p.set('tmdb', String(m.tmdb));
    if (m.imdb) p.set('imdb', String(m.imdb));
  } else {
    const movKey = m.imdb || m.tmdb || m.id || '';
    base = `/play/movie/${encodeURIComponent(String(movKey))}`;
    if (m.tmdb) p.set('tmdb', String(m.tmdb));
    if (m.imdb) p.set('imdb', String(m.imdb));
  }

  if (m._title || m.title) p.set('title', String(m._title || m.title));
  if (m._year || m.seasonYear) p.set('year', String(m._year || m.seasonYear));
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

const SELECTED_ITEM_KEY = 'amstream.selected.v1:';

export function cacheSelectedMedia(item: MediaItem): void {
  try {
    const k = `${SELECTED_ITEM_KEY}${item._type}:${item.id || item.imdb || item.tmdb || item.tvmaze}`;
    sessionStorage.setItem(k, JSON.stringify(item));
    if (item.imdb) {
      sessionStorage.setItem(`${SELECTED_ITEM_KEY}${item._type}:${item.imdb}`, JSON.stringify(item));
    }
  } catch {
    // ignore quota errors
  }
}

export function readCachedSelectedMedia(type: string, id: string): MediaItem | null {
  try {
    const raw = sessionStorage.getItem(`${SELECTED_ITEM_KEY}${type}:${id}`);
    return raw ? (JSON.parse(raw) as MediaItem) : null;
  } catch {
    return null;
  }
}
