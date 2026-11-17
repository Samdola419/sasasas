import React, { useEffect, useState } from 'react';
import { fetchUpcomingAnime } from '../lib/catalog';
import { applyPageSeo } from '../lib/seo';
import { CatalogBrowser } from '../components/CatalogBrowser';
import type { MediaItem } from '../types/media';

export function ComingSoonPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    applyPageSeo({
      title: 'Coming Soon & Upcoming Anime — AMStream',
      description:
        'Preview upcoming anime premieres, new seasons, and release schedules ahead of broadcast on AMStream.',
      path: '/coming',
    });

    let cancelled = false;
    setLoading(true);

    Promise.all([fetchUpcomingAnime(1), fetchUpcomingAnime(2).catch(() => [])])
      .then(([p1, p2]) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const combined = [...p1, ...p2].filter((x) => {
          const k = String(x.id);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setItems(combined);
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
      heading="Coming Soon"
      subtitle="Upcoming anime series & premieres"
      loading={loading}
      items={items}
      showSort
    />
  );
}
export default ComingSoonPage;
