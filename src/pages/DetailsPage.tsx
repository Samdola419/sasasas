import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, Check, Play, Share2 } from 'lucide-react';
import heroFallbackImg from '../assets/images/hero_cinema_stage_1794695994800.jpg';
import {
  fetchRelatedMedia,
  fetchTvEpisodesAndMeta,
  latestReleasedAnimeSeason,
  loadAnimeSeasonChain,
  posterCandidates,
  resolveSharedTitle,
  stripHtml,
} from '../lib/catalog';
import {
  cacheSelectedMedia,
  mediaDetailsUrl,
  mediaPlayUrl,
  progressKeyOf,
  readCachedSelectedMedia,
} from '../lib/routes';
import { applyPageSeo } from '../lib/seo';
import { useApp } from '../context/AppContext';
import { ShelfRow } from '../components/ShelfRow';
import type { MediaItem, MediaType, TvEpisode } from '../types/media';

export function DetailsPage({ type, id }: { type: MediaType; id: string }) {
  const { navigate, goBack, inMyList, toggleMyList, getWatchProgress, flashNote } = useApp();

  const [item, setItem] = useState<MediaItem | null>(() => readCachedSelectedMedia(type, id));
  const [loading, setLoading] = useState(!readCachedSelectedMedia(type, id));
  const [related, setRelated] = useState<MediaItem[]>([]);
  const [tvSeasons, setTvSeasons] = useState<Record<number, TvEpisode[]>>({});
  const [tvSeasonNums, setTvSeasonNums] = useState<number[]>([]);
  const [selectedTvSeason, setSelectedTvSeason] = useState(1);
  const [animeSeasons, setAnimeSeasons] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = readCachedSelectedMedia(type, id);
    if (cached) setItem(cached);
    setLoading(!cached);
    setRelated([]);
    setTvSeasons({});
    setTvSeasonNums([]);
    setAnimeSeasons([]);

    async function load() {
      const resolved = await resolveSharedTitle(type, id).catch(() => null);
      if (cancelled) return;
      const merged = resolved ? { ...(cached || {}), ...resolved } : cached;
      if (merged) {
        setItem(merged);
        cacheSelectedMedia(merged);
      }
      setLoading(false);

      if (!merged) return;

      if (type === 'anime' || type === 'movie' || type === 'tv') {
        fetchRelatedMedia(merged)
          .then((list) => {
            if (!cancelled) setRelated(list);
          })
          .catch(() => {});
      }

      if (type === 'anime' && Number(merged.id) > 0) {
        loadAnimeSeasonChain(Number(merged.id))
          .then((chain) => {
            if (!cancelled) setAnimeSeasons(chain);
          })
          .catch(() => {});
      }

      if (type === 'tv') {
        fetchTvEpisodesAndMeta(merged.tvmaze || merged.id, merged.imdb)
          .then((meta) => {
            if (cancelled) return;
            setTvSeasons(meta.seasons);
            setTvSeasonNums(meta.seasonList);
            if (meta.seasonList.length) setSelectedTvSeason(meta.seasonList[0]);
            if (meta.resolvedTvmazeId && !merged.tvmaze) {
              setItem((prev) => (prev ? { ...prev, tvmaze: meta.resolvedTvmazeId } : prev));
            }
          })
          .catch(() => {});
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  useEffect(() => {
    if (!item) return;
    const title = item._title || item.title || 'Title Details';
    const desc = stripHtml(item.description || item.summary || '') || `Watch ${title} ad-free or host a synchronized Watch Room on AMStream.`;
    const poster = posterCandidates(item)[0] || item._backdrop;
    const schemaType = item._type === 'movie' ? 'Movie' : 'TVSeries';
    applyPageSeo({
      title: `${title} — AMStream`,
      description: desc,
      path: mediaDetailsUrl(item),
      image: poster,
      type: item._type === 'movie' ? 'video.movie' : 'video.tv_show',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': schemaType,
        name: title,
        description: desc,
        image: poster,
        genre: (item.genres || item._genres || []).slice(0, 6),
        ...(item.averageScore
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number((item.averageScore / 10).toFixed(1)),
                bestRating: 10,
                ratingCount: 100,
              },
            }
          : {}),
      },
    });
  }, [item]);

  const handlePlay = async (ep = 1, season = 1) => {
    if (!item) return;

    // Handle NOT_YET_RELEASED anime -> check released prequel automatically
    if (item._type === 'anime' && item.status === 'NOT_YET_RELEASED' && Number(item.id) > 0) {
      const released = await latestReleasedAnimeSeason(Number(item.id));
      if (!released) {
        flashNote('This title has not premiered yet and no released prequel stream was found.');
        return;
      }
      flashNote(`Opening released prequel: ${released.title?.english || released.title?.romaji}`);
      navigate(
        mediaPlayUrl({
          _type: 'anime',
          id: released.id,
          ani_id: released.id,
          mal_id: released.idMal,
          _title: released.title?.english || released.title?.romaji,
          episodes: released.episodes,
        })
      );
      return;
    }

    cacheSelectedMedia(item);
    const prog = getWatchProgress(progressKeyOf(item));
    const useSaved = ep === 1 && season === 1 && prog;
    navigate(
      mediaPlayUrl(item, {
        episode: useSaved ? prog.e || 1 : ep,
        season: useSaved ? prog.s || 1 : season,
        t: useSaved ? prog.p || 0 : 0,
      })
    );
  };

  const handleShare = async () => {
    if (!item) return;
    const shareUrl = `${location.origin}/api/share?t=${encodeURIComponent(item._type)}&id=${encodeURIComponent(
      String(item.id || item.imdb || item.tmdb || '')
    )}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      flashNote('Share link copied to clipboard.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      flashNote(shareUrl);
    }
  };

  if (loading && !item) {
    return (
      <div className="min-h-screen pt-28 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-10 animate-pulse">
        <div className="h-72 rounded-2xl bg-white/8" />
        <div className="h-8 w-1/3 bg-white/10 rounded mt-6" />
        <div className="h-4 w-2/3 bg-white/6 rounded mt-3" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen pt-28 max-w-2xl mx-auto px-4 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Title Not Found</h1>
        <p className="text-sm text-slate-400 mt-2">This media entry could not be resolved right now.</p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 h-10 px-5 rounded-xl bg-[#E11D48] text-white text-sm font-semibold cursor-pointer"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const poster = posterCandidates(item)[0] || '';
  const backdrop = item._backdrop || poster || heroFallbackImg;
  const saved = inMyList(item);
  const prog = getWatchProgress(progressKeyOf(item));
  const genres = (item.genres || item._genres || []).slice(0, 6);
  const isSaveable = item._type === 'anime' || item._type === 'movie' || item._type === 'tv';

  return (
    <div className="min-h-screen pb-24">
      {/* Backdrop Hero */}
      <div className="relative h-[46vh] min-h-[300px] max-h-[520px] w-full overflow-hidden">
        <img
          src={backdrop}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = heroFallbackImg;
          }}
          alt={item._title}
          className="w-full h-full object-cover opacity-65"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090A0D] via-[#090A0D]/60 to-black/40" />

        <div className="absolute top-20 left-4 sm:left-8 lg:left-12 z-10">
          <button
            type="button"
            onClick={() => goBack('/')}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur border border-white/12 text-xs sm:text-sm text-slate-200 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 -mt-36 sm:-mt-44 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 sm:gap-8">
          {/* Poster */}
          <div className="w-36 sm:w-48 md:w-56 shrink-0">
            <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-[#12141C] border border-white/15 shadow-2xl">
              {poster ? (
                <img src={poster} alt={item._title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30 font-display text-3xl font-bold">
                  {(item._title || 'AM').slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Info & CTAs */}
          <div className="flex-1 min-w-0 pt-2 md:pt-14">
            <p className="text-xs uppercase tracking-[0.16em] font-semibold text-[#F43F5E]">
              {item._type === 'tv' ? 'TV Series' : item._type.toUpperCase()}
            </p>
            <h1 className="mt-1 font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
              {item._title || item.title}
            </h1>

            <p className="mt-3 text-sm text-slate-300 font-medium">
              {[
                item._year || item.seasonYear,
                item.averageScore ? `★ ${(item.averageScore / 10).toFixed(1)}` : '',
                item.episodes ? `${item.episodes} episodes` : '',
                genres.join(', '),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            {(item.description || item.summary) && (
              <p className="mt-4 text-sm sm:text-base text-slate-300/90 leading-relaxed max-w-3xl">
                {stripHtml(item.description || item.summary)}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handlePlay(1, 1)}
                className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-semibold text-sm shadow-xl shadow-[#E11D48]/30 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                {prog?.e && prog.e > 1
                  ? `Resume ${item._type === 'tv' ? `S${prog.s || 1} E${prog.e}` : `Ep ${prog.e}`}`
                  : prog?.p && prog.p > 15
                  ? 'Resume'
                  : 'Watch Now'}
              </button>

              {isSaveable && (
                <button
                  type="button"
                  onClick={() => toggleMyList(item)}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-sm font-medium text-white cursor-pointer"
                >
                  {saved ? <Check className="w-4 h-4 text-[#F43F5E]" /> : <Bookmark className="w-4 h-4" />}
                  {saved ? 'In My List' : 'Add to My List'}
                </button>
              )}

              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-white/6 hover:bg-white/12 border border-white/10 text-sm text-slate-200 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                {copied ? 'Copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>

        {/* Anime Seasons / Prequel-Sequel Chain */}
        {animeSeasons.length > 1 && (
          <section className="mt-12">
            <h2 className="font-display text-lg font-semibold text-white mb-4">Seasons & Related Installments</h2>
            <div className="flex flex-wrap gap-2.5">
              {animeSeasons.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    navigate(
                      mediaPlayUrl({
                        _type: 'anime',
                        id: s.id,
                        ani_id: s.id,
                        mal_id: s.idMal,
                        _title: s.title?.english || s.title?.romaji,
                        episodes: s.episodes,
                      })
                    )
                  }
                  className={`px-4 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    Number(s.id) === Number(item.id)
                      ? 'bg-[#E11D48]/18 border-[#E11D48]/50 text-white'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold">Season {idx + 1}</div>
                  <div className="text-xs text-slate-400 truncate max-w-[200px]">
                    {s.title?.english || s.title?.romaji}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* TV Episodes Quick-Jump */}
        {type === 'tv' && tvSeasonNums.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 className="font-display text-lg font-semibold text-white">Episodes</h2>
              <select
                aria-label="Select season"
                value={selectedTvSeason}
                onChange={(e) => setSelectedTvSeason(Number(e.target.value))}
                className="h-9 px-3 rounded-lg bg-white/8 border border-white/12 text-sm text-white focus:outline-none cursor-pointer"
              >
                {tvSeasonNums.map((s) => (
                  <option key={s} value={s} className="bg-[#12141C]">
                    Season {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(tvSeasons[selectedTvSeason] || []).map((ep) => (
                <button
                  key={`${ep.season}-${ep.number}`}
                  type="button"
                  onClick={() => handlePlay(ep.number, ep.season)}
                  className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 text-left transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[#F43F5E]">
                      S{ep.season} · E{ep.number}
                    </span>
                    <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
                  </div>
                  <div className="mt-1 text-sm font-medium text-white truncate">
                    {ep.name || `Episode ${ep.number}`}
                  </div>
                  {ep.summary && (
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">{stripHtml(ep.summary)}</p>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Related Shelf */}
      {related.length > 0 && (
        <div className="mt-14">
          <ShelfRow
            title="More Like This"
            items={related}
            onItemClick={(next) => {
              cacheSelectedMedia(next);
              navigate(mediaDetailsUrl(next));
            }}
          />
        </div>
      )}
    </div>
  );
}
export default DetailsPage;
