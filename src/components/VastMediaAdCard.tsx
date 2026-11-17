import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import {
  buildGridSlotsWithAds,
  EXOCLICK_VAST_URL,
  fetchExoVastAd,
  fireVastBeacon,
  type GridSlot,
  type ParsedVastAd,
} from '../lib/vast';

export function useGridSlotsWithAds<T>(items: T[], every = 9): GridSlot<T>[] {
  const seedsRef = useRef<number[]>([]);
  return useMemo(() => {
    const needed = Math.ceil(items.length / every);
    while (seedsRef.current.length < needed) {
      seedsRef.current.push(Math.random());
    }
    return buildGridSlotsWithAds(items, seedsRef.current, every);
  }, [items, every]);
}

interface VastMediaAdCardProps {
  compact?: boolean;
  variant?: 'card' | 'rail';
  vastUrl?: string;
}

export function VastMediaAdCard({
  compact = false,
  variant = 'card',
  vastUrl = EXOCLICK_VAST_URL,
}: VastMediaAdCardProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inViewNear, setInViewNear] = useState(false);
  const [visibleForImp, setVisibleForImp] = useState(false);
  const [ad, setAd] = useState<ParsedVastAd | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');

  const impSentRef = useRef(false);
  const firedEventsRef = useRef<Set<string>>(new Set());

  // Trigger fetch eagerly when vertically near viewport, track impression when visibly onscreen
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.top < (window.innerHeight || 900) + 600) {
      setInViewNear(true);
    }

    if (typeof IntersectionObserver === 'undefined') {
      setInViewNear(true);
      setVisibleForImp(true);
      return;
    }

    const nearObs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInViewNear(true);
          nearObs.disconnect();
        }
      },
      { rootMargin: '600px' }
    );

    const impObs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleForImp(true);
          impObs.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    nearObs.observe(el);
    impObs.observe(el);
    return () => {
      nearObs.disconnect();
      impObs.disconnect();
    };
  }, []);

  // Load VAST creative cleanly without self-canceling via status state
  useEffect(() => {
    if (!inViewNear) return;
    let cancelled = false;
    setStatus('loading');
    setAd(null);
    impSentRef.current = false;
    firedEventsRef.current.clear();

    fetchExoVastAd(vastUrl)
      .then((parsed) => {
        if (cancelled) return;
        if (parsed) {
          setAd(parsed);
          setStatus('ready');
        } else {
          setStatus('empty');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('empty');
      });

    return () => {
      cancelled = true;
    };
  }, [inViewNear, vastUrl]);

  // Ensure muted inline video autoplays reliably across Chrome/Safari/Mobile
  useEffect(() => {
    const v = videoRef.current;
    if (status !== 'ready' || !v) return;
    v.muted = true;
    v.play().catch(() => {});
  }, [status, ad]);

  // Fire VAST Impression URLs once creative is ready & card is visible
  useEffect(() => {
    if (status !== 'ready' || !ad || !visibleForImp || impSentRef.current) return;
    impSentRef.current = true;
    ad.impressionUrls.forEach(fireVastBeacon);
  }, [status, ad, visibleForImp]);

  const emitTrackEvent = (key: string, url: string) => {
    if (firedEventsRef.current.has(key)) return;
    firedEventsRef.current.add(key);
    fireVastBeacon(url);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !ad || !v.duration || !Number.isFinite(v.duration)) return;
    const t = v.currentTime;
    const pct = (t / v.duration) * 100;

    ad.trackingEvents.forEach((tr, idx) => {
      const k = `${tr.event}:${idx}`;
      if (firedEventsRef.current.has(k)) return;
      if (tr.event === 'start' && t > 0.1) emitTrackEvent(k, tr.url);
      else if (tr.event === 'firstQuartile' && pct >= 25) emitTrackEvent(k, tr.url);
      else if (tr.event === 'midpoint' && pct >= 50) emitTrackEvent(k, tr.url);
      else if (tr.event === 'thirdQuartile' && pct >= 75) emitTrackEvent(k, tr.url);
      else if (tr.event === 'progress') {
        if (typeof tr.offsetSec === 'number' && t >= tr.offsetSec) emitTrackEvent(k, tr.url);
        else if (typeof tr.offsetPct === 'number' && pct >= tr.offsetPct) emitTrackEvent(k, tr.url);
      }
    });
  };

  const handleVideoEnded = () => {
    if (!ad) return;
    ad.trackingEvents.forEach((tr, idx) => {
      if (tr.event === 'complete') emitTrackEvent(`complete:${idx}`, tr.url);
    });
  };

  const handleAdClick = () => {
    if (!ad) return;
    ad.clickTrackingUrls.forEach(fireVastBeacon);
  };

  if (status === 'empty') return null;

  if (variant === 'rail') {
    if (status !== 'ready' || !ad) {
      return (
        <div ref={rootRef} className="w-full flex items-center gap-3.5 p-2 rounded-xl animate-pulse">
          <div className="w-16 aspect-[2/3] rounded-lg bg-white/8 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3.5 w-3/4 bg-white/8 rounded" />
            <div className="h-3 w-1/2 bg-white/5 rounded" />
          </div>
        </div>
      );
    }

    return (
      <div ref={rootRef}>
        <a
          href={ad.clickThroughUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleAdClick}
          className="group w-full flex items-center gap-3.5 p-2 rounded-xl hover:bg-white/[0.05] border border-transparent hover:border-white/8 text-left transition-colors"
        >
          <div className="relative w-16 aspect-[2/3] rounded-lg overflow-hidden bg-[#12151E] border border-white/10 shrink-0">
            {ad.mediaUrl ? (
              <video
                ref={videoRef}
                src={ad.mediaUrl}
                poster={ad.posterUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                onCanPlay={() => {
                  const v = videoRef.current;
                  if (v) {
                    v.muted = true;
                    v.play().catch(() => {});
                  }
                }}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                onError={() => setStatus('empty')}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : ad.posterUrl ? (
              <img
                src={ad.posterUrl}
                alt={ad.title}
                loading="lazy"
                onError={() => setStatus('empty')}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : null}
            <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded bg-black/80 text-[9px] font-semibold uppercase tracking-wider text-slate-200 border border-white/10">
              Ad
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-slate-100 group-hover:text-white line-clamp-2 leading-snug">
              {ad.title}
            </h3>
            <p className="mt-1 text-xs text-slate-400 truncate">
              Sponsored · {ad.displayUrl}
            </p>
            <p className="mt-0.5 text-[11px] text-[#FB7185] truncate">{ad.ctaText}</p>
          </div>
        </a>
      </div>
    );
  }

  // Standard 2:3 Portrait Card matching MediaCard geometry identically
  if (status !== 'ready' || !ad) {
    return (
      <div
        ref={rootRef}
        className={`flex flex-col shrink-0 select-none animate-pulse ${
          compact ? 'w-[140px] sm:w-[158px]' : 'w-[152px] sm:w-[176px] lg:w-[188px]'
        }`}
      >
        <div className="aspect-[2/3] w-full rounded-xl bg-white/6 border border-white/5" />
        <div className="h-3.5 w-3/4 bg-white/8 rounded mt-2.5" />
        <div className="h-3 w-1/2 bg-white/5 rounded mt-1.5" />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`group relative flex flex-col shrink-0 select-none ${
        compact ? 'w-[140px] sm:w-[158px]' : 'w-[152px] sm:w-[176px] lg:w-[188px]'
      }`}
    >
      <a
        href={ad.clickThroughUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleAdClick}
        aria-label={`${ad.title} — Sponsored`}
        className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#12141C] border border-white/8 group-hover:border-white/25 transition-all duration-300 shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E11D48] block"
      >
        {ad.mediaUrl ? (
          <video
            ref={videoRef}
            src={ad.mediaUrl}
            poster={ad.posterUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onCanPlay={() => {
              const v = videoRef.current;
              if (v) {
                v.muted = true;
                v.play().catch(() => {});
              }
            }}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
            onError={() => setStatus('empty')}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : ad.posterUrl ? (
          <img
            src={ad.posterUrl}
            alt={ad.title}
            loading="lazy"
            decoding="async"
            onError={() => setStatus('empty')}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : null}

        {/* Cinematic hover scrim + center action indicator matching MediaCard */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-40 group-hover:opacity-90 transition-opacity duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="w-11 h-11 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-xl shadow-black/50">
            {ad.mediaUrl ? <Play className="w-4 h-4 fill-white ml-0.5" /> : <ExternalLink className="w-4 h-4" />}
          </span>
        </div>

        {/* Clean corner Ad indicator matching MediaCard corner tag style */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] font-semibold uppercase tracking-wider text-slate-200 border border-white/10">
          Ad
        </div>
      </a>

      {/* Unboxed clean typographic metadata matching MediaCard */}
      <a
        href={ad.clickThroughUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleAdClick}
        className="mt-2.5 text-left focus:outline-none cursor-pointer block"
      >
        <h3 className="text-[13px] sm:text-sm font-medium text-slate-100 group-hover:text-white line-clamp-1 leading-snug">
          {ad.title}
        </h3>
        <p className="mt-0.5 text-[11px] sm:text-xs text-slate-400 line-clamp-1">
          {[ad.displayUrl, ad.ctaText && ad.ctaText !== ad.title ? ad.ctaText : 'Sponsored']
            .filter(Boolean)
            .join(' · ')}
        </p>
      </a>
    </div>
  );
}
