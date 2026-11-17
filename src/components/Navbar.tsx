import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Clock,
  Compass,
  Film,
  Home,
  LayoutGrid,
  LogOut,
  Search,
  Sparkles,
  Tv,
  User as UserIcon,
  Users,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BrandLogo } from './BrandLogo';

export function Navbar() {
  const {
    route,
    navigate,
    user,
    profile,
    setSearchOpen,
    openAuthModal,
    setJoinRoomModalOpen,
    logout,
    activeRoomId,
  } = useApp();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pathname = route.split('?')[0] || '/';
  const isPlayerOrRoom = pathname.startsWith('/play/') || pathname.startsWith('/room/');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen]);

  if (isPlayerOrRoom) return null;

  const isActive = (prefix: string) => {
    if (prefix === '/') return pathname === '/';
    return pathname.startsWith(prefix);
  };

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'Anime', path: '/anime' },
    { label: 'Movies', path: '/movies' },
    { label: 'Series', path: '/series' },
  ];

  const handleLinkNav = (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-colors duration-300 ${
          scrolled ? 'bg-[#090A0D]/92 backdrop-blur-xl border-b border-white/8' : 'bg-gradient-to-b from-[#090A0D]/90 via-[#090A0D]/55 to-transparent'
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-4">
          {/* Left: Original Brand Logo */}
          <a
            href="/"
            onClick={(e) => handleLinkNav(e, '/')}
            aria-label="AMStream Home"
            className="flex items-center shrink-0 group focus:outline-none"
          >
            <BrandLogo className="group-hover:opacity-95 transition-opacity" />
          </a>

          {/* Center: Clean single-line multi-page links */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8" aria-label="Primary navigation">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <a
                  key={item.path}
                  href={item.path}
                  onClick={(e) => handleLinkNav(e, item.path)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative py-1 text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#E11D48] rounded-full" />
                  )}
                </a>
              );
            })}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search titles"
              className="flex items-center gap-2 h-9 px-3 rounded-lg bg-white/6 hover:bg-white/12 border border-white/8 text-sm text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span className="hidden lg:inline text-xs text-slate-400">Search</span>
              <kbd className="hidden xl:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-black/30 rounded border border-white/10">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() => setJoinRoomModalOpen(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/6 hover:bg-white/12 border border-white/10 text-xs sm:text-sm font-medium text-slate-100 whitespace-nowrap transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4 text-[#F43F5E]" />
              <span className="hidden sm:inline">{activeRoomId ? 'Room' : 'Watch Room'}</span>
            </button>

            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 h-9 pl-2 pr-2.5 rounded-lg bg-white/8 hover:bg-white/14 border border-white/10 text-sm text-white transition-colors cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-md bg-[#E11D48]/25 text-[#F43F5E] font-semibold text-xs flex items-center justify-center">
                    {(profile?.displayName || user.email || 'A').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:inline max-w-[110px] truncate font-medium">
                    {profile?.displayName || 'Account'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-xl bg-[#12141C] border border-white/10 shadow-2xl py-1.5 z-50">
                    <div className="px-3.5 py-2 border-b border-white/8">
                      <p className="text-sm font-semibold text-white truncate">
                        {profile?.displayName || 'AMStream Member'}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                    </div>
                    <a
                      href="/account"
                      onClick={(e) => handleLinkNav(e, '/account')}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/6 transition-colors"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" /> Account & Sync
                    </a>
                    <a
                      href="/list"
                      onClick={(e) => handleLinkNav(e, '/list')}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/6 transition-colors"
                    >
                      <Bookmark className="w-4 h-4 text-slate-400" /> My List
                    </a>
                    <a
                      href="/continue"
                      onClick={(e) => handleLinkNav(e, '/continue')}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/6 transition-colors"
                    >
                      <Clock className="w-4 h-4 text-slate-400" /> Continue Watching
                    </a>
                    <a
                      href="/category"
                      onClick={(e) => handleLinkNav(e, '/category')}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/6 transition-colors"
                    >
                      <LayoutGrid className="w-4 h-4 text-slate-400" /> All Categories
                    </a>
                    <a
                      href="/coming"
                      onClick={(e) => handleLinkNav(e, '/coming')}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-200 hover:bg-white/6 transition-colors"
                    >
                      <Sparkles className="w-4 h-4 text-slate-400" /> Coming Soon
                    </a>
                    <div className="my-1 border-t border-white/8" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <a
                  href="/category"
                  onClick={(e) => handleLinkNav(e, '/category')}
                  title="Browse Categories"
                  className="hidden sm:flex items-center justify-center h-9 w-9 rounded-lg bg-white/6 hover:bg-white/12 border border-white/8 text-slate-300 hover:text-white transition-colors"
                >
                  <Compass className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="h-9 px-3.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-semibold text-white whitespace-nowrap transition-colors cursor-pointer shadow-md shadow-[#E11D48]/20"
                >
                  Sign In
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Thumb-Zone Bottom Bar (<= 64px height) */}
      <nav
        aria-label="Mobile quick navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-15 bg-[#090A0D]/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]"
      >
        {[
          { label: 'Home', path: '/', icon: Home },
          { label: 'Anime', path: '/anime', icon: Sparkles },
          { label: 'Movies', path: '/movies', icon: Film },
          { label: 'Series', path: '/series', icon: Tv },
        ].map(({ label, path, icon: Icon }) => {
          const active = isActive(path);
          return (
            <a
              key={path}
              href={path}
              onClick={(e) => handleLinkNav(e, path)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 px-2 text-[11px] font-medium transition-colors ${
                active ? 'text-[#F43F5E]' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
