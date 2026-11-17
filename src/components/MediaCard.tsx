import React, { useMemo, useState } from 'react';
import { Play, X } from 'lucide-react';
import { posterCandidates } from '../lib/catalog';
import type { MediaItem } from '../types/media';

interface MediaCardProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  progressLabel?: string;
  progressPct?: number;
  onRemove?: (item: MediaItem) => void;
  compact?: boolean;
}

export function MediaCard({ item, onClick, progressLabel, progressPct, onRemove, compact }: MediaCardProps) {
  const candidates = useMemo(() => posterCandidates(item), [item]);
  const [imgIdx, setImgIdx] = useState(0);
  const currentSrc = candidates[imgIdx] || '';

  const initials = String(item._title || item.title || 'AM')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

  return (
    <div
      className={`group relative flex flex-col shrink-0 select-none ${
        compact ? 'w-[140px] sm:w-[158px]' : 'w-[152px] sm:w-[176px] lg:w-[188px]'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(item);
          }
        }}
        className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#12141C] border border-white/8 group-hover:border-white/25 transition-all duration-300 shadow-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E11D48]"
      >
        {currentSrc ? (
          <img
            src={currentSrc}
            alt={item._title || item.title || 'Poster'}
            loading="lazy"
            decoding="async"
            onError={() => {
              if (imgIdx + 1 < candidates.length) setImgIdx(imgIdx + 1);
              else setImgIdx(candidates.length);
            }}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1A1D29] via-[#12141C] to-[#0B0C11] p-4 text-center">
            <span className="font-display text-2xl font-bold text-white/30 tracking-wider">{initials}</span>
            <span className="mt-2 text-[11px] text-slate-400 line-clamp-2">{item._title || item.title}</span>
          </div>
        )}

        {/* Cinematic hover scrim + center play indicator */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent opacity-40 group-hover:opacity-90 transition-opacity duration-300" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="w-11 h-11 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-xl shadow-black/50">
            <Play className="w-4 h-4 fill-white ml-0.5" />
          </span>
        </div>

        {/* Single clean corner tag when resume progress is active */}
        {progressLabel && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[11px] font-medium text-white border border-white/10">
            {progressLabel}
          </div>
        )}

        {/* Bottom resume bar */}
        {typeof progressPct === 'number' && progressPct > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
            <div
              className="h-full bg-[#E11D48]"
              style={{ width: `${Math.min(100, Math.max(4, progressPct))}%` }}
            />
          </div>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${item._title || item.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item);
          }}
          className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/75 hover:bg-[#E11D48] text-slate-200 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer border border-white/15"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Unboxed clean typographic metadata */}
      <button
        type="button"
        onClick={() => onClick(item)}
        className="mt-2.5 text-left focus:outline-none cursor-pointer"
      >
        <h3 className="text-[13px] sm:text-sm font-medium text-slate-100 group-hover:text-white line-clamp-1 leading-snug">
          {item._title || item.title}
        </h3>
        {item._sub && (
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-400 line-clamp-1">
            {item._sub}
          </p>
        )}
      </button>
    </div>
  );
}
