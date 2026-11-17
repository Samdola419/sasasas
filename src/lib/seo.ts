export interface PageSeoConfig {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: 'website' | 'video.movie' | 'video.tv_show' | 'video.episode' | 'article';
  robots?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

export const SITE_NAME = 'AMStream';
export const DEFAULT_TITLE = 'AMStream — Watch Anime, Movies, Series & Watch Rooms';
export const DEFAULT_DESCRIPTION =
  'Stream anime, movies, and TV series ad-free with synced 4-viewer Watch Rooms, instant skip controls, and Firebase cloud watchlist sync.';

function setMetaTag(attr: 'name' | 'property', key: string, content: string): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(url: string): void {
  if (typeof document === 'undefined') return;
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function setJsonLd(data?: Record<string, unknown> | Record<string, unknown>[]): void {
  if (typeof document === 'undefined') return;
  const id = 'amstream-dynamic-jsonld';
  const existing = document.getElementById(id);
  if (!data) {
    existing?.remove();
    return;
  }
  const script = existing || document.createElement('script');
  script.id = id;
  script.setAttribute('type', 'application/ld+json');
  script.textContent = JSON.stringify(data);
  if (!existing) document.head.appendChild(script);
}

export function applyPageSeo(config: PageSeoConfig): void {
  if (typeof document === 'undefined') return;
  const title = config.title || DEFAULT_TITLE;
  const description = (config.description || DEFAULT_DESCRIPTION).slice(0, 165);
  const path = config.path || window.location.pathname || '/';
  const canonicalUrl = `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
  const ogImage = config.image || `${window.location.origin}/api/cover`;
  const ogType = config.type || 'website';
  const robots = config.robots || 'index, follow';

  document.title = title;
  setMetaTag('name', 'description', description);
  setMetaTag('name', 'robots', robots);
  setMetaTag('property', 'og:site_name', SITE_NAME);
  setMetaTag('property', 'og:type', ogType);
  setMetaTag('property', 'og:title', title);
  setMetaTag('property', 'og:description', description);
  setMetaTag('property', 'og:url', canonicalUrl);
  setMetaTag('property', 'og:image', ogImage);
  setMetaTag('name', 'twitter:card', 'summary_large_image');
  setMetaTag('name', 'twitter:title', title);
  setMetaTag('name', 'twitter:description', description);
  setMetaTag('name', 'twitter:image', ogImage);
  setCanonical(canonicalUrl);
  setJsonLd(
    config.jsonLd || {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: SITE_NAME,
      url: canonicalUrl,
      applicationCategory: 'EntertainmentApplication',
      operatingSystem: 'All',
      description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    }
  );
}
