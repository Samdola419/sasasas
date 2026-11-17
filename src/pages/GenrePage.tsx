import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CAT_LABEL, fetchAnimeGenre } from '../lib/catalog';
import { applyPageSeo } from '../lib/seo';
import { CatalogBrowser } from '../components/CatalogBrowser';
import type { MediaItem } from '../types/media';

export function GenrePage({ genre }: { genre?: string }) {
  const genreName = useMemo(() => (genre ? decodeURIComponent(genre) : 'Trending'), [genre]);
  const displayGenre = CAT_LABEL[genreName] || genreName;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    applyPageSeo({
      title: `${displayGenre} Anime — AMStream`,
      description: `Browse top-rated and trending ${displayGenre} anime series and films with ad-free playback on AMStream.`,
      path: `/genre/${encodeURIComponent(genreName)}`,
    });

    let cancelled = false;
    setLoading(true);
    setItems([]);
    setPage(1);
    setHasMore(false);

    fetchAnimeGenre(genreName, 1)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setHasMore(res.hasNextPage);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [genreName, displayGenre]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetchAnimeGenre(genreName, nextPage);
      setItems((prev) => {
        const seen = new Set(prev.map((x) => String(x.id)));
        return [...prev, ...res.items.filter((x) => !seen.has(String(x.id)))];
      });
      setPage(nextPage);
      setHasMore(res.hasNextPage);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, genreName]);

  return (
    <CatalogBrowser
      heading={displayGenre}
      subtitle={`Explore ${displayGenre} anime`}
      loading={loading}
      items={items}
      showSort
      showAllGenresButton
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={loadMore}
      infiniteScroll
    />
  );
}
export default GenrePage;
