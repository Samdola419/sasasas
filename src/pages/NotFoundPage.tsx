import React, { useEffect } from 'react';
import { Compass, Home, Search } from 'lucide-react';
import { applyPageSeo } from '../lib/seo';
import { useApp } from '../context/AppContext';
import { BrandLogo } from '../components/BrandLogo';

export function NotFoundPage({ path }: { path?: string }) {
  const { navigate, setSearchOpen } = useApp();

  useEffect(() => {
    applyPageSeo({
      title: 'Page Not Found — AMStream',
      description: 'The requested page could not be found on AMStream. Browse Anime, Movies, and TV Series instead.',
      path: path || '/404',
      robots: 'noindex, nofollow',
    });
  }, [path]);

  return (
    <div className="min-h-[82vh] pt-28 pb-24 px-4 flex items-center justify-center">
      <div className="max-w-lg w-full text-center rounded-2xl bg-[#0F1118] border border-white/10 p-8 shadow-2xl">
        <div className="flex justify-center mb-5">
          <BrandLogo size="lg" />
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#F43F5E] mb-2">Error 404</p>
        <h1 className="font-display text-3xl font-bold text-white tracking-tight">Page not found</h1>
        <p className="text-sm text-slate-400 mt-2.5 leading-relaxed">
          We couldn’t find <span className="font-mono text-slate-300">{path || 'that route'}</span>. Jump back home or explore our genres.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              navigate('/');
            }}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-sm font-semibold text-white transition-colors"
          >
            <Home className="w-4 h-4" />
            Back Home
          </a>
          <a
            href="/category"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              navigate('/category');
            }}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-sm font-medium text-slate-200 transition-colors"
          >
            <Compass className="w-4 h-4" />
            Categories
          </a>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-sm font-medium text-slate-200 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
            Search
          </button>
        </div>
      </div>
    </div>
  );
}
export default NotFoundPage;
