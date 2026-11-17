import React, { useEffect } from 'react';
import { Compass } from 'lucide-react';
import { ANIME_CATEGORIES, CAT_LABEL, MOVIE_CATEGORIES, SERIES_CATEGORIES } from '../lib/catalog';
import { applyPageSeo } from '../lib/seo';
import { useApp } from '../context/AppContext';

export function CategoriesPage() {
  const { navigate } = useApp();

  useEffect(() => {
    applyPageSeo({
      title: 'Browse Genres & Categories — AMStream',
      description:
        'Explore every Anime, Movie, and TV Series genre directory on AMStream to discover trending and classic favorites.',
      path: '/category',
    });
  }, []);

  const handleLink = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path);
  };

  return (
    <div className="min-h-screen pt-24 pb-24 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10">
      <div className="flex items-center gap-3 mb-8">
        <span className="w-10 h-10 rounded-xl bg-[#E11D48]/18 text-[#F43F5E] flex items-center justify-center">
          <Compass className="w-5 h-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">Browse Categories</h1>
          <p className="text-sm text-slate-400">Jump straight into any Anime, Movie, or TV genre</p>
        </div>
      </div>

      <div className="space-y-10">
        <section>
          <h2 className="font-display text-lg font-semibold text-white mb-4">Anime Genres</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {ANIME_CATEGORIES.map((g) => {
              const href = `/genre/${encodeURIComponent(g)}`;
              return (
                <a
                  key={g}
                  href={href}
                  onClick={(e) => handleLink(e, href)}
                  className="px-4 py-3 rounded-xl bg-white/5 hover:bg-[#E11D48]/18 border border-white/8 hover:border-[#E11D48]/40 text-left text-sm font-medium text-slate-200 hover:text-white transition-colors"
                >
                  {CAT_LABEL[g] || g}
                </a>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-white mb-4">Movie Genres</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {MOVIE_CATEGORIES.map((g) => {
              const href = `/movies?genre=${encodeURIComponent(g)}`;
              return (
                <a
                  key={g}
                  href={href}
                  onClick={(e) => handleLink(e, href)}
                  className="px-4 py-3 rounded-xl bg-white/5 hover:bg-[#E11D48]/18 border border-white/8 hover:border-[#E11D48]/40 text-left text-sm font-medium text-slate-200 hover:text-white transition-colors"
                >
                  {CAT_LABEL[g] || g}
                </a>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-white mb-4">Series Genres</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {SERIES_CATEGORIES.map((g) => {
              const href = `/series?genre=${encodeURIComponent(g)}`;
              return (
                <a
                  key={g}
                  href={href}
                  onClick={(e) => handleLink(e, href)}
                  className="px-4 py-3 rounded-xl bg-white/5 hover:bg-[#E11D48]/18 border border-white/8 hover:border-[#E11D48]/40 text-left text-sm font-medium text-slate-200 hover:text-white transition-colors"
                >
                  {CAT_LABEL[g] || g}
                </a>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
export default CategoriesPage;
