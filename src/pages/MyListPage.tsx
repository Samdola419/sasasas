import React, { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { cacheSelectedMedia, mediaDetailsUrl } from '../lib/routes';
import { applyPageSeo } from '../lib/seo';
import { useApp } from '../context/AppContext';
import { MediaCard } from '../components/MediaCard';
import { useGridSlotsWithAds, VastMediaAdCard } from '../components/VastMediaAdCard';
import type { MediaItem } from '../types/media';

export function MyListPage() {
  const { myList, toggleMyList, navigate } = useApp();
  const [filter, setFilter] = useState<'all' | 'anime' | 'tv' | 'movie'>('all');

  useEffect(() => {
    applyPageSeo({
      title: 'My List — AMStream',
      description: 'Manage your saved anime, movies, and TV series synced across devices with AMStream.',
      path: '/list',
    });
  }, []);

  const filtered = filter === 'all' ? myList : myList.filter((m) => m._type === filter);
  const gridSlots = useGridSlotsWithAds(filtered, 9);

  const openDetails = (item: MediaItem) => {
    cacheSelectedMedia(item);
    navigate(mediaDetailsUrl(item));
  };

  return (
    <div className="min-h-screen pt-24 pb-24 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#E11D48]/18 text-[#F43F5E] flex items-center justify-center">
            <Bookmark className="w-5 h-5" />
          </span>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">My List</h1>
            <p className="text-sm text-slate-400">{myList.length} saved titles synced across your devices</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/6 border border-white/10">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'anime', label: 'Anime' },
              { id: 'tv', label: 'Series' },
              { id: 'movie', label: 'Movies' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium cursor-pointer transition-colors ${
                filter === t.id ? 'bg-[#E11D48] text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-white/3 border border-white/8">
          <p className="text-lg font-medium text-white">No saved titles yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Add anime, movies, or TV series to My List from any title page.
          </p>
          <a
            href="/"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              navigate('/');
            }}
            className="inline-flex items-center justify-center mt-5 h-10 px-5 rounded-xl bg-[#E11D48] text-white text-sm font-semibold"
          >
            Discover Titles
          </a>
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
                onRemove={() => toggleMyList(slot.item)}
                compact
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
export default MyListPage;
