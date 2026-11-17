import React, { useId } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

export function BrandLogo({ size = 'md', showWordmark = true, className = '' }: BrandLogoProps) {
  const uid = useId().replace(/:/g, '');
  const boxClass =
    size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  const textClass =
    size === 'sm' ? 'text-base' : size === 'lg' ? 'text-xl' : 'text-lg';

  return (
    <span className={`inline-flex items-center gap-2.5 shrink-0 select-none ${className}`}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={`${boxClass} shrink-0 drop-shadow-[0_6px_18px_rgba(225,29,72,0.32)]`}
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#161926" />
            <stop offset="100%" stopColor="#08090F" />
          </linearGradient>
          <linearGradient id={`${uid}-prism`} x1="16" y1="14" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="52%" stopColor="#E11D48" />
            <stop offset="100%" stopColor="#9F1239" />
          </linearGradient>
          <linearGradient id={`${uid}-beam`} x1="27" y1="34" x2="41" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#FFE4E6" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={`url(#${uid}-bg)`} />
        <rect
          x="1.5"
          y="1.5"
          width="61"
          height="61"
          rx="14.5"
          stroke="#FB7185"
          strokeOpacity="0.34"
          strokeWidth="1.5"
        />
        <path
          d="M16 48L28.8 16H35.2L48 48H40.6L32 25.4L23.4 48H16Z"
          fill={`url(#${uid}-prism)`}
        />
        <path d="M27.5 34.5L39.5 41L27.5 47.5V34.5Z" fill={`url(#${uid}-beam)`} />
      </svg>

      {showWordmark && (
        <span className={`font-display font-bold tracking-tight text-white leading-none ${textClass}`}>
          AM<span className="text-[#F43F5E]">Stream</span>
        </span>
      )}
    </span>
  );
}
