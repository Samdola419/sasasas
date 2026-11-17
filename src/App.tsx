import React, { lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { BrandLogo } from './components/BrandLogo';
import { SearchOverlay } from './components/SearchOverlay';
import { AuthModal } from './components/AuthModal';
import { JoinRoomModal, ToastViewport } from './components/RoomModals';
import type { MediaType, PlayableMediaType } from './types/media';

// Code-split dedicated page modules (1 file per page)
const HomePage = lazy(() => import('./pages/HomePage'));
const AnimePage = lazy(() => import('./pages/AnimePage'));
const MoviesPage = lazy(() => import('./pages/MoviesPage'));
const SeriesPage = lazy(() => import('./pages/SeriesPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'));
const GenrePage = lazy(() => import('./pages/GenrePage'));
const DetailsPage = lazy(() => import('./pages/DetailsPage'));
const WatchPage = lazy(() => import('./pages/WatchPage'));
const WatchRoomPage = lazy(() => import('./pages/WatchRoomPage'));
const MyListPage = lazy(() => import('./pages/MyListPage'));
const ContinuePage = lazy(() => import('./pages/ContinuePage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="min-h-screen pt-24 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 animate-pulse">
      <div className="h-64 rounded-2xl bg-white/[0.04]" />
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-xl bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

function RouterView() {
  const { route, navigate } = useApp();
  const pathname = route.split('?')[0] || '/';

  let content: React.ReactNode = <NotFoundPage path={pathname} />;
  let hideChromeFooter = false;

  if (pathname === '/' || pathname === '') {
    content = <HomePage />;
  } else if (pathname === '/anime') {
    content = <AnimePage />;
  } else if (pathname === '/movies') {
    content = <MoviesPage />;
  } else if (pathname === '/series') {
    content = <SeriesPage />;
  } else if (pathname === '/category') {
    content = <CategoriesPage />;
  } else if (pathname === '/coming') {
    content = <ComingSoonPage />;
  } else if (pathname.startsWith('/genre/')) {
    content = <GenrePage genre={pathname.slice(7)} />;
  } else if (pathname.startsWith('/t/')) {
    const parts = pathname.slice(3).split('/');
    const type = decodeURIComponent(parts[0] || 'anime') as MediaType;
    const id = decodeURIComponent(parts[1] || '');
    content = id ? <DetailsPage type={type} id={id} /> : <NotFoundPage path={pathname} />;
  } else if (pathname.startsWith('/play/')) {
    hideChromeFooter = true;
    const parts = pathname.slice(6).split('/');
    const rawType = decodeURIComponent(parts[0] || 'anime');
    const playType: PlayableMediaType = rawType === 'movie' ? 'movie' : rawType === 'tv' ? 'tv' : 'anime';
    const playId = decodeURIComponent(parts[1] || '');
    content = playId ? <WatchPage playType={playType} playId={playId} /> : <NotFoundPage path={pathname} />;
  } else if (pathname.startsWith('/room/')) {
    hideChromeFooter = true;
    const code = decodeURIComponent(pathname.slice(6).split('/')[0] || '');
    content = code ? <WatchRoomPage roomCode={code} /> : <NotFoundPage path={pathname} />;
  } else if (pathname === '/list') {
    content = <MyListPage />;
  } else if (pathname === '/continue') {
    content = <ContinuePage />;
  } else if (pathname === '/account') {
    content = <AccountPage />;
  }

  const handleFooterLink = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-[#090A0D] text-[#F1F5F9] flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageFallback />}>{content}</Suspense>
      </main>

      {!hideChromeFooter && (
        <footer className="border-t border-white/8 py-8 pb-24 md:pb-8 bg-[#08090C]">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2.5">
              <a href="/" onClick={(e) => handleFooterLink(e, '/')}>
                <BrandLogo size="sm" />
              </a>
              <span className="text-slate-500">· Anime, Movies, Series &amp; Synced Watch Rooms</span>
            </div>
            <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-4">
              <a href="/anime" onClick={(e) => handleFooterLink(e, '/anime')} className="hover:text-white transition-colors">
                Anime
              </a>
              <a href="/movies" onClick={(e) => handleFooterLink(e, '/movies')} className="hover:text-white transition-colors">
                Movies
              </a>
              <a href="/series" onClick={(e) => handleFooterLink(e, '/series')} className="hover:text-white transition-colors">
                Series
              </a>
              <a href="/category" onClick={(e) => handleFooterLink(e, '/category')} className="hover:text-white transition-colors">
                Categories
              </a>
              <a href="/coming" onClick={(e) => handleFooterLink(e, '/coming')} className="hover:text-white transition-colors">
                Coming Soon
              </a>
              <a href="/list" onClick={(e) => handleFooterLink(e, '/list')} className="hover:text-white transition-colors">
                My List
              </a>
              <a href="/account" onClick={(e) => handleFooterLink(e, '/account')} className="hover:text-white transition-colors">
                Account
              </a>
            </nav>
          </div>
        </footer>
      )}

      <SearchOverlay />
      <AuthModal />
      <JoinRoomModal />
      <ToastViewport />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <RouterView />
    </AppProvider>
  );
}
