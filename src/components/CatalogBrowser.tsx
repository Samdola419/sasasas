import React, { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUpDown } from 'lucide-react';
import { ANIME_CATEGORIES, CAT_LABEL } from '../lib/catalog';
import { cacheSelectedMedia, mediaDetailsUrl } from '../lib/routes';
import { useApp } from '../context/AppContext';
import { HeroBanner } from './HeroBanner';
import { MediaCard } from './MediaCard';
import { ShelfRow } from './ShelfRow';
import { useGridSlotsWithAds, VastMediaAdCard } from './VastMediaAdCard';
import type { MediaItem } from '../types/media';

export type CatalogSortOption = 'default' | 'rating' | 'newest' | 'az';

export interface CatalogShelf {
  title: string;
  items: MediaItem[];
  genre?: string;
}

interface CatalogBrowserProps {
  heading: string;
  subtitle: string;
  loading: boolean;
  heroSlides?: MediaItem[];
  shelves?: CatalogShelf[];
  items?: MediaItem[];
  gridTitle?: string;
  showSort?: boolean;
  showAnimeGenres?: boolean;
  showAllGenresButton?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreLabel?: string;
  onLoadMore?: () => void;
  infiniteScroll?: boolean;
}

function sortCatalogItems(items: MediaItem[], sort: CatalogSortOption): MediaItem[] {
  if (sort === 'default') return items;
  const copy = [...items];
  if (sort === 'rating') {
    copy.sort((a, b) => (Number(b.averageScore) || 0) - (Number(a.averageScore) || 0));
  } else if (sort === 'newest') {
    copy.sort((a, b) => (b._year || Number(b.seasonYear) || 0) - (a._year || Number(a.seasonYear) || 0));
  } else if (sort === 'az') {
    copy.sort((a, b) => String(a._title || '').localeCompare(String(b._title || '')));
  }
  return copy;
}

export function CatalogBrowser({
  heading,
  subtitle,
  loading,
  heroSlides = [],
  shelves = [],
  items = [],
  gridTitle,
  showSort = false,
  showAnimeGenres = false,
  showAllGenresButton = false,
  hasMore = false,
  loadingMore = false,
  loadMoreLabel = 'Load More',
  onLoadMore,
  infiniteScroll = false,
}: CatalogBrowserProps) {
  const { navigate } = useApp();
  const [sort, setSort] = useState<CatalogSortOption>('default');
  const sentinelRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!infiniteScroll || !hasMore || !onLoadMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '320px' }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [infiniteScroll, hasMore, onLoadMore]);

  const openDetails = (item: MediaItem) => {
    cacheSelectedMedia(item);
    navigate(mediaDetailsUrl(item));
  };

  const sortedItems = useMemo(() => sortCatalogItems(items, sort), [items, sort]);
  const gridSlots = useGridSlotsWithAds(sortedItems, 9);

  return (
    <div className="min-h-screen pb-24 md:pb-16">
      {heroSlides.length > 0 && (
        <HeroBanner slides={heroSlides} onPlay={openDetails} onMoreInfo={openDetails} />
      )}

      <div
        className={`max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 ${
          heroSlides.length ? 'pt-6' : 'pt-24'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{heading}</h1>
            <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            {showAllGenresButton && (
              <a
                href="/category"
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  navigate('/category');
                }}
                className="inline-flex items-center h-9 px-3.5 rounded-lg bg-white/6 hover:bg-white/12 border border-white/10 text-xs sm:text-sm text-slate-200 transition-colors"
              >
                All Genres
              </a>
            )}
            {showSort && (
              <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/6 border border-white/10">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <select
                  aria-label="Sort results"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CatalogSortOption)}
                  className="bg-transparent text-xs sm:text-sm text-white focus:outline-none cursor-pointer"
                >
                  <option value="default" className="bg-[#12141C]">Default Order</option>
                  <option value="newest" className="bg-[#12141C]">Newest</option>
                  <option value="rating" className="bg-[#12141C]">Highest Rated</option>
                  <option value="az" className="bg-[#12141C]">A–Z</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {showAnimeGenres && (
          <div className="flex gap-2 overflow-x-auto shelf-scroll pb-4 mb-2">
            {ANIME_CATEGORIES.map((g) => {
              const href = `/genre/${encodeURIComponent(g)}`;
              return (
                <a
                  key={g}
                  href={href}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    navigate(href);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-white/6 hover:bg-[#E11D48] border border-white/8 text-xs font-medium text-slate-200 hover:text-white whitespace-nowrap transition-colors"
                >
                  {CAT_LABEL[g] || g}
                </a>
              );
            })}
          </div>
        )}
      </div>

      {shelves.map((shelf) => (
        <ShelfRow
          key={shelf.title}
          title={shelf.title}
          items={shelf.items}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={shelf.genre ? () => navigate(`/genre/${encodeURIComponent(shelf.genre!)}`) : undefined}
        />
      ))}

      {(sortedItems.length > 0 || (loading && !shelves.length)) && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 mt-6">
          {gridTitle && sortedItems.length > 0 && (
            <h2 className="font-display text-lg sm:text-xl font-semibold text-white mb-4">{gridTitle}</h2>
          )}

          {loading && !sortedItems.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[2/3] rounded-xl bg-white/8" />
                  <div className="h-3.5 w-3/4 bg-white/8 rounded mt-2.5" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 sm:gap-5">
              {gridSlots.map((slot) =>
                slot.kind === 'ad' ? (
                  <VastMediaAdCard key={slot.adKey} compact />
                ) : (
                  <MediaCard
                    key={`${slot.item._type}:${slot.item.id}:${slot.item.imdb || ''}`}
                    item={slot.item}
                    onClick={openDetails}
                    compact
                  />
                )
              )}
            </div>
          )}

          {infiniteScroll && hasMore && (
            <div ref={sentinelRef} className="py-10 flex justify-center">
              {loadingMore && <span className="text-sm text-slate-400">Loading more titles...</span>}
            </div>
          )}

          {!infiniteScroll && hasMore && !loading && onLoadMore && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              >
                <ArrowDown className="w-4 h-4" />
                {loadingMore ? 'Loading...' : loadMoreLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
