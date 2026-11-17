import React, { useEffect, useState } from 'react';
import { fetchAnimeGenre } from '../lib/catalog';
import { applyPageSeo } from '../lib/seo';
import { CatalogBrowser, type CatalogShelf } from '../components/CatalogBrowser';
import type { MediaItem } from '../types/media';

export function AnimePage() {
  const [loading, setLoading] = useState(true);
  const [heroSlides, setHeroSlides] = useState<MediaItem[]>([]);
  const [shelves, setShelves] = useState<CatalogShelf[]>([]);

  useEffect(() => {
    applyPageSeo({
      title: 'Watch Anime Online Ad-Free — AMStream',
      description:
        'Stream trending and classic anime in SUB & DUB with instant intro/outro skip, multiple servers, and synced Watch Rooms.',
      path: '/anime',
    });

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchAnimeGenre('Trending', 1),
      fetchAnimeGenre('Popular', 1),
      fetchAnimeGenre('Action', 1),
      fetchAnimeGenre('Fantasy', 1),
      fetchAnimeGenre('Romance', 1),
      fetchAnimeGenre('Sci-Fi', 1),
    ])
      .then(([trend, pop, action, fantasy, romance, scifi]) => {
        if (cancelled) return;
        setHeroSlides(trend.items.slice(0, 5));
        setShelves([
          { title: 'Trending Anime', items: trend.items, genre: 'Trending' },
          { title: 'Popular Anime', items: pop.items, genre: 'Popular' },
          { title: 'Action', items: action.items, genre: 'Action' },
          { title: 'Fantasy', items: fantasy.items, genre: 'Fantasy' },
          { title: 'Romance', items: romance.items, genre: 'Romance' },
          { title: 'Sci-Fi', items: scifi.items, genre: 'Sci-Fi' },
        ]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <CatalogBrowser
      heading="Anime"
      subtitle="Curated anime & genre collections in SUB and DUB"
      loading={loading}
      heroSlides={heroSlides}
      shelves={shelves}
      showAnimeGenres
      showAllGenresButton
    />
  );
}
export default AnimePage;
