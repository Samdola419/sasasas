import React, { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cacheSelectedMedia, mediaDetailsUrl, mediaPlayUrl, progressKeyOf } from '../lib/routes';
import { applyPageSeo } from '../lib/seo';
import { useApp } from '../context/AppContext';
import { MediaCard } from '../components/MediaCard';
import { useGridSlotsWithAds, VastMediaAdCard } from '../components/VastMediaAdCard';
import type { MediaItem } from '../types/media';

export function ContinuePage() {
  const { continueWatching, removeContinueWatching, getWatchProgress, navigate } = useApp();
  const gridSlots = useGridSlotsWithAds(continueWatching, 9);

  useEffect(() => {
    applyPageSeo({
      title: 'Continue Watching — AMStream',
      description: 'Pick up right where you paused with synced episode and timestamp memory across devices on AMStream.',
      path: '/continue',
    });
  }, []);

  const openPlay = (item: MediaItem) => {
    cacheSelectedMedia(item);
    if (item._type === 'anime' && item.status === 'NOT_YET_RELEASED') {
      navigate(mediaDetailsUrl(item));
      return;
    }
    const prog = getWatchProgress(progressKeyOf(item));
    navigate(
      mediaPlayUrl(item, {
        episode: prog?.e || 1,
        season: prog?.s || 1,
        t: prog?.p || 0,
      })
    );
  };

  return (
    <div className="min-h-screen pt-24 pb-24 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10">
      <div className="flex items-center gap-3 mb-8">
        <span className="w-10 h-10 rounded-xl bg-[#E11D48]/18 text-[#F43F5E] flex items-center justify-center">
          <Clock className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Continue Watching</h1>
          <p className="text-sm text-slate-400">Resume where you paused with synced episode & time memory</p>
        </div>
      </div>

      {continueWatching.length === 0 ? (
        <div className="py-20 text-center rounded-2xl bg-white/3 border border-white/8">
          <p className="text-lg font-medium text-white">Your watch history is empty</p>
          <p className="text-sm text-slate-400 mt-1">Titles you start watching will appear here automatically.</p>
          <a
            href="/"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              navigate('/');
            }}
            className="inline-flex items-center justify-center mt-5 h-10 px-5 rounded-xl bg-[#E11D48] text-white text-sm font-semibold"
          >
            Browse Catalog
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 sm:gap-5">
          {gridSlots.map((slot) => {
            if (slot.kind === 'ad') {
              return <VastMediaAdCard key={slot.adKey} compact />;
            }
            const item = slot.item;
            const prog = getWatchProgress(progressKeyOf(item));
            const label =
              item._type === 'anime'
                ? `Ep ${prog?.e || 1}`
                : item._type === 'tv'
                ? `S${prog?.s || 1} · E${prog?.e || 1}`
                : prog?.p
                ? `${Math.floor(prog.p / 60)}m`
                : 'Resume';
            const pct = prog?.dur && prog?.p ? Math.round((prog.p / prog.dur) * 100) : prog?.p ? 35 : 0;

            return (
              <MediaCard
                key={`${item._type}:${item.id}:${item.imdb || ''}`}
                item={item}
                onClick={openPlay}
                progressLabel={label}
                progressPct={pct}
                onRemove={() => removeContinueWatching(item)}
                compact
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
export default ContinuePage;
