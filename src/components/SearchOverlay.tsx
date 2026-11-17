import React, { useEffect, useRef, useState } from 'react';
import { Clock, Search, X } from 'lucide-react';
import { searchAllMedia } from '../lib/catalog';
import { cacheSelectedMedia, mediaDetailsUrl } from '../lib/routes';
import { useApp } from '../context/AppContext';
import { MediaCard } from './MediaCard';
import { useGridSlotsWithAds, VastMediaAdCard } from './VastMediaAdCard';
import type { MediaItem } from '../types/media';

const RECENT_SEARCH_KEY = 'amstream.recent-searches.v1';
const POPULAR_SEARCHES = ['Solo Leveling', 'Dandadan', 'Oppenheimer', 'Breaking Bad', 'Frieren', 'Interstellar'];

type ScopeTab = 'all' | 'anime' | 'tv' | 'movie';

export function SearchOverlay() {
  const { searchOpen, setSearchOpen, navigate } = useApp();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<ScopeTab>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ anime: MediaItem[]; tv: MediaItem[]; movie: MediaItem[] }>({
    anime: [],
    tv: [],
    movie: [],
  });
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [searchOpen, setSearchOpen]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults({ anime: [], tv: [], movie: [] });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await searchAllMedia(trimmed);
        if (!cancelled) setResults(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const recordSearch = (term: string) => {
    const clean = term.trim();
    if (clean.length < 2) return;
    const next = [clean, ...recent.filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const openResult = (item: MediaItem) => {
    recordSearch(query);
    cacheSelectedMedia(item);
    setSearchOpen(false);
    navigate(mediaDetailsUrl(item));
  };

  if (!searchOpen) return null;

  const shownAnime = scope === 'all' || scope === 'anime' ? results.anime : [];
  const shownTv = scope === 'all' || scope === 'tv' ? results.tv : [];
  const shownMovies = scope === 'all' || scope === 'movie' ? results.movie : [];
  const animeSlots = useGridSlotsWithAds(shownAnime, 9);
  const movieSlots = useGridSlotsWithAds(shownMovies, 9);
  const tvSlots = useGridSlotsWithAds(shownTv, 9);
  const totalCount = shownAnime.length + shownTv.length + shownMovies.length;

  return (
    <div className="fixed inset-0 z-50 bg-[#090A0D]/96 backdrop-blur-xl overflow-y-auto">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6">
        {/* Search header */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/10">
          <Search className="w-5 h-5 text-[#F43F5E] shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anime, movies, or TV series..."
            className="flex-1 bg-transparent text-lg sm:text-2xl font-display font-medium text-white placeholder:text-slate-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
            className="w-10 h-10 rounded-xl bg-white/8 hover:bg-white/15 flex items-center justify-center text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scope tabs */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto shelf-scroll pb-1">
          {(
            [
              { id: 'all', label: 'All Titles' },
              { id: 'anime', label: `Anime${results.anime.length ? ` (${results.anime.length})` : ''}` },
              { id: 'tv', label: `Series${results.tv.length ? ` (${results.tv.length})` : ''}` },
              { id: 'movie', label: `Movies${results.movie.length ? ` (${results.movie.length})` : ''}` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                scope === tab.id
                  ? 'bg-[#E11D48] text-white'
                  : 'bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Empty / suggestions state */}
        {query.trim().length < 2 && (
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {recent.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Recent Searches
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setRecent([]);
                      try {
                        localStorage.removeItem(RECENT_SEARCH_KEY);
                      } catch {
                        // ignore
                      }
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    Clear history
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setQuery(term)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/8 text-sm text-slate-200 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Popular Searches
              </h3>
              <div className="flex flex-wrap gap-2">
                {POPULAR_SEARCHES.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="px-3 py-1.5 rounded-lg bg-white/6 hover:bg-[#E11D48]/20 border border-white/8 hover:border-[#E11D48]/40 text-sm text-slate-200 cursor-pointer transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && query.trim().length >= 2 && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-xl bg-white/8" />
                <div className="h-3.5 w-3/4 bg-white/8 rounded mt-2.5" />
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {!loading && query.trim().length >= 2 && totalCount === 0 && (
          <div className="mt-16 text-center">
            <p className="text-lg font-medium text-white">No matches for “{query.trim()}”</p>
            <p className="text-sm text-slate-400 mt-1">
              Try a different title, English/Romaji name, or browse categories.
            </p>
          </div>
        )}

        {!loading && totalCount > 0 && (
          <div className="mt-8 space-y-10 pb-12">
            {shownAnime.length > 0 && (
              <section>
                <h3 className="font-display text-base font-semibold text-white mb-4">
                  Anime ({shownAnime.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {animeSlots.map((slot) =>
                    slot.kind === 'ad' ? (
                      <VastMediaAdCard key={`a-${slot.adKey}`} compact />
                    ) : (
                      <MediaCard key={`a:${slot.item.id}`} item={slot.item} onClick={openResult} compact />
                    )
                  )}
                </div>
              </section>
            )}

            {shownMovies.length > 0 && (
              <section>
                <h3 className="font-display text-base font-semibold text-white mb-4">
                  Movies ({shownMovies.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {movieSlots.map((slot) =>
                    slot.kind === 'ad' ? (
                      <VastMediaAdCard key={`m-${slot.adKey}`} compact />
                    ) : (
                      <MediaCard
                        key={`m:${slot.item.id}:${slot.item.imdb || ''}`}
                        item={slot.item}
                        onClick={openResult}
                        compact
                      />
                    )
                  )}
                </div>
              </section>
            )}

            {shownTv.length > 0 && (
              <section>
                <h3 className="font-display text-base font-semibold text-white mb-4">
                  TV Series ({shownTv.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {tvSlots.map((slot) =>
                    slot.kind === 'ad' ? (
                      <VastMediaAdCard key={`t-${slot.adKey}`} compact />
                    ) : (
                      <MediaCard
                        key={`t:${slot.item.id}:${slot.item.imdb || ''}`}
                        item={slot.item}
                        onClick={openResult}
                        compact
                      />
                    )
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
