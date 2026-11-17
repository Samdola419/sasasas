export const EXOCLICK_VAST_URL = 'https://s.magsrv.com/v1/vast.php?idz=6051704';

export interface VastTrackingEvent {
  event: string;
  offsetSec?: number;
  offsetPct?: number;
  url: string;
}

export interface ParsedVastAd {
  id: string;
  title: string;
  ctaText: string;
  displayUrl: string;
  mediaUrl: string;
  mediaType: string;
  posterUrl?: string;
  clickThroughUrl: string;
  clickTrackingUrls: string[];
  impressionUrls: string[];
  trackingEvents: VastTrackingEvent[];
}

export type GridSlot<T> =
  | { kind: 'item'; item: T; itemIndex: number }
  | { kind: 'ad'; adKey: string };

const MAX_CONCURRENT_VAST = 4;
let activeVastFetches = 0;
const vastWaitQueue: (() => void)[] = [];

function acquireVastSlot(): Promise<void> {
  if (activeVastFetches < MAX_CONCURRENT_VAST) {
    activeVastFetches++;
    return Promise.resolve();
  }
  return new Promise((resolve) => vastWaitQueue.push(resolve));
}

function releaseVastSlot(): void {
  activeVastFetches = Math.max(0, activeVastFetches - 1);
  const next = vastWaitQueue.shift();
  if (next) {
    activeVastFetches++;
    next();
  }
}

function textOf(el: Element | null | undefined): string {
  return (el?.textContent || '').trim();
}

function allTexts(root: ParentNode, selector: string): string[] {
  const out: string[] = [];
  root.querySelectorAll(selector).forEach((el) => {
    const val = textOf(el);
    if (/^https?:\/\//i.test(val)) out.push(val);
  });
  return out;
}

function parseClockOffset(raw: string | null): { offsetSec?: number; offsetPct?: number } {
  const v = String(raw || '').trim();
  if (!v) return {};
  if (v.endsWith('%')) {
    const pct = Number(v.slice(0, -1));
    return Number.isFinite(pct) ? { offsetPct: pct } : {};
  }
  const parts = v.split(':').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return { offsetSec: parts[0] * 3600 + parts[1] * 60 + parts[2] };
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return { offsetSec: parts[0] * 60 + parts[1] };
  }
  const sec = Number(v);
  return Number.isFinite(sec) ? { offsetSec: sec } : {};
}

