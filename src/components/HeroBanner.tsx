import React, { useEffect, useRef, useState } from 'react';
import { Bookmark, Check, Info, Play, Volume2, VolumeX } from 'lucide-react';
import heroFallbackImg from '../assets/images/hero_cinema_stage_1794695994800.jpg';
import { resolveTrailerId, stripHtml, youtubeHeroEmbedUrl } from '../lib/catalog';
import { useApp } from '../context/AppContext';
import type { MediaItem } from '../types/media';

interface HeroBannerProps {
  slides: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onMoreInfo: (item: MediaItem) => void;
}

export function HeroBanner({ slides, onPlay, onMoreInfo }: HeroBannerProps) {
  const { inMyList, toggleMyList } = useApp();
  const [index, setIndex] = useState(0);
  const [trailerIds, setTrailerIds] = useState<Record<string, string>>({});
  const [muted, setMuted] = useState(true);
  const [trailerReady, setTrailerReady] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const safeSlides = slides.slice(0, 6);
  const active = safeSlides[index] || safeSlides[0];
  const nextSlide = safeSlides.length > 1 ? safeSlides[(index + 1) % safeSlides.length] : null;

  // Resolve YouTube trailer for current + next slide
  useEffect(() => {
    let cancelled = false;
    [active, nextSlide].forEach(async (item) => {
      if (!item) return;
      const key = `${item._type}:${item.id}`;
      if (trailerIds[key] !== undefined) return;
      const yt = await resolveTrailerId(item).catch(() => '');
      if (!cancelled) {
        setTrailerIds((prev) => ({ ...prev, [key]: yt }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, nextSlide, trailerIds]);

  // Auto-advance every 10 seconds
  useEffect(() => {
    if (safeSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setTrailerReady(false);
      setIndex((i) => (i + 1) % safeSlides.length);
    }, 10000);
    return () => clearInterval(timer);
  }, [safeSlides.length]);

  const go = (next: number) => {
    if (!safeSlides.length) return;
    setTrailerReady(false);
    setIndex((next + safeSlides.length) % safeSlides.length);
  };

  if (!active) {
    return (
      <section className="relative h-[68vh] min-h-[460px] max-h-[760px] w-full overflow-hidden bg-[#090A0D]">
        <img
          src={heroFallbackImg}
          alt="AMStream Cinema Stage"
          className="w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090A0D] via-[#090A0D]/55 to-black/30" />
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-10 pb-14">
            <div className="h-8 w-56 bg-white/10 rounded animate-pulse mb-3" />
            <div className="h-4 w-80 bg-white/8 rounded animate-pulse" />
          </div>
        </div>
      </section>
    );
  }

  const activeKey = `${active._type}:${active.id}`;
  const ytId = trailerIds[activeKey] || '';
  const backdropUrl = active._backdrop || active._poster || heroFallbackImg;
  const saved = inMyList(active);
  const typeLabel = active._type === 'anime' ? 'Anime' : active._type === 'tv' ? 'Series' : 'Movie';

  return (
    <section
      className="relative h-[74vh] min-h-[480px] max-h-[820px] w-full overflow-hidden bg-[#090A0D] select-none"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(delta) > 48) go(delta < 0 ? index + 1 : index - 1);
      }}
    >
      {/* Background visual layer */}
      <img
        key={backdropUrl}
        src={backdropUrl}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = heroFallbackImg;
        }}
        alt={active._title}
        className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 ${
          ytId && trailerReady ? 'opacity-0' : 'opacity-85'
        }`}
      />

      {ytId && (
        <div className="hidden md:block absolute inset-0 pointer-events-none overflow-hidden">
          <iframe
            key={ytId}
            src={youtubeHeroEmbedUrl(ytId) + (muted ? '' : '&mute=0')}
            title={`${active._title} trailer`}
            onLoad={() => window.setTimeout(() => setTrailerReady(true), 600)}
            allow="autoplay; encrypted-media"
            className={`w-[120%] h-[120%] -ml-[10%] -mt-[5%] border-0 transition-opacity duration-700 ${
              trailerReady ? 'opacity-75' : 'opacity-0'
            }`}
          />
        </div>
      )}

      {/* Editorial dark scrims */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#090A0D] via-[#090A0D]/45 to-black/45" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#090A0D]/95 via-[#090A0D]/55 to-transparent" />

      {/* Content */}
      <div className="relative z-10 h-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col justify-end pb-12 sm:pb-16">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.18em] font-semibold text-[#F43F5E] mb-2">
            Featured {typeLabel}
          </p>
          <h1 className="font-display text-3xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-white leading-[1.06] line-clamp-2">
            {active._title || active.title}
          </h1>

          {active._sub && (
            <p className="mt-3 text-sm text-slate-300 font-medium">{active._sub}</p>
          )}

          {(active.description || active.summary) && (
            <p className="mt-3 text-sm sm:text-[15px] text-slate-300/90 leading-relaxed line-clamp-2 sm:line-clamp-3 max-w-xl">
              {stripHtml(active.description || active.summary)}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onPlay(active)}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-semibold text-sm shadow-xl shadow-[#E11D48]/30 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              Watch Now
            </button>
            <button
              type="button"
              onClick={() => onMoreInfo(active)}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white/10 hover:bg-white/18 backdrop-blur-md border border-white/15 text-white font-medium text-sm transition-colors cursor-pointer"
            >
              <Info className="w-4 h-4" />
              More Info
            </button>
            <button
              type="button"
              onClick={() => toggleMyList(active)}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-white/8 hover:bg-white/15 border border-white/12 text-slate-100 font-medium text-sm transition-colors cursor-pointer"
            >
              {saved ? <Check className="w-4 h-4 text-[#F43F5E]" /> : <Bookmark className="w-4 h-4" />}
              {saved ? 'In My List' : 'My List'}
            </button>
            {ytId && (
              <button
                type="button"
                aria-label={muted ? 'Unmute trailer' : 'Mute trailer'}
                onClick={() => setMuted((m) => !m)}
                className="hidden md:inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white/8 hover:bg-white/16 border border-white/12 text-slate-200 transition-colors cursor-pointer"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Bottom-right minimal slide dots */}
        {safeSlides.length > 1 && (
          <div className="mt-6 sm:mt-0 sm:absolute sm:right-10 sm:bottom-14 flex items-center gap-1.5">
            {safeSlides.map((slide, idx) => (
              <button
                key={`${slide._type}:${slide.id}`}
                type="button"
                aria-label={`Slide ${idx + 1}: ${slide._title}`}
                onClick={() => go(idx)}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  idx === index ? 'w-7 bg-[#E11D48]' : 'w-2 bg-white/30 hover:bg-white/55'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
