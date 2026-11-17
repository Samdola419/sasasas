import React, { useEffect, useState } from 'react';
import { fetchCinemetaCatalogFeed, fetchCinemetaShelf, fetchTvmazePopular } from '../lib/catalog';
import { applyPageSeo } from '../lib/seo';
import { CatalogBrowser, type CatalogShelf } from '../components/CatalogBrowser';
import type { MediaItem } from '../types/media';

export function SeriesPage() {
  const [loading, setLoading] = useState(true);
  const [heroSlides, setHeroSlides] = useState<MediaItem[]>([]);
  const [shelves, setShelves] = useState<CatalogShelf[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    applyPageSeo({
      title: 'Watch TV Series Online — AMStream',
      description:
        'Binge popular TV shows, dramas, crime thrillers, and fantasy series with episode memory and synchronized Watch Rooms.',
      path: '/series',
    });

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchTvmazePopular(),
      fetchCinemetaCatalogFeed('series'),
      fetchCinemetaShelf('series', 'Drama'),
      fetchCinemetaShelf('series', 'Crime'),
      fetchCinemetaShelf('series', 'Fantasy'),
      fetchCinemetaShelf('series', 'Animation'),
    ])
      .then(([popular, cinSeries, drama, crime, fantasy, animation]) => {
        if (cancelled) return;
        setHeroSlides((cinSeries.length ? cinSeries : popular).slice(0, 5));
        setItems(popular);
        setShelves([
          { title: 'Top Cinemeta Series', items: cinSeries },
          { title: 'Drama', items: drama },
          { title: 'Crime', items: crime },
          { title: 'Fantasy', items: fantasy },
          { title: 'Animation', items: animation },
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
      heading="TV Series"
      subtitle="Curated TV shows & season collections with synced episode resume"
      loading={loading}
      heroSlides={heroSlides}
      shelves={shelves}
      items={items}
      gridTitle="All Popular Series"
      showSort
    />
  );
}
export default SeriesPage;