function pickBestMediaFile(adRoot: Element): { url: string; type: string } | null {
  const files: { url: string; type: string; bitrate: number; width: number }[] = [];
  adRoot.querySelectorAll('MediaFiles > MediaFile').forEach((el) => {
    const url = textOf(el);
    if (!/^https?:\/\//i.test(url)) return;
    const type = (el.getAttribute('type') || 'video/mp4').toLowerCase();
    const bitrate = Number(el.getAttribute('bitrate')) || 0;
    const width = Number(el.getAttribute('width')) || 0;
    files.push({ url, type, bitrate, width });
  });
  if (!files.length) return null;

  // Prefer MP4 / WebM progressive streams compatible with HTML5 <video>
  const preferred = files.filter((f) => /mp4|webm/i.test(f.type) || /\.(mp4|webm)(\?|$)/i.test(f.url));
  const pool = preferred.length ? preferred : files;
  pool.sort((a, b) => b.width - a.width || b.bitrate - a.bitrate);
  return { url: pool[0].url, type: pool[0].type };
}

function pickPosterImage(adRoot: Element): string {
  const selectors = [
    'CompanionAds StaticResource',
    'NonLinearAds StaticResource',
    'MediaFiles StaticResource',
  ];
  for (const sel of selectors) {
    const nodes = adRoot.querySelectorAll(sel);
    for (const n of Array.from(nodes)) {
      const ctype = (n.getAttribute('creativeType') || '').toLowerCase();
      const val = textOf(n);
      if (/^https?:\/\//i.test(val) && (!ctype || ctype.startsWith('image/'))) {
        return val;
      }
    }
  }
  return '';
}

async function fetchXmlText(url: string): Promise<string> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? window.setTimeout(() => ctl.abort(), 8000) : null;
  try {
    const sep = url.includes('?') ? '&' : '?';
    const bustUrl = `${url}${sep}_cb=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const res = await fetch(bustUrl, {
      cache: 'no-store',
      signal: ctl?.signal,
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchExoVastAd(vastUrl = EXOCLICK_VAST_URL): Promise<ParsedVastAd | null> {
  if (typeof DOMParser === 'undefined') return null;

  await acquireVastSlot();
  try {
    let currentUrl = vastUrl;
    const mergedImpressions: string[] = [];
    const mergedClickTrackings: string[] = [];
    const mergedTrackings: VastTrackingEvent[] = [];

    for (let hop = 0; hop < 3 && currentUrl; hop++) {
      const xmlText = await fetchXmlText(currentUrl);
      if (!xmlText || !/<VAST[\s>]/i.test(xmlText)) return null;

      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      const adEl = doc.querySelector('VAST > Ad');
      if (!adEl) return null;

      const adId = adEl.getAttribute('id') || `vast-${Date.now()}`;
      const wrapper = adEl.querySelector('Wrapper');
      if (wrapper) {
        mergedImpressions.push(...allTexts(wrapper, 'Impression'));
        mergedClickTrackings.push(...allTexts(wrapper, 'VideoClicks > ClickTracking'));
        wrapper.querySelectorAll('TrackingEvents > Tracking').forEach((tr) => {
          const tUrl = textOf(tr);
          const ev = tr.getAttribute('event') || '';
          if (ev && /^https?:\/\//i.test(tUrl)) {
            mergedTrackings.push({ event: ev, ...parseClockOffset(tr.getAttribute('offset')), url: tUrl });
          }
        });
        const nextTag = textOf(wrapper.querySelector('VASTAdTagURI'));
        if (!/^https?:\/\//i.test(nextTag)) return null;
        currentUrl = nextTag;
        continue;
      }

      const inline = adEl.querySelector('InLine');
      if (!inline) return null;

      mergedImpressions.push(...allTexts(inline, 'Impression'));
      mergedClickTrackings.push(...allTexts(inline, 'VideoClicks > ClickTracking'));
      inline.querySelectorAll('TrackingEvents > Tracking').forEach((tr) => {
        const tUrl = textOf(tr);
        const ev = tr.getAttribute('event') || '';
        if (ev && /^https?:\/\//i.test(tUrl)) {
          mergedTrackings.push({ event: ev, ...parseClockOffset(tr.getAttribute('offset')), url: tUrl });
        }
      });

      const bestMedia = pickBestMediaFile(inline);
      const posterUrl = pickPosterImage(inline);
      if (!bestMedia && !posterUrl) return null;

      const clickThroughUrl =
        textOf(inline.querySelector('VideoClicks > ClickThrough')) ||
        textOf(inline.querySelector('NonLinearClickThrough')) ||
        textOf(inline.querySelector('CompanionClickThrough')) ||
        '';
      if (!/^https?:\/\//i.test(clickThroughUrl)) return null;

      const extTracking = textOf(inline.querySelector('Extensions TitleCTA > Tracking'));
      if (/^https?:\/\//i.test(extTracking)) mergedClickTrackings.push(extTracking);

      const adTitle = textOf(inline.querySelector('AdTitle'));
      const pcText = textOf(inline.querySelector('TitleCTA > PCText'));
      const mobileText = textOf(inline.querySelector('TitleCTA > MobileText'));
      const displayUrl = textOf(inline.querySelector('TitleCTA > DisplayUrl')).replace(/^https?:\/\//i, '');

      const ctaText = pcText || mobileText || 'Learn More';
      const title = adTitle || ctaText || displayUrl || 'Sponsored';

      return {
        id: adId,
        title,
        ctaText,
        displayUrl: displayUrl || 'Sponsored',
        mediaUrl: bestMedia?.url || '',
        mediaType: bestMedia?.type || 'video/mp4',
        posterUrl: posterUrl || undefined,
        clickThroughUrl,
        clickTrackingUrls: [...new Set(mergedClickTrackings)],
        impressionUrls: [...new Set(mergedImpressions)],
        trackingEvents: mergedTrackings,
      };
    }

    return null;
  } finally {
    releaseVastSlot();
  }
}

export function fireVastBeacon(url: string): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  try {
    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.src = url;
      return;
    }
  } catch {
    // fallback below
  }
  try {
    fetch(url, { mode: 'no-cors', keepalive: true }).catch(() => {});
  } catch {
    // ignore tracking failures
  }
}

export function pickRowAdSlot(itemCount: number): number {
  if (itemCount <= 0) return -1;
  const maxIndex = Math.min(5, itemCount + 1);
  return Math.floor(Math.random() * maxIndex);
}

/**
 * Places 1 ad box per 9-item chunk so:
 * - Opening a category places the first ad randomly within the first 5 boxes.
 * - Additional ads repeat every 9 shows across PC and mobile grids.
 */
export function buildGridSlotsWithAds<T>(
  items: T[],
  randomSeeds: number[],
  every = 9
): GridSlot<T>[] {
  if (!items.length) return [];
  const slots: GridSlot<T>[] = [];
  const totalChunks = Math.ceil(items.length / every);

  for (let c = 0; c < totalChunks; c++) {
    const start = c * every;
    const chunk = items.slice(start, start + every);
    const seed = typeof randomSeeds[c] === 'number' ? randomSeeds[c] : Math.random();
    const maxPos = Math.min(5, chunk.length + 1);
    const insertAt = Math.min(chunk.length, Math.floor(seed * maxPos));

    for (let i = 0; i <= chunk.length; i++) {
      if (i === insertAt) {
        slots.push({ kind: 'ad', adKey: `ad-${c}` });
      }
      if (i < chunk.length) {
        slots.push({ kind: 'item', item: chunk[i], itemIndex: start + i });
      }
    }
  }

  return slots;
}
