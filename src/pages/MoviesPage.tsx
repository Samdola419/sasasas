import React, { useCallback, useEffect, useState } from 'react';
import { fetchCinemetaCatalogFeed, fetchCinemetaShelf, fetchNewMovies } from '../lib/catalog';
import { applyPageSeo } from '../lib/seo';
import { CatalogBrowser, type CatalogShelf } from '../components/CatalogBrowser';
import type { MediaItem } from '../types/media';

export function MoviesPage() {
  const [loading, setLoading] = useState(true);
  const [heroSlides, setHeroSlides] = useState<MediaItem[]>([]);
  const [shelves, setShelves] = useState<CatalogShelf[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    applyPageSeo({
      title: 'Watch HD Movies Ad-Free — AMStream',
      description:
        'Explore new releases, action blockbusters, sci-fi classics, and top-rated movies with multi-server playback and Watch Rooms.',
      path: '/movies',
    });

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchNewMovies(1),
      fetchCinemetaCatalogFeed('movie'),
      fetchCinemetaShelf('movie', 'Action'),
      fetchCinemetaShelf('movie', 'Comedy'),
      fetchCinemetaShelf('movie', 'Horror'),
      fetchCinemetaShelf('movie', 'Science Fiction'),
    ])
      .then(([newest, topCin, action, comedy, horror, scifi]) => {
        if (cancelled) return;
        setHeroSlides((topCin.length ? topCin : newest).slice(0, 5));
        setItems(newest);
        setHasMore(true);
        setShelves([
          { title: 'Action Movies', items: action },
          { title: 'Comedy', items: comedy },
          { title: 'Horror', items: horror },
          { title: 'Science Fiction', items: scifi },
        ]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetchNewMovies(nextPage);
      if (!res.length) {
        setHasMore(false);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((x) => `${x.id}:${x.imdb || ''}`));
          return [...prev, ...res.filter((x) => !seen.has(`${x.id}:${x.imdb || ''}`))];
        });
        setPage(nextPage);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

  return (
    <CatalogBrowser
      heading="Movies"
      subtitle="Curated movies & genre collections ready for solo viewing or Watch Rooms"
      loading={loading}
      heroSlides={heroSlides}
      shelves={shelves}
      items={items}
      gridTitle="Latest Releases"
      showSort
      hasMore={hasMore}
      loadingMore={loadingMore}
      loadMoreLabel="Load More Movies"
      onLoadMore={loadMore}
    />
  );
}
export default MoviesPage;
