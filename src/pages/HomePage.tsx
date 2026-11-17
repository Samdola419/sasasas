import React, { useEffect, useState } from 'react';
import {
  anilist,
  fetchCinemetaCatalogFeed,
  fetchCinemetaShelf,
  fetchNewMovies,
  fetchTvmazePopular,
  fetchUpcomingAnime,
  mapAnime,
  Q_ANIME_POP,
  Q_ANIME_TREND,
} from '../lib/catalog';
import { cacheSelectedMedia, mediaDetailsUrl, mediaPlayUrl, progressKeyOf } from '../lib/routes';
import { applyPageSeo, DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '../lib/seo';
import { useApp } from '../context/AppContext';
import { HeroBanner } from '../components/HeroBanner';
import { ShelfRow } from '../components/ShelfRow';
import type { MediaItem } from '../types/media';

export function HomePage() {
  const {
    navigate,
    continueWatching,
    removeContinueWatching,
    getWatchProgress,
  } = useApp();

  const [heroSlides, setHeroSlides] = useState<MediaItem[]>([]);
  const [upcomingAnime, setUpcomingAnime] = useState<MediaItem[]>([]);
  const [newMovies, setNewMovies] = useState<MediaItem[]>([]);
  const [popularSeries, setPopularSeries] = useState<MediaItem[]>([]);
  const [trendingAnime, setTrendingAnime] = useState<MediaItem[]>([]);
  const [popularAnime, setPopularAnime] = useState<MediaItem[]>([]);
  const [actionMovies, setActionMovies] = useState<MediaItem[]>([]);
  const [scifiMovies, setScifiMovies] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    applyPageSeo({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      path: '/',
    });
    let cancelled = false;
    setLoading(true);

    Promise.all([
      anilist(Q_ANIME_TREND, { page: 1 })
        .then((d) => (d?.Page?.media || []).map(mapAnime))
        .catch(() => [] as MediaItem[]),
      anilist(Q_ANIME_POP, { page: 1 })
        .then((d) => (d?.Page?.media || []).map(mapAnime))
        .catch(() => [] as MediaItem[]),
      fetchUpcomingAnime(1).catch(() => [] as MediaItem[]),
      fetchNewMovies(1).catch(() => [] as MediaItem[]),
      fetchTvmazePopular().catch(() => [] as MediaItem[]),
      fetchCinemetaCatalogFeed('movie').catch(() => [] as MediaItem[]),
      fetchCinemetaShelf('movie', 'Action').catch(() => [] as MediaItem[]),
      fetchCinemetaShelf('movie', 'Science Fiction').catch(() => [] as MediaItem[]),
    ]).then(
      ([
        trendAni,
        popAni,
        upcoming,
        newMov,
        popTv,
        topCinMov,
        actMov,
        sfMov,
      ]) => {
        if (cancelled) return;
        setTrendingAnime(trendAni);
        setPopularAnime(popAni);
        setUpcomingAnime(upcoming);
        setNewMovies(newMov);
        setPopularSeries(popTv);
        setActionMovies(actMov);
        setScifiMovies(sfMov);

        // Interleave hero slides cleanly across Anime, Movies, and Series
        const slides: MediaItem[] = [];
        const movPool = topCinMov.length ? topCinMov : newMov;
        for (let i = 0; i < 3; i++) {
          if (trendAni[i]) slides.push(trendAni[i]);
          if (movPool[i]) slides.push(movPool[i]);
          if (popTv[i]) slides.push(popTv[i]);
        }
        setHeroSlides(slides.slice(0, 6));
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const openDetails = (item: MediaItem) => {
    cacheSelectedMedia(item);
    navigate(mediaDetailsUrl(item));
  };

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

  const getContinueMeta = (item: MediaItem) => {
    const prog = getWatchProgress(progressKeyOf(item));
    if (!prog) return {};
    const label =
      item._type === 'anime'
        ? `Ep ${prog.e || 1}`
        : item._type === 'tv'
        ? `S${prog.s || 1} · E${prog.e || 1}`
        : prog.p && prog.p > 60
        ? `${Math.floor(prog.p / 60)}m`
        : 'Resume';
    const pct = prog.dur && prog.p ? Math.round((prog.p / prog.dur) * 100) : prog.p ? 35 : 0;
    return { label, pct };
  };

  return (
    <div className="min-h-screen pb-24 md:pb-16">
      <HeroBanner slides={heroSlides} onPlay={openPlay} onMoreInfo={openDetails} />

      <div className="-mt-6 relative z-10 space-y-2">
        {continueWatching.length > 0 && (
          <ShelfRow
            title="Continue Watching"
            subtitle="Pick up right where you left off across devices"
            items={continueWatching}
            onItemClick={openPlay}
            onViewAll={() => navigate('/continue')}
            getProgressMeta={getContinueMeta}
            onRemoveItem={(item) => removeContinueWatching(item)}
          />
        )}

        <ShelfRow
          title="Trending Anime"
          items={trendingAnime}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={() => navigate('/genre/Trending')}
        />

        <ShelfRow
          title="New & Popular Movies"
          items={newMovies}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={() => navigate('/movies')}
        />

        <ShelfRow
          title="Popular TV Series"
          items={popularSeries}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={() => navigate('/series')}
        />

        <ShelfRow
          title="Coming Soon"
          subtitle="Upcoming anime airing next"
          items={upcomingAnime}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={() => navigate('/coming')}
        />

        <ShelfRow
          title="Popular Anime"
          items={popularAnime}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={() => navigate('/genre/Popular')}
        />

        <ShelfRow
          title="Action Movies"
          items={actionMovies}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={() => navigate('/movies')}
        />

        <ShelfRow
          title="Science Fiction"
          items={scifiMovies}
          loading={loading}
          onItemClick={openDetails}
          onViewAll={() => navigate('/movies')}
        />
      </div>
    </div>
  );
}
export default HomePage;
