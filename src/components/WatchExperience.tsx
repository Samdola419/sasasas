import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Copy,
  Crown,
  Link2,
  ListVideo,
  LogOut,
  Maximize2,
  MessageSquare,
  Play,
  Radio,
  RefreshCw,
  Send,
  Shield,
  SkipForward,
  Users,
  X,
} from 'lucide-react';
import {
  anipubTitleCandidates,
  ANIME_SERVERS,
  fetchAniSkipTimes,
  fetchAnimeGenre,
  fetchCinemetaCatalogFeed,
  fetchCinemetaShelf,
  fetchRelatedMedia,
  fetchTvEpisodesAndMeta,
  fetchTvmazePopular,
  latestReleasedAnimeSeason,
  loadAnimeSeasonChain,
  MOVIE_SERVERS,
  normalizeMovieIds,
  posterCandidates,
  resolveAnimeEpisodeStream,
  resolveSharedTitle,
  resolveTmdbId,
  TV_SERVERS,
  wrapMovieTvShieldUrl,
} from '../lib/catalog';
import {
  computeLivePosition,
  createWatchRoom,
  endWatchRoom,
  ensureHostCryptoSession,
  extractRoomCodeInput,
  formatPlaybackTime,
  joinWatchRoom,
  leaveWatchRoom,
  parsePlayerMessage,
  persistHostPlaybackCheckpoint,
  recoverStaleHostIfNeeded,
  ROOM_DRIFT_TOLERANCE_SEC,
  ROOM_HOST_NO_PROGRESS_PAUSE_MS,
  ROOM_MAX_MEMBERS,
  ROOM_SEEK_THRESHOLD_SEC,
  RoomRealtimeTransport,
  sendRoomChatMessage,
  sendRoomHeartbeat,
  subscribeRoomData,
  trimRoomMessagesIfHost,
} from '../lib/rooms';
import { cacheSelectedMedia, mediaDetailsUrl, mediaPlayUrl, progressKeyOf, readCachedSelectedMedia } from '../lib/routes';
import { applyPageSeo } from '../lib/seo';
import { useApp } from '../context/AppContext';
import { MediaCard } from './MediaCard';
import { useGridSlotsWithAds, VastMediaAdCard } from './VastMediaAdCard';
import type {
  MediaItem,
  PlayableMediaType,
  RoomMediaSnapshot,
  RoomMember,
  RoomMessage,
  SignedPlaybackPacket,
  TvEpisode,
  WatchRoomState,
} from '../types/media';

interface WatchExperienceProps {
  mode: 'play' | 'room';
  playType?: PlayableMediaType;
  playId?: string;
  roomCodeParam?: string;
}

function ResilientPoster({
  item,
  className = '',
}: {
  item: MediaItem;
  className?: string;
}) {
  const candidates = useMemo(() => posterCandidates(item), [item]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [item.id, item._type]);

  const src = candidates[idx] || '';
  const initials = String(item._title || item.title || 'AM')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();

  if (!src) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-[#191C28] to-[#0B0D14] text-white/35 font-display font-bold text-sm ${className}`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item._title || item.title || 'Poster'}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setIdx((n) => (n + 1 < candidates.length ? n + 1 : candidates.length))}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}

function RailMediaRow({
  item,
  onSelect,
}: {
  item: MediaItem;
  onSelect: (chosen: MediaItem) => void;
}) {
  const typeLabel = item._type === 'tv' ? 'Series' : item._type === 'movie' ? 'Movie' : 'Anime';
  const year = item._year || item.seasonYear;
  const score = item.averageScore ? `★ ${(item.averageScore / 10).toFixed(1)}` : '';
  const genres = (item.genres || item._genres || []).slice(0, 2).join(', ');
  const meta = [typeLabel, year, score].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group w-full flex items-center gap-3.5 p-2 rounded-xl hover:bg-white/[0.05] border border-transparent hover:border-white/8 text-left transition-colors cursor-pointer"
    >
      <div className="relative w-16 aspect-[2/3] rounded-lg overflow-hidden bg-[#12151E] border border-white/10 shrink-0">
        <ResilientPoster
          item={item}
          className="transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="w-7 h-7 rounded-full bg-[#E11D48] text-white flex items-center justify-center shadow-lg">
            <Play className="w-3 h-3 fill-white ml-0.5" />
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-slate-100 group-hover:text-white line-clamp-2 leading-snug">
          {item._title || item.title}
        </h3>
        {meta && <p className="mt-1 text-xs text-slate-400 tabular-nums truncate">{meta}</p>}
        {genres && <p className="mt-0.5 text-[11px] text-slate-500 truncate">{genres}</p>}
      </div>
    </button>
  );
}

export function WatchExperience({ mode, playType, playId, roomCodeParam }: WatchExperienceProps) {
  const {
    route,
    navigate,
    goBack,
    user,
    profile,
    authReady,
    openAuthModal,
    preferences,
    updatePreferences,
    inMyList,
    toggleMyList,
    saveWatchProgress,
    getWatchProgress,
    recordContinueWatching,
    myList,
    continueWatching,
    flashNote,
    setActiveRoomId,
  } = useApp();

  const searchParams = useMemo(() => new URLSearchParams(route.split('?')[1] || ''), [route]);

  // Core Media State
  const [mediaType, setMediaType] = useState<PlayableMediaType>(playType || 'anime');
  const [mediaItem, setMediaItem] = useState<MediaItem | null>(() =>
    playType && playId ? readCachedSelectedMedia(playType, playId) : null
  );
  const [episode, setEpisode] = useState<number>(() => Math.max(1, Number(searchParams.get('e')) || 1));
  const [season, setSeason] = useState<number>(() => Math.max(1, Number(searchParams.get('s')) || 1));
  const [lang, setLang] = useState<'sub' | 'dub'>(() =>
    searchParams.get('lang') === 'dub' ? 'dub' : preferences.lang || 'sub'
  );
  const [serverIdx, setServerIdx] = useState(0);
  const [resumeStartSec, setResumeStartSec] = useState<number>(() => Math.max(0, Number(searchParams.get('t')) || 0));

  // Layout UI State
  const [theaterWide, setTheaterWide] = useState(false);

  // Player Embed & Intro/Outro Skip State
  const [playerUrl, setPlayerUrl] = useState('');
  const [streamStatus, setStreamStatus] = useState('Preparing stream...');
  const [streamError, setStreamError] = useState('');
  const [nextUpCountdown, setNextUpCountdown] = useState<number | null>(null);
  const [introRange, setIntroRange] = useState<{ start: number; end: number } | null>(null);
  const [outroRange, setOutroRange] = useState<{ start: number; end: number } | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDur, setPlaybackDur] = useState(0);
  const [autoSkip, setAutoSkip] = useState<boolean>(() => {
    try {
      return localStorage.getItem('amstream.autoskip.v1') === '1';
    } catch {
      return false;
    }
  });

  // Seasons / Episodes Picker Popover
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [animeSeasons, setAnimeSeasons] = useState<any[]>([]);
  const [tvSeasons, setTvSeasons] = useState<Record<number, TvEpisode[]>>({});
  const [tvSeasonList, setTvSeasonList] = useState<number[]>([]);

  // Discovery Tabs (Related, For you, Trending, etc.)
  const [discoveryTab, setDiscoveryTab] = useState<'related' | 'foryou' | 'trending' | 'genre' | 'toprated'>('related');
  const [discoveryItems, setDiscoveryItems] = useState<MediaItem[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const discoverySlots = useGridSlotsWithAds(discoveryItems, 9);

  // Watch Room State
  const [room, setRoom] = useState<WatchRoomState | null>(null);
  const [roomLoading, setRoomLoading] = useState(mode === 'room');
  const [roomError, setRoomError] = useState('');
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, { online: boolean; connections: number; lastSeen: number }>>({});
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [wsState, setWsState] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'code' | 'link' | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [existingHostedRoom, setExistingHostedRoom] = useState<WatchRoomState | null>(null);
  const [mutedLocal] = useState(false);
  const [localVol] = useState(preferences.localVolume ?? 0.8);
  const [syncIndicator, setSyncIndicator] = useState('');

  // Mobile keyboard-safe visualViewport handling
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  // Mutable Refs for real-time player sync loops
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const localPosRef = useRef(0);
  const localDurRef = useRef(0);
  const localStateRef = useRef<'playing' | 'paused'>('paused');
  const lastProgressTickRef = useRef(0);
  const playbackSeqRef = useRef(1);
  const lastSeqFromHostRef = useRef(0);
  const hostPrivateKeyRef = useRef<CryptoKey | null>(null);
  const transportRef = useRef<RoomRealtimeTransport | null>(null);
  const roomRef = useRef<WatchRoomState | null>(null);
  const membersRef = useRef<RoomMember[]>([]);
  const mediaItemRef = useRef<MediaItem | null>(null);
  const anipubCacheRef = useRef<{ aniId?: number; id?: number; episodes?: string[] }>({});
  const lastSaveClockRef = useRef(0);
  const autoSkippedKeyRef = useRef('');
  const episodePickerRef = useRef<HTMLDivElement>(null);

  roomRef.current = room;
  membersRef.current = members;
  mediaItemRef.current = mediaItem;

  const isInRoom = Boolean(room);
  const isHost = Boolean(room && user && room.hostUid === user.uid);

  const sendRoomPlayerControl = useCallback(
    (action: 'play' | 'pause' | 'seek' | 'volume', payload: { position_seconds?: number; volume?: number } = {}) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(
        {
          type: 'ANIMESTREAM_ROOM_CONTROL',
          action,
          ...payload,
        },
        location.origin
      );
    },
    []
  );

  // Sync mobile visualViewport height inside active Watch Room
  useEffect(() => {
    if (!isInRoom) {
      document.body.classList.remove('room-mobile-lock');
      setKeyboardOpen(false);
      setViewportHeight(null);
      return;
    }

    const updateViewport = () => {
      const isSmall = window.innerWidth < 1024;
      if (!isSmall) {
        document.body.classList.remove('room-mobile-lock');
        setKeyboardOpen(false);
        setViewportHeight(null);
        return;
      }
      document.body.classList.add('room-mobile-lock');
      const vv = window.visualViewport;
      if (vv) {
        setViewportHeight(vv.height);
        setKeyboardOpen(vv.height < window.innerHeight * 0.78);
      } else {
        setViewportHeight(window.innerHeight);
      }
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      document.body.classList.remove('room-mobile-lock');
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, [isInRoom]);

  // Helper to hydrate MediaItem from URL params or Room media snapshot
  const hydrateSoloMedia = useCallback(async () => {
    if (mode !== 'play' || !playType || !playId) return;
    setMediaType(playType);

    const cached = readCachedSelectedMedia(playType, playId);
    const paramTitle = searchParams.get('title') || '';
    const paramYear = searchParams.get('year') || '';
    const paramMal = Number(searchParams.get('mal')) || 0;
    const paramTmdb = Number(searchParams.get('tmdb')) || 0;
    const paramImdb = searchParams.get('imdb') || (playId.startsWith('tt') ? playId : '');
    const paramTvmaze =
      Number(searchParams.get('tvmaze')) || (playType === 'tv' && /^\d+$/.test(playId) ? Number(playId) : 0);

    let item: MediaItem = cached || {
      _type: playType,
      id: playId,
      ani_id: playType === 'anime' ? Number(playId) || 0 : 0,
      mal_id: paramMal,
      tmdb: paramTmdb,
      imdb: paramImdb,
      tvmaze: paramTvmaze,
      _title: paramTitle || 'Loading...',
      _year: Number(paramYear) || 0,
    };

    if (paramMal && !item.mal_id) item.mal_id = paramMal;
    if (paramTmdb && !item.tmdb) item.tmdb = paramTmdb;
    if (paramImdb && !item.imdb) item.imdb = paramImdb;
    if (paramTvmaze && !item.tvmaze) item.tvmaze = paramTvmaze;

    // Fetch complete info in background if missing details
    if (!cached || !item.description) {
      const full = await resolveSharedTitle(playType, playId).catch(() => null);
      if (full) {
        item = {
          ...full,
          ...item,
          _title: full._title || item._title,
          status: full.status || item.status,
          genres: full.genres || item.genres,
        };
      }
    }

    // If an unreleased sequel (e.g., upcoming 2026 season) was opened directly, switch to latest released season
    if (playType === 'anime' && item.status === 'NOT_YET_RELEASED' && Number(item.id) > 0) {
      const released = await latestReleasedAnimeSeason(Number(item.id)).catch(() => null);
      if (released) {
        const releasedItem: MediaItem = {
          _type: 'anime',
          id: released.id,
          ani_id: released.id,
          mal_id: released.idMal,
          _title: released.title?.english || released.title?.romaji || item._title,
          _poster: released.coverImage?.extraLarge || released.coverImage?.large || item._poster,
          _backdrop: released.bannerImage || item._backdrop,
          episodes: released.episodes,
          genres: released.genres || item.genres,
          status: released.status,
        };
        flashNote(`Upcoming season not aired yet — playing ${releasedItem._title}`);
        cacheSelectedMedia(releasedItem);
        navigate(mediaPlayUrl(releasedItem), true);
        return;
      }
      setStreamError('This season has not premiered yet and no aired stream is available.');
      setPlayerUrl('');
      setMediaItem(item);
      return;
    }

    // Ensure numeric TMDB ID for Movie / TV Series
    if (playType === 'movie' || playType === 'tv') {
      const normalized = normalizeMovieIds(item.tmdb, item.imdb);
      item.tmdb = normalized.tmdb;
      item.imdb = normalized.imdb;
      if (!item.tmdb) {
        const resolved = await resolveTmdbId(playType === 'tv' ? 'series' : 'movie', item.imdb || '', item._title, item._year);
        if (resolved.tmdb) item.tmdb = resolved.tmdb;
        if (resolved.imdb && !item.imdb) item.imdb = resolved.imdb;
      }
    }

    const saved = getWatchProgress(progressKeyOf(item));
    if (!searchParams.get('e') && saved?.e) setEpisode(saved.e);
    if (!searchParams.get('s') && saved?.s) setSeason(saved.s);
    if (!searchParams.get('t') && saved?.p && saved.p > 15) setResumeStartSec(saved.p);

    setMediaItem(item);
    cacheSelectedMedia(item);
  }, [mode, playType, playId, searchParams, getWatchProgress, flashNote, navigate]);

  useEffect(() => {
    if (mode === 'play') {
      setRoom(null);
      setActiveRoomId(null);
      hydrateSoloMedia();
    }
  }, [mode, hydrateSoloMedia, setActiveRoomId]);

  useEffect(() => {
    if (mode === 'room') {
      const code = String(roomCodeParam || '').toUpperCase();
      applyPageSeo({
        title: code ? `Watch Room ${code} — AMStream` : 'Watch Room — AMStream',
        description: 'Synchronized multi-viewer cinema theater with live chat on AMStream.',
        path: code ? `/room/${code}` : '/room',
        robots: 'noindex, nofollow',
      });
      return;
    }
    const title = mediaItem?._title || mediaItem?.title;
    if (title) {
      const epSuffix = mediaType === 'tv' ? ` S${season} E${episode}` : mediaType === 'anime' ? ` Episode ${episode}` : '';
      applyPageSeo({
        title: `Watch ${title}${epSuffix} — AMStream`,
        description: `Stream ${title}${epSuffix} ad-free with multiple servers, auto-skip intro/outro, and live Watch Rooms on AMStream.`,
        path: `/play/${encodeURIComponent(mediaType)}/${encodeURIComponent(playId || '')}`,
        type: mediaType === 'movie' ? 'video.movie' : 'video.episode',
      });
    }
  }, [mode, roomCodeParam, mediaItem?._title, mediaItem?.title, mediaType, season, episode, playId]);

  // Join Watch Room when in /room/:code mode
  useEffect(() => {
    if (mode !== 'room' || !roomCodeParam || !authReady) return;
    const code = extractRoomCodeInput(roomCodeParam);
    if (code.length !== 8) {
      setRoomError('Invalid Watch Room invite code.');
      setRoomLoading(false);
      return;
    }

    if (!user) {
      setRoomLoading(false);
      return;
    }

    let cancelled = false;
    setRoomLoading(true);
    setRoomError('');

    joinWatchRoom(user.uid, profile?.displayName || user.displayName || 'AMStream Guest', code)
      .then(async (joinedRoom) => {
        if (cancelled) return;
        setRoom(joinedRoom);
        setActiveRoomId(joinedRoom.roomId);
        playbackSeqRef.current = joinedRoom.playbackSeq || 1;
        lastSeqFromHostRef.current = joinedRoom.playbackSeq || 0;

        // Hydrate media item from room snapshot
        const snapMedia = joinedRoom.media;
        setMediaType(snapMedia.type);
        setEpisode(snapMedia.episode_index || 1);
        setSeason(snapMedia.season || 1);
        setLang(snapMedia.language || 'sub');
        setServerIdx(snapMedia.source_index || 0);
        const startPos = computeLivePosition(joinedRoom);
        setResumeStartSec(startPos);
        localPosRef.current = startPos;
        localStateRef.current = joinedRoom.playbackState;

        const baseItem: MediaItem = {
          _type: snapMedia.type,
          id:
            snapMedia.type === 'anime'
              ? snapMedia.ani_id || snapMedia.mal_id
              : snapMedia.imdb || snapMedia.tmdb || snapMedia.tvmaze || '',
          ani_id: snapMedia.ani_id,
          mal_id: snapMedia.mal_id,
          tmdb: snapMedia.tmdb,
          imdb: snapMedia.imdb,
          tvmaze: snapMedia.tvmaze,
          episodes: snapMedia.episodes,
          _title: snapMedia.title,
        };
        setMediaItem(baseItem);

        // Fetch full metadata so poster/backdrop/recommendations work smoothly
        const lookupId = String(baseItem.id || '');
        if (lookupId) {
          resolveSharedTitle(snapMedia.type, lookupId)
            .then((full) => {
              if (!cancelled && full) {
                setMediaItem((prev) => (prev ? { ...full, ...prev, tmdb: prev.tmdb || full.tmdb } : full));
              }
            })
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) setRoomError(err?.message || 'Could not enter Watch Room.');
      })
      .finally(() => {
        if (!cancelled) setRoomLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, roomCodeParam, authReady, user, profile?.displayName, setActiveRoomId]);

  // Load Anime Season Chain or TV Episodes whenever mediaItem changes
  useEffect(() => {
    if (!mediaItem) return;
    let cancelled = false;

    if (mediaItem._type === 'anime' && Number(mediaItem.ani_id || mediaItem.id) > 0) {
      const aid = Number(mediaItem.ani_id || mediaItem.id);
      loadAnimeSeasonChain(aid)
        .then((chain) => {
          if (!cancelled) setAnimeSeasons(chain);
        })
        .catch(() => {});
    } else if (mediaItem._type === 'tv') {
      fetchTvEpisodesAndMeta(mediaItem.tvmaze || '', mediaItem.imdb)
        .then((meta) => {
          if (!cancelled) {
            setTvSeasons(meta.seasons);
            setTvSeasonList(meta.seasonList);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [mediaItem?._type, mediaItem?.id, mediaItem?.ani_id, mediaItem?.tvmaze, mediaItem?.imdb]);

  // Close episode picker on outside click or Escape
  useEffect(() => {
    if (!episodesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEpisodesOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-ep-sheet="1"]')) return;
      if (episodePickerRef.current && !episodePickerRef.current.contains(target as Node)) {
        setEpisodesOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [episodesOpen]);

  // Resolve playable shield iframe URL whenever active episode/season/lang/server changes
  useEffect(() => {
    if (!mediaItem) return;
    let cancelled = false;
    setStreamError('');
    setStreamStatus('Resolving stream...');
    setIntroRange(null);
    setOutroRange(null);
    setPlaybackTime(0);
    setPlaybackDur(0);
    autoSkippedKeyRef.current = '';

    async function loadStream() {
      if (!mediaItem) return;
      try {
        if (mediaType === 'anime') {
          const aniId = Number(mediaItem.ani_id || mediaItem.id) || 0;
          const malId = Number(mediaItem.mal_id || mediaItem.idMal) || 0;
          const candidates = anipubTitleCandidates(mediaItem, mediaItem._title);
          const anipubMatch = anipubCacheRef.current.aniId === aniId ? anipubCacheRef.current : {};
          const srvIdx = serverIdx % ANIME_SERVERS.length;

          // Fetch AniSkip intro/outro timestamps in parallel (server getSources chapters take precedence if received)
          if (malId > 0) {
            fetchAniSkipTimes(malId, episode).then((skip) => {
              if (cancelled) return;
              if (skip.intro) setIntroRange((prev) => prev || skip.intro!);
              if (skip.outro) setOutroRange((prev) => prev || skip.outro!);
            });
          }

          const resolved = await resolveAnimeEpisodeStream({
            aniId,
            malId,
            episode,
            wantedLang: lang,
            candidates,
            anipubId: anipubMatch.id,
            anipubEpisodes: anipubMatch.episodes,
            resumeSeconds: resumeStartSec,
            preferredServerIdx: srvIdx,
          });
          if (cancelled) return;

          if (resolved.anipubId && resolved.anipubEpisodes) {
            anipubCacheRef.current = { aniId, id: resolved.anipubId, episodes: resolved.anipubEpisodes };
          }
          if (resolved.dubNote) flashNote(resolved.dubNote);
          setPlayerUrl(resolved.url);
          setStreamStatus(`${ANIME_SERVERS[srvIdx].name} · ${resolved.effectiveLang.toUpperCase()} · Ep ${episode}`);
        } else if (mediaType === 'movie') {
          let tmdbNum = normalizeMovieIds(mediaItem.tmdb, mediaItem.imdb).tmdb;
          if (!tmdbNum) {
            const res = await resolveTmdbId('movie', mediaItem.imdb || '', mediaItem._title, mediaItem._year);
            tmdbNum = res.tmdb;
          }
          if (cancelled) return;
          if (!tmdbNum) {
            setStreamError('Could not locate a numeric TMDB ID for this movie.');
            setPlayerUrl('');
            return;
          }
          const srv = MOVIE_SERVERS[serverIdx % MOVIE_SERVERS.length];
          setPlayerUrl(wrapMovieTvShieldUrl(srv.url(tmdbNum), resumeStartSec));
          setStreamStatus(`${srv.name} · Movie`);
        } else {
          let tmdbNum = normalizeMovieIds(mediaItem.tmdb, mediaItem.imdb).tmdb;
          if (!tmdbNum) {
            const res = await resolveTmdbId('series', mediaItem.imdb || '', mediaItem._title, mediaItem._year);
            tmdbNum = res.tmdb;
          }
          if (cancelled) return;
          if (!tmdbNum) {
            setStreamError('Could not locate a numeric TMDB ID for this TV series.');
            setPlayerUrl('');
            return;
          }
          const srv = TV_SERVERS[serverIdx % TV_SERVERS.length];
          setPlayerUrl(wrapMovieTvShieldUrl(srv.url(tmdbNum, season, episode), resumeStartSec));
          setStreamStatus(`${srv.name} · S${season} · E${episode}`);
        }
      } catch (err: any) {
        if (!cancelled) {
          setStreamError(err?.message || 'Stream currently unavailable. Try switching server or language.');
          setPlayerUrl('');
        }
      }
    }

    loadStream();
    return () => {
      cancelled = true;
    };
  }, [mediaItem?.id, mediaItem?.tmdb, mediaItem?.imdb, mediaType, episode, season, lang, serverIdx, resumeStartSec, flashNote]);

  // Watch Room Subscriptions: Firestore + WebSocket/RTDB Transport + Host Crypto + Heartbeat
  useEffect(() => {
    if (!room?.roomId || !user) return;
    const roomId = room.roomId;

    const unsubFirestore = subscribeRoomData(roomId, {
      onRoom: (nextRoom) => {
        if (!nextRoom || nextRoom.status === 'ended') {
          flashNote('This Watch Room has ended.');
          setRoom(null);
          setActiveRoomId(null);
          navigate('/', true);
          return;
        }
        setRoom((prev) => {
          if (prev && prev.hostUid !== nextRoom.hostUid) {
            if (nextRoom.hostUid === user.uid) {
              flashNote('You are now the Host of this Watch Room.');
            } else {
              const newHostName =
                membersRef.current.find((m) => m.uid === nextRoom.hostUid)?.displayName || 'Another member';
              flashNote(`${newHostName} is now the Watch Room Host.`);
            }
          }
          return nextRoom;
        });

        if (nextRoom.hostUid !== user.uid && nextRoom.media) {
          const sm = nextRoom.media;
          if (sm.episode_index !== episode) setEpisode(sm.episode_index || 1);
          if (sm.season !== season) setSeason(sm.season || 1);
          if (sm.language !== lang) setLang(sm.language || 'sub');
          if (sm.source_index !== serverIdx) setServerIdx(sm.source_index || 0);
        }
      },
      onMembers: (list) => {
        setMembers(list);
      },
      onMessages: (msgs) => {
        setMessages(msgs);
        trimRoomMessagesIfHost(roomId, roomRef.current?.hostUid || '', user.uid);
      },
    });

    if (room.hostUid === user.uid) {
      ensureHostCryptoSession(roomId)
        .then((keys) => {
          hostPrivateKeyRef.current = keys.cryptoPrivateKey;
          transportRef.current?.emitRoomSignal('host_key_changed');
        })
        .catch(() => {});
    } else {
      hostPrivateKeyRef.current = null;
    }

    const transport = new RoomRealtimeTransport({
      roomId,
      channelToken: room.channelToken,
      role: room.hostUid === user.uid ? 'host' : 'guest',
      uid: user.uid,
      displayName: profile?.displayName || user.displayName || 'AMStream Member',
      getExpectedHostUid: () => roomRef.current?.hostUid || '',
      getHostPublicKey: () => roomRef.current?.hostSigningPublicKey || null,
      onPresence: (pres) => setPresenceMap(pres),
      onConnectionChange: (st) => setWsState(st),
      onSignal: (sig) => {
        if (sig.kind === 'room_ended') {
          flashNote('Host ended the Watch Room.');
          setRoom(null);
          setActiveRoomId(null);
          navigate('/', true);
        }
      },
      onSignedHostPacket: (packet: SignedPlaybackPacket) => {
        if (roomRef.current?.hostUid === user.uid) return;
        if (packet.playback_seq < lastSeqFromHostRef.current) return;
        lastSeqFromHostRef.current = packet.playback_seq;

        const hm = packet.media;
        if (hm) {
          if (hm.episode_index && hm.episode_index !== episode) {
            setEpisode(hm.episode_index);
            setResumeStartSec(packet.position_seconds);
          }
          if (hm.season && hm.season !== season) setSeason(hm.season);
          if (hm.language && hm.language !== lang) setLang(hm.language);
          if (hm.source_index !== serverIdx) setServerIdx(hm.source_index);
        }

        const liveTarget =
          packet.position_seconds +
          (packet.playback_state === 'playing' ? Math.max(0, (Date.now() - packet.sent_at) / 1000) : 0);
        const drift = Math.abs(liveTarget - localPosRef.current);

        if (packet.playback_state === 'paused') {
          if (localStateRef.current !== 'paused' || drift > ROOM_SEEK_THRESHOLD_SEC) {
            sendRoomPlayerControl('pause');
            if (drift > ROOM_SEEK_THRESHOLD_SEC) {
              sendRoomPlayerControl('seek', { position_seconds: liveTarget });
              window.setTimeout(() => sendRoomPlayerControl('pause'), 180);
            }
            localStateRef.current = 'paused';
            localPosRef.current = liveTarget;
            setSyncIndicator(`Paused at ${formatPlaybackTime(liveTarget)}`);
          }
          return;
        }

        if (drift > ROOM_SEEK_THRESHOLD_SEC || packet.command === 'seek') {
          sendRoomPlayerControl('pause');
          sendRoomPlayerControl('seek', { position_seconds: liveTarget });
          window.setTimeout(() => sendRoomPlayerControl('play'), 180);
          localPosRef.current = liveTarget;
          localStateRef.current = 'playing';
          setSyncIndicator(`Synced to ${formatPlaybackTime(liveTarget)}`);
        } else if (localStateRef.current !== 'playing' || drift > ROOM_DRIFT_TOLERANCE_SEC) {
          if (drift > ROOM_DRIFT_TOLERANCE_SEC && drift <= ROOM_SEEK_THRESHOLD_SEC) {
            sendRoomPlayerControl('seek', { position_seconds: liveTarget });
          }
          sendRoomPlayerControl('play');
          localStateRef.current = 'playing';
          setSyncIndicator('Live synced');
        }
      },
    });
    transportRef.current = transport;
    transport.start();

    const hbTimer = window.setInterval(() => {
      sendRoomHeartbeat(roomId, user.uid, profile?.displayName || user.displayName || undefined).catch(() => {});
      const curRoom = roomRef.current;
      if (curRoom && curRoom.hostUid !== user.uid) {
        recoverStaleHostIfNeeded(curRoom, membersRef.current, user.uid)
          .then((promoted) => {
            if (promoted) flashNote('Previous host went offline — you are now the Host.');
          })
          .catch(() => {});
      }
    }, 12000);

    return () => {
      clearInterval(hbTimer);
      transport.stop();
      transportRef.current = null;
      unsubFirestore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.roomId, user?.uid]);

  // Keep transport updated when hostUid or channelToken changes
  useEffect(() => {
    if (!room || !user || !transportRef.current) return;
    const amHost = room.hostUid === user.uid;
    transportRef.current.updateCredentials({
      channelToken: room.channelToken,
      role: amHost ? 'host' : 'guest',
    });
    if (amHost && !hostPrivateKeyRef.current) {
      ensureHostCryptoSession(room.roomId)
        .then((keys) => {
          hostPrivateKeyRef.current = keys.cryptoPrivateKey;
          transportRef.current?.emitRoomSignal('host_key_changed');
        })
        .catch(() => {});
    }
  }, [room?.hostUid, room?.channelToken, room?.roomId, user]);

  // Helper to build RoomMediaSnapshot from current player state
  const buildMediaSnapshot = useCallback(
    (overrides: Partial<RoomMediaSnapshot> = {}): RoomMediaSnapshot => {
      const m = mediaItemRef.current;
      const srvList = mediaType === 'movie' ? MOVIE_SERVERS : mediaType === 'tv' ? TV_SERVERS : ANIME_SERVERS;
      return {
        type: mediaType,
        title: String(m?._title || m?.title || 'Untitled').slice(0, 240),
        ani_id: Number(m?.ani_id || (mediaType === 'anime' ? m?.id : 0)) || 0,
        mal_id: Number(m?.mal_id || m?.idMal) || 0,
        tmdb: Number(m?.tmdb) || 0,
        imdb: String(m?.imdb || ''),
        tvmaze: Number(m?.tvmaze) || 0,
        episodes: Number(m?.episodes) || 0,
        episode_index: overrides.episode_index ?? episode,
        season: overrides.season ?? season,
        language: overrides.language ?? lang,
        source_index: overrides.source_index ?? serverIdx,
        source_name: srvList[(overrides.source_index ?? serverIdx) % srvList.length]?.name || 'Server 1',
        position_seconds: overrides.position_seconds ?? localPosRef.current,
        playback_state: overrides.playback_state ?? localStateRef.current,
      };
    },
    [mediaType, episode, season, lang, serverIdx]
  );

  // Host publishes signed playback state
  const publishHostPacket = useCallback(
    async (
      kind: 'host_state' | 'host_playback',
      command?: 'play' | 'pause' | 'seek' | 'episode',
      checkpointFirestore = false
    ) => {
      const curRoom = roomRef.current;
      if (!curRoom || !user || curRoom.hostUid !== user.uid || !hostPrivateKeyRef.current || !transportRef.current) {
        return;
      }
      const seq = ++playbackSeqRef.current;
      const snap = buildMediaSnapshot();
      await transportRef.current.publishSignedHostEvent(
        {
          room_id: curRoom.roomId,
          host_uid: user.uid,
          kind,
          command,
          playback_seq: seq,
          sent_at: Date.now(),
          position_seconds: snap.position_seconds,
          playback_state: snap.playback_state,
          playback_rate: 1,
          media: snap,
        },
        hostPrivateKeyRef.current
      );
      if (checkpointFirestore) {
        persistHostPlaybackCheckpoint(curRoom.roomId, {
          media: snap,
          playbackState: snap.playback_state,
          positionSeconds: snap.position_seconds,
          playbackSeq: seq,
          revision: (curRoom.revision || 1) + 1,
        }).catch(() => {});
      }
    },
    [user, buildMediaSnapshot]
  );

  useEffect(() => {
    if (!isHost) return;
    let lastEmit = 0;
    const interval = window.setInterval(() => {
      const now = Date.now();
      if (
        localStateRef.current === 'playing' &&
        lastProgressTickRef.current > 0 &&
        now - lastProgressTickRef.current > ROOM_HOST_NO_PROGRESS_PAUSE_MS
      ) {
        localStateRef.current = 'paused';
        publishHostPacket('host_playback', 'pause', true);
        lastEmit = now;
        return;
      }

      const cadence = localStateRef.current === 'playing' ? 1000 : 2500;
      if (now - lastEmit >= cadence) {
        lastEmit = now;
        publishHostPacket('host_state', undefined, false);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isHost, publishHostPacket]);

  // Listen to postMessages from megaplay.html shield iframe
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;

      const data = event.data;
      if (data && data.type === 'mp-miss') {
        if (mediaType === 'anime' && lang === 'dub') {
          flashNote('Dub stream did not load cleanly. Falling back to SUB...');
          setLang('sub');
        } else {
          flashNote('Stream timed out — try switching servers.');
        }
        return;
      }

      if (data && typeof data === 'object' && String(data.event || '').toUpperCase() === 'CHAPTERS') {
        if (data.intro && Number(data.intro.end) > Number(data.intro.start || 0)) {
          setIntroRange({ start: Number(data.intro.start) || 0, end: Number(data.intro.end) });
        }
        if (data.outro && Number(data.outro.end) > Number(data.outro.start || 0)) {
          setOutroRange({ start: Number(data.outro.start) || 0, end: Number(data.outro.end) });
        }
        return;
      }

      const parsed = parsePlayerMessage(data);
      if (!parsed) return;

      if (typeof parsed.time === 'number') {
        if (Math.abs(parsed.time - localPosRef.current) > 0.1) {
          lastProgressTickRef.current = Date.now();
        }
        localPosRef.current = parsed.time;
        setPlaybackTime(parsed.time);
      }
      if (typeof parsed.duration === 'number') {
        localDurRef.current = parsed.duration;
        setPlaybackDur(parsed.duration);
      }

      if (parsed.kind === 'play') {
        localStateRef.current = 'playing';
        lastProgressTickRef.current = Date.now();
        if (isHost) publishHostPacket('host_playback', 'play', true);
      } else if (parsed.kind === 'pause') {
        localStateRef.current = 'paused';
        if (isHost) publishHostPacket('host_playback', 'pause', true);
      } else if (parsed.kind === 'seek') {
        if (isHost) publishHostPacket('host_playback', 'seek', true);
      } else if (parsed.kind === 'complete') {
        if (mediaType !== 'movie' && preferences.autoNext && (!isInRoom || isHost)) {
          setNextUpCountdown(6);
        }
      }

      const now = Date.now();
      const item = mediaItemRef.current;
      if (item && (parsed.kind !== 'time' || now - lastSaveClockRef.current > 5000)) {
        lastSaveClockRef.current = now;
        saveWatchProgress(progressKeyOf(item), {
          e: episode,
          s: season,
          ani: Number(item.ani_id || item.id) || undefined,
          p: Math.floor(localPosRef.current),
          dur: localDurRef.current ? Math.floor(localDurRef.current) : undefined,
        });
        recordContinueWatching(item);
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [
    mediaType,
    lang,
    episode,
    season,
    isHost,
    isInRoom,
    preferences.autoNext,
    flashNote,
    publishHostPacket,
    saveWatchProgress,
    recordContinueWatching,
  ]);

  const handleIframeLoad = () => {
    window.setTimeout(() => {
      sendRoomPlayerControl('volume', { volume: mutedLocal ? 0 : localVol });
    }, 900);
  };

  useEffect(() => {
    if (nextUpCountdown === null) return;
    if (nextUpCountdown <= 0) {
      setNextUpCountdown(null);
      handleEpisodeChange(episode + 1, season);
      return;
    }
    const t = window.setTimeout(() => setNextUpCountdown((n) => (n !== null ? n - 1 : null)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextUpCountdown]);

  const toggleAutoSkip = () => {
    setAutoSkip((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('amstream.autoskip.v1', next ? '1' : '0');
      } catch {
        // ignore
      }
      flashNote(next ? 'Auto-Skip Intro/Outro enabled' : 'Auto-Skip disabled');
      return next;
    });
  };

  const handleSkipAction = useCallback(
    (kind: 'intro' | 'outro', targetSec: number) => {
      if (isInRoom && !isHost) return;
      const canAdvanceOutro =
        kind === 'outro' && mediaType !== 'movie' && playbackDur > 0 && targetSec >= playbackDur - 15;

      if (canAdvanceOutro) {
        if (preferences.autoNext) {
          setNextUpCountdown(3);
        } else {
          handleEpisodeChange(episode + 1, season);
        }
        return;
      }

      const clamped = Math.max(0, targetSec);
      sendRoomPlayerControl('seek', { position_seconds: clamped });
      localPosRef.current = clamped;
      setPlaybackTime(clamped);
      if (isHost) publishHostPacket('host_playback', 'seek', true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isInRoom, isHost, mediaType, playbackDur, preferences.autoNext, episode, season, sendRoomPlayerControl, publishHostPacket]
  );

  useEffect(() => {
    if (!autoSkip || (isInRoom && !isHost)) return;
    if (introRange && playbackTime >= introRange.start && playbackTime < introRange.end - 2) {
      const key = `intro:${season}:${episode}`;
      if (autoSkippedKeyRef.current !== key) {
        autoSkippedKeyRef.current = key;
        flashNote('Skipped intro');
        handleSkipAction('intro', introRange.end);
      }
      return;
    }
    if (outroRange && playbackTime >= outroRange.start && playbackTime < outroRange.end - 2) {
      const key = `outro:${season}:${episode}`;
      if (autoSkippedKeyRef.current !== key) {
        autoSkippedKeyRef.current = key;
        flashNote('Skipped outro');
        handleSkipAction('outro', outroRange.end);
      }
    }
  }, [autoSkip, isInRoom, isHost, introRange, outroRange, playbackTime, season, episode, handleSkipAction, flashNote]);

  // Related / For you / Trending Discovery Loader
  const mediaGenresKey = (mediaItem?.genres || mediaItem?._genres || []).join(',');
  useEffect(() => {
    if (!mediaItem) return;
    let cancelled = false;
    setDiscoveryLoading(true);

    async function loadTab() {
      if (!mediaItem) return;
      try {
        let list: MediaItem[] = [];
        if (discoveryTab === 'related') {
          list = await fetchRelatedMedia(mediaItem);
        } else if (discoveryTab === 'trending') {
          if (mediaType === 'anime') list = (await fetchAnimeGenre('Trending', 1)).items;
          else if (mediaType === 'movie') list = await fetchCinemetaCatalogFeed('movie');
          else list = await fetchTvmazePopular();
        } else if (discoveryTab === 'genre') {
          const g = (mediaItem.genres || mediaItem._genres || [])[0] || 'Action';
          if (mediaType === 'anime') list = (await fetchAnimeGenre(g, 1)).items;
          else list = await fetchCinemetaShelf(mediaType === 'tv' ? 'series' : 'movie', g);
        } else if (discoveryTab === 'toprated') {
          if (mediaType === 'anime') list = (await fetchAnimeGenre('Popular', 1)).items;
          else list = await fetchCinemetaCatalogFeed(mediaType === 'tv' ? 'series' : 'movie');
        } else {
          const favGenre =
            [...myList, ...continueWatching].flatMap((x) => x.genres || x._genres || [])[0] ||
            (mediaItem.genres || mediaItem._genres || [])[0] ||
            'Action';
          if (mediaType === 'anime') list = (await fetchAnimeGenre(favGenre, 1)).items;
          else list = await fetchCinemetaShelf(mediaType === 'tv' ? 'series' : 'movie', favGenre);
        }
        if (!cancelled) {
          const curTitle = String(mediaItem._title || mediaItem.title || '').toLowerCase();
          setDiscoveryItems(
            list
              .filter((x) => {
                if (String(x.id) === String(mediaItem.id)) return false;
                if (mediaItem.imdb && x.imdb && String(x.imdb).toLowerCase() === String(mediaItem.imdb).toLowerCase()) {
                  return false;
                }
                if (mediaItem.tmdb && x.tmdb && String(x.tmdb) === String(mediaItem.tmdb)) return false;
                if (mediaItem.tvmaze && x.tvmaze && String(x.tvmaze) === String(mediaItem.tvmaze)) return false;
                if (curTitle && String(x._title || x.title || '').toLowerCase() === curTitle) return false;
                return true;
              })
              .slice(0, 18)
          );
        }
      } finally {
        if (!cancelled) setDiscoveryLoading(false);
      }
    }

    loadTab();
    return () => {
      cancelled = true;
    };
  }, [discoveryTab, mediaItem?.id, mediaItem?.imdb, mediaItem?.tvmaze, mediaGenresKey, mediaType, myList, continueWatching]);

  // Chat auto-scroll
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleEpisodeChange = (nextEp: number, nextSeason = season) => {
    if (isInRoom && !isHost) {
      flashNote('Only the Watch Room host can change episodes.');
      return;
    }
    setNextUpCountdown(null);
    setResumeStartSec(0);
    localPosRef.current = 0;
    setEpisode(nextEp);
    setSeason(nextSeason);
    if (isHost) {
      window.setTimeout(() => publishHostPacket('host_playback', 'episode', true), 60);
    }
  };

  const handleLangSwitch = (nextLang: 'sub' | 'dub') => {
    if (isInRoom && !isHost) {
      flashNote('Only the Watch Room host can switch SUB/DUB.');
      return;
    }
    setLang(nextLang);
    updatePreferences({ lang: nextLang });
    if (isHost) {
      window.setTimeout(() => publishHostPacket('host_playback', 'episode', true), 60);
    }
  };

  const handleServerSwitch = (idx: number) => {
    if (isInRoom && !isHost) {
      flashNote('Only the Watch Room host can switch playback servers.');
      return;
    }
    setServerIdx(idx);
    if (isHost) {
      window.setTimeout(() => publishHostPacket('host_playback', 'episode', true), 60);
    }
  };

  const handleCreateRoom = async () => {
    if (!mediaItem) return;
    if (!user) {
      openAuthModal('login', () => handleCreateRoom());
      return;
    }
    setCreatingRoom(true);
    setExistingHostedRoom(null);
    try {
      const snap = buildMediaSnapshot();
      const { room: created, cryptoPrivateKey } = await createWatchRoom(
        user.uid,
        profile?.displayName || user.displayName || 'AMStream Host',
        snap
      );
      hostPrivateKeyRef.current = cryptoPrivateKey;
      setRoom(created);
      setActiveRoomId(created.roomId);
      flashNote(`Watch Room ${created.code} created!`);
      navigate(`/room/${created.code}`, true);
    } catch (err: any) {
      if (err?.existingRoom) {
        setExistingHostedRoom(err.existingRoom);
      } else {
        flashNote(err?.message || 'Could not create Watch Room.');
      }
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || !user || !chatInput.trim() || sendingChat) return;
    const text = chatInput.trim();
    setSendingChat(true);
    try {
      await sendRoomChatMessage(room.roomId, user.uid, profile?.displayName || user.displayName || 'Member', text);
      setChatInput('');
    } catch (err: any) {
      flashNote(err?.message || 'Message blocked.');
    } finally {
      setSendingChat(false);
    }
  };

  const handleLeaveConfirmed = async (endForAll = false) => {
    if (!room || !user) return;
    setLeaveConfirmOpen(false);
    try {
      if (endForAll && isHost) {
        transportRef.current?.emitRoomSignal('room_ended');
        await endWatchRoom(room.roomId);
        flashNote('Watch Room ended for all viewers.');
      } else {
        const res = await leaveWatchRoom(room.roomId, user.uid);
        if (!res.ended) {
          transportRef.current?.emitRoomSignal('host_changed', {
            newHostUid: res.newHostUid,
            newChannelToken: res.newChannelToken,
          });
        }
        flashNote('Left Watch Room.');
      }
    } finally {
      setRoom(null);
      setActiveRoomId(null);
      goBack(mediaItem ? mediaDetailsUrl(mediaItem) : '/');
    }
  };

  const copyRoomInfo = async (what: 'code' | 'link') => {
    if (!room) return;
    const text = what === 'code' ? room.code : `${location.origin}/room/${room.code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(what);
      flashNote(what === 'code' ? `Copied code ${room.code}` : 'Invite link copied!');
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      flashNote(text);
    }
  };

  const formatMsgClock = (ts?: number) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const detailsPath = mediaItem ? mediaDetailsUrl(mediaItem) : '/';
  const handleBackNavigation = () => {
    if (isInRoom) {
      setLeaveConfirmOpen(true);
      return;
    }
    goBack(detailsPath);
  };

  const activeSkipPrompt = useMemo(() => {
    if (isInRoom && !isHost) return null;
    if (introRange && playbackTime >= introRange.start && playbackTime < introRange.end - 1.5) {
      return { kind: 'intro' as const, label: 'Skip Intro', target: introRange.end };
    }
    if (outroRange && playbackTime >= outroRange.start && playbackTime < outroRange.end - 1.5) {
      return { kind: 'outro' as const, label: 'Skip Outro', target: outroRange.end };
    }
    return null;
  }, [isInRoom, isHost, introRange, outroRange, playbackTime]);

  // Room gate views (when loading /room/:code unauthenticated or invalid)
  if (mode === 'room' && !authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#06070A] text-slate-400 text-sm">
        Checking Watch Room session...
      </div>
    );
  }

  if (mode === 'room' && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#06070A]">
        <div className="max-w-md w-full rounded-2xl bg-[#0F1118] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#E11D48] via-[#FB7185] to-[#E11D48]" />
          <div className="p-7 text-center">
            <span className="w-12 h-12 mx-auto rounded-xl bg-[#E11D48]/18 border border-[#E11D48]/30 text-[#F43F5E] flex items-center justify-center mb-4">
              <Users className="w-6 h-6" />
            </span>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white">
              Join Watch Room <span className="font-mono text-[#F43F5E]">{String(roomCodeParam || '').toUpperCase()}</span>
            </h1>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Sign in or create a free AMStream account to join this synchronized room and chat live with friends.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="h-11 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-sm font-semibold text-white shadow-lg shadow-[#E11D48]/25 cursor-pointer transition-colors"
              >
                Sign In to Join
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="h-11 px-5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/12 text-sm font-semibold text-white cursor-pointer transition-colors"
              >
                Create Account
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate('/', true)}
              className="mt-4 text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
            >
              Return to AMStream Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'room' && (roomLoading || roomError)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#06070A]">
        <div className="max-w-md w-full rounded-2xl bg-[#0F1118] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-[#E11D48] via-[#FB7185] to-[#E11D48]" />
          <div className="p-7 text-center">
            {roomLoading ? (
              <>
                <div className="w-10 h-10 mx-auto mb-4 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-[#F43F5E]" />
                </div>
                <p className="font-display text-base font-semibold text-white">
                  Entering Watch Room{' '}
                  <span className="font-mono text-[#F43F5E]">{String(roomCodeParam || '').toUpperCase()}</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">Verifying live host state & seat availability...</p>
              </>
            ) : (
              <>
                <h1 className="font-display text-xl font-bold text-white">Unable to Enter Room</h1>
                <p className="text-sm text-rose-300 mt-2">{roomError}</p>
                <button
                  type="button"
                  onClick={() => navigate('/', true)}
                  className="mt-6 h-10 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-sm font-semibold cursor-pointer"
                >
                  Back to AMStream
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totalAnimeEps = Math.max(Number(mediaItem?.episodes) || 0, episode, 12);
  const currentGenreLabel = (mediaItem?.genres || mediaItem?._genres || [])[0] || 'Action';
  const activeServers = mediaType === 'tv' ? TV_SERVERS : mediaType === 'movie' ? MOVIE_SERVERS : ANIME_SERVERS;
  const tvEpList = tvSeasons[season] || Array.from({ length: 12 }, (_, i) => ({ season, number: i + 1 }));
  const maxEpInSeason = mediaType === 'tv' ? Math.max(tvEpList.length, episode) : totalAnimeEps;
  const isSavedInList = mediaItem ? inMyList(mediaItem) : false;

  const splitDesktopSolo = !isInRoom && !theaterWide;

  // Reusable Episodes Picker Body for both Desktop Popover and Mobile Bottom Sheet
  const renderEpisodesPickerContent = () => (
    <>
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3 shrink-0">
        <span className="font-display text-sm font-semibold text-white">
          {mediaType === 'tv' ? `Season ${season} Episodes` : 'Select Episode'}
        </span>
        <div className="flex items-center gap-2">
          {mediaType === 'tv' && tvSeasonList.length > 1 && (
            <select
              aria-label="Select TV season"
              disabled={isInRoom && !isHost}
              value={season}
              onChange={(e) => handleEpisodeChange(1, Number(e.target.value))}
              className="h-8 px-2.5 rounded-lg bg-[#080A0F] border border-white/12 text-xs text-white focus:outline-none cursor-pointer"
            >
              {tvSeasonList.map((s) => (
                <option key={s} value={s} className="bg-[#0F1118]">
                  Season {s}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-label="Close episodes"
            onClick={() => setEpisodesOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {mediaType === 'anime' && animeSeasons.length > 1 && (
        <div className="px-4 py-2.5 border-b border-white/8 flex gap-1.5 overflow-x-auto shelf-scroll shrink-0">
          {animeSeasons.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setEpisodesOpen(false);
                navigate(
                  mediaPlayUrl({
                    _type: 'anime',
                    id: s.id,
                    ani_id: s.id,
                    mal_id: s.idMal,
                    _title: s.title?.english || s.title?.romaji,
                    episodes: s.episodes,
                  }),
                  true
                );
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border cursor-pointer ${
                Number(s.id) === Number(mediaItem?.ani_id || mediaItem?.id)
                  ? 'bg-[#E11D48] border-[#E11D48] text-white'
                  : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              S{idx + 1}: {s.title?.english || s.title?.romaji}
            </button>
          ))}
        </div>
      )}

      <div className="p-3.5 overflow-y-auto flex-1 min-h-0">
        {mediaType === 'anime' ? (
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
            {Array.from({ length: totalAnimeEps }, (_, i) => i + 1).map((epNum) => (
              <button
                key={epNum}
                type="button"
                disabled={isInRoom && !isHost}
                onClick={() => {
                  setEpisodesOpen(false);
                  handleEpisodeChange(epNum, 1);
                }}
                className={`h-10 sm:h-9 rounded-lg text-xs font-semibold tabular-nums border transition-colors cursor-pointer disabled:opacity-50 ${
                  epNum === episode
                    ? 'bg-[#E11D48] border-[#E11D48] text-white'
                    : 'bg-white/[0.04] hover:bg-white/[0.11] border-white/8 text-slate-200'
                }`}
              >
                {epNum}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {tvEpList.map((ep) => (
              <button
                key={`${ep.season}-${ep.number}`}
                type="button"
                disabled={isInRoom && !isHost}
                onClick={() => {
                  setEpisodesOpen(false);
                  handleEpisodeChange(ep.number, ep.season);
                }}
                className={`w-full px-3 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer disabled:opacity-50 ${
                  ep.number === episode
                    ? 'bg-[#E11D48]/18 border-[#E11D48]/60 text-white'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/8 text-slate-200'
                }`}
              >
                <span className="text-xs font-mono tabular-nums text-[#FB7185] shrink-0">E{ep.number}</span>
                <span className="text-xs sm:text-sm font-medium truncate">
                  {ep.name || `Episode ${ep.number}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
      className={`min-h-screen bg-[#06070A] text-white flex flex-col ${
        isInRoom && viewportHeight ? 'overflow-hidden' : ''
      }`}
    >
      {/* Top Apple Theater Header */}
      {!keyboardOpen && (
        <header className="sticky top-0 z-40 h-12 sm:h-13 shrink-0 px-3 sm:px-5 lg:px-6 bg-[#06070A]/90 backdrop-blur-2xl border-b border-white/[0.06] flex items-center justify-between gap-3">
          {/* Left Zone: Clean Back + Show Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={handleBackNavigation}
              aria-label={isInRoom ? 'Exit Watch Room' : 'Back'}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-xs sm:text-[13px] font-medium text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{isInRoom ? 'Exit' : 'Back'}</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-display text-sm sm:text-[15px] font-semibold tracking-tight text-white truncate">
                  {mediaItem?._title || 'Now Watching'}
                </h1>
                {(mediaType === 'anime' || mediaType === 'tv') && (
                  <span className="hidden sm:inline text-xs text-slate-400 tabular-nums whitespace-nowrap shrink-0">
                    · {mediaType === 'tv' ? `S${season} E${episode}` : `Ep ${episode}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Zone: Clean Utility Actions (Watch Room lives under the player beside Servers) */}
          <div className="flex items-center gap-2 shrink-0">
            {!isInRoom && (
              <>
                <button
                  type="button"
                  onClick={() => setTheaterWide((w) => !w)}
                  className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  title={theaterWide ? 'Switch to Split Studio view' : 'Switch to Wide Cinema view'}
                >
                  {theaterWide ? <Columns2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span>{theaterWide ? 'Split View' : 'Wide View'}</span>
                </button>

                {mediaItem && (
                  <button
                    type="button"
                    onClick={() => toggleMyList(mediaItem)}
                    aria-label={isSavedInList ? 'Remove from My List' : 'Add to My List'}
                    className={`inline-flex items-center justify-center gap-1.5 h-9 w-9 sm:w-auto sm:px-3.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isSavedInList
                        ? 'bg-white text-[#07080C] font-semibold'
                        : 'bg-white/[0.07] hover:bg-white/[0.14] text-slate-200 hover:text-white'
                    }`}
                  >
                    {isSavedInList ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{isSavedInList ? 'In List' : 'My List'}</span>
                  </button>
                )}
              </>
            )}

            {isInRoom && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => copyRoomInfo('code')}
                  title="Copy Watch Room Code"
                  className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-xs font-mono tabular-nums text-white transition-colors cursor-pointer"
                >
                  {copiedKey === 'code' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  {room?.code}
                </button>
                <button
                  type="button"
                  onClick={() => copyRoomInfo('link')}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-white/[0.1] hover:bg-white/[0.18] text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copiedKey === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Link2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">Invite Link</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLeaveConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-rose-500/18 hover:bg-rose-500/30 text-xs font-medium text-rose-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Leave</span>
                </button>
              </div>
            )}
          </div>
        </header>
      )}

      {/* Main Cinema Layout: Fixed/Sticky Player Across Every Screen Size */}
      <div
        className={
          isInRoom
            ? 'flex-1 flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px] min-h-0'
            : splitDesktopSolo
              ? 'flex-1 flex flex-col lg:max-w-[1560px] lg:w-full lg:mx-auto lg:px-6 xl:px-8 lg:py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px] lg:gap-6 lg:items-start'
              : 'flex-1 flex flex-col'
        }
      >
        {/* Left / Primary Stage Column: uses contents on Mobile/Tablet/Wide so the video player sticks across the full page scroll height */}
        <div
          className={
            isInRoom
              ? 'flex flex-col min-h-0 lg:overflow-y-auto'
              : splitDesktopSolo
                ? 'contents lg:flex lg:flex-col lg:sticky lg:top-[4.5rem] lg:self-start'
                : 'contents'
          }
        >
          {/* Sticky Video Player Band: pinned right below header on Mobile/Tablet/Wide */}
          <div
            className={
              isInRoom
                ? 'relative w-full aspect-video max-h-[42vh] lg:max-h-[72vh] bg-black shrink-0 overflow-hidden'
                : splitDesktopSolo
                  ? 'sticky top-12 sm:top-13 lg:static z-30 w-full bg-[#06070A] border-b border-white/[0.08] lg:border-b-0'
                  : 'sticky top-12 sm:top-13 z-30 w-full bg-[#06070A]/96 backdrop-blur-xl border-b border-white/[0.08] lg:py-3'
            }
          >
            {/* Subtle ambient cinema backdrop glow behind Desktop Split Player */}
            {splitDesktopSolo && (
              <div
                aria-hidden="true"
                className="hidden lg:block absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-[#E11D48]/14 via-transparent to-indigo-500/8 blur-2xl opacity-75 pointer-events-none"
              />
            )}

            <div
              className={
                isInRoom
                  ? 'relative w-full h-full bg-black overflow-hidden'
                  : splitDesktopSolo
                    ? 'relative w-full aspect-video max-h-[52dvh] sm:max-h-[46vh] lg:max-h-[calc(100dvh-15.5rem)] bg-black overflow-hidden lg:rounded-2xl lg:ring-1 lg:ring-white/12 lg:shadow-[0_24px_80px_rgba(0,0,0,0.85)]'
                    : 'relative w-full aspect-video max-h-[52dvh] sm:max-h-[48vh] lg:max-h-[58vh] lg:max-w-[1120px] mx-auto bg-black overflow-hidden lg:rounded-2xl lg:ring-1 lg:ring-white/12 lg:shadow-[0_24px_80px_rgba(0,0,0,0.85)]'
              }
            >
              {playerUrl ? (
                <iframe
                  ref={iframeRef}
                  key={playerUrl}
                  src={playerUrl}
                  title={mediaItem?._title || 'AMStream Player'}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture; screen-wake-lock; pointer-lock"
                  allowFullScreen
                  onLoad={handleIframeLoad}
                  tabIndex={isInRoom && !isHost ? -1 : 0}
                  className={`w-full h-full border-0 ${isInRoom && !isHost ? 'pointer-events-none select-none' : ''}`}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#090B10]">
                  <p className="text-sm font-medium text-slate-200">
                    {streamError || 'Loading stream shield...'}
                  </p>
                  {streamError && mediaType !== 'anime' && (
                    <button
                      type="button"
                      onClick={() => setServerIdx((s) => s + 1)}
                      className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#E11D48] text-xs font-semibold text-white cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Try Next Server
                    </button>
                  )}
                </div>
              )}

              {/* Floating Skip Intro / Skip Outro Action */}
              {activeSkipPrompt && (
                <button
                  type="button"
                  onClick={() => handleSkipAction(activeSkipPrompt.kind, activeSkipPrompt.target)}
                  className="absolute bottom-14 sm:bottom-16 right-3 sm:right-5 z-20 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#0D1018]/92 hover:bg-[#E11D48] backdrop-blur-md border border-white/20 hover:border-[#E11D48] text-xs sm:text-sm font-semibold text-white shadow-2xl transition-all cursor-pointer"
                >
                  <span>{activeSkipPrompt.label}</span>
                  <SkipForward className="w-4 h-4" />
                </button>
              )}

              {/* Next Episode Auto-Play Countdown */}
              {nextUpCountdown !== null && (
                <div className="absolute bottom-4 right-4 z-20 p-3.5 sm:p-4 rounded-xl bg-[#0F1118]/95 backdrop-blur-md border border-white/15 shadow-2xl flex items-center gap-3.5">
                  <div>
                    <div className="text-xs text-slate-400 tabular-nums">Next episode in {nextUpCountdown}s</div>
                    <div className="text-sm font-semibold text-white">Episode {episode + 1}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNextUpCountdown(null);
                      handleEpisodeChange(episode + 1, season);
                    }}
                    className="h-9 px-3.5 rounded-lg bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white cursor-pointer"
                  >
                    Play Now
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel next episode"
                    onClick={() => setNextUpCountdown(null)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Host / Guest Sync Control Strip */}
          {isInRoom && (
            <div className="px-4 py-2.5 bg-[#0C0E14] border-b border-white/8 flex flex-wrap items-center justify-between gap-3 shrink-0">
              {isHost ? (
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>
                    You are Hosting <span className="text-slate-500">·</span> Play, pause, seek & episode switches sync automatically
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Shield className="w-3.5 h-3.5 text-[#F43F5E] shrink-0" />
                    <span className="tabular-nums">
                      Synced with Host {syncIndicator ? `· ${syncIndicator}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!room) return;
                      const target = computeLivePosition(room);
                      sendRoomPlayerControl('seek', { position_seconds: target });
                      sendRoomPlayerControl(room.playbackState === 'playing' ? 'play' : 'pause');
                      flashNote(`Resynced to Host (${formatPlaybackTime(target)})`);
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#E11D48]/20 hover:bg-[#E11D48]/30 border border-[#E11D48]/40 text-xs font-medium text-[#FB7185] cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Resync to Host
                  </button>
                </>
              )}
            </div>
          )}

          {/* Existing Hosted Room Conflict Alert */}
          {existingHostedRoom && (
            <div className="mt-3 mx-4 lg:mx-0 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-amber-200">
                You already host active room <span className="font-mono font-bold">{existingHostedRoom.code}</span>.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/room/${existingHostedRoom.code}`)}
                  className="h-8 px-3 rounded-lg bg-amber-500 text-black text-xs font-semibold cursor-pointer"
                >
                  Open Existing Room
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await endWatchRoom(existingHostedRoom.roomId);
                    setExistingHostedRoom(null);
                    handleCreateRoom();
                  }}
                  className="h-8 px-3 rounded-lg bg-white/10 text-xs text-white cursor-pointer"
                >
                  End Old & Start New
                </button>
              </div>
            </div>
          )}

          {/* Apple-Crafted Control Surface Directly Under the Player */}
          {!keyboardOpen && (
            <section
              className={
                isInRoom
                  ? 'w-full px-4 sm:px-5 py-4 border-b border-white/[0.07] bg-[#0B0D13]'
                  : splitDesktopSolo
                    ? 'w-full px-4 py-4 sm:px-6 lg:p-5 lg:mt-3.5 lg:rounded-2xl bg-[#0B0D13] lg:border border-b border-white/[0.08]'
                    : 'max-w-[1120px] w-full mx-auto px-4 sm:px-6 py-4 sm:p-5 mt-0 lg:mt-3 lg:rounded-2xl bg-[#0B0D13] border-b lg:border border-white/[0.08]'
              }
            >
              {/* Tier 1: Clean Title & Unboxed Meta + Apple Capsule Episode Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                <div className="min-w-0">
                  <h2 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-white truncate">
                    {mediaItem?._title || 'Now Watching'}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    <span>{mediaType === 'tv' ? 'TV Series' : mediaType === 'movie' ? 'Movie' : 'Anime'}</span>
                    {mediaItem?._year || mediaItem?.seasonYear ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{mediaItem._year || mediaItem.seasonYear}</span>
                      </>
                    ) : null}
                    {(mediaType === 'anime' || mediaType === 'tv') && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums text-slate-200 font-medium">
                          {mediaType === 'tv' ? `S${season} · E${episode}` : `Episode ${episode}`}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-400">{streamStatus}</span>
                  </div>
                </div>

                {/* Unified Apple Episode Capsule */}
                {(mediaType === 'anime' || mediaType === 'tv') && (
                  <div
                    ref={episodePickerRef}
                    className="relative inline-flex items-center self-start sm:self-auto bg-white/[0.06] p-1 rounded-2xl border border-white/[0.08] shrink-0"
                  >
                    <button
                      type="button"
                      onClick={() => handleEpisodeChange(Math.max(1, episode - 1), season)}
                      disabled={episode <= 1 || (isInRoom && !isHost)}
                      aria-label="Previous episode"
                      className="h-9 w-9 rounded-xl hover:bg-white/[0.1] flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setEpisodesOpen((o) => !o)}
                      className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-xs sm:text-[13px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        episodesOpen ? 'bg-white text-[#07080C] font-semibold' : 'hover:bg-white/[0.1] text-white'
                      }`}
                    >
                      <ListVideo className="w-4 h-4" />
                      <span className="tabular-nums">
                        {mediaType === 'tv' ? `S${season} E${episode}` : `Ep ${episode}`}
                      </span>
                      <span className={episodesOpen ? 'text-[#07080C]/75' : 'text-slate-400'}>Episodes</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${episodesOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <button
                      type="button"
                      disabled={episode >= maxEpInSeason || (isInRoom && !isHost)}
                      onClick={() => handleEpisodeChange(episode + 1, season)}
                      aria-label="Next episode"
                      className="h-9 w-9 rounded-xl hover:bg-white/[0.1] flex items-center justify-center text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* Desktop / Tablet Anchored Popover */}
                    {episodesOpen && (
                      <div
                        className={`hidden sm:flex flex-col absolute right-0 z-50 w-[420px] max-h-[58vh] rounded-2xl bg-[#0E1118]/98 backdrop-blur-2xl border border-white/14 shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden ${
                          splitDesktopSolo ? 'lg:bottom-12 lg:top-auto top-12' : 'top-12'
                        }`}
                      >
                        {renderEpisodesPickerContent()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tier 2: Servers + SUB/DUB + Watch Room together cleanly under the player */}
              <div className="mt-4 pt-3.5 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="inline-flex items-center p-1 rounded-full bg-white/[0.06] border border-white/[0.07] overflow-x-auto shelf-scroll max-w-full">
                    {activeServers.map((srv, idx) => (
                      <button
                        key={srv.name}
                        type="button"
                        disabled={isInRoom && !isHost}
                        onClick={() => handleServerSwitch(idx)}
                        className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 ${
                          serverIdx % activeServers.length === idx
                            ? 'bg-white text-[#07080C] font-semibold shadow-sm'
                            : 'text-slate-300 hover:text-white font-medium'
                        }`}
                      >
                        {srv.name}
                      </button>
                    ))}
                  </div>

                  {mediaType === 'anime' && (
                    <div className="inline-flex items-center p-1 rounded-full bg-white/[0.06] border border-white/[0.07]">
                      {(['sub', 'dub'] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          disabled={isInRoom && !isHost}
                          onClick={() => handleLangSwitch(l)}
                          className={`px-3 py-1.5 rounded-full text-xs uppercase whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 ${
                            lang === l
                              ? 'bg-white text-[#07080C] font-semibold shadow-sm'
                              : 'text-slate-300 hover:text-white font-medium'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {!isInRoom ? (
                  <button
                    type="button"
                    disabled={creatingRoom}
                    onClick={handleCreateRoom}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-full bg-[#E11D48] hover:bg-[#BE123C] text-xs font-semibold text-white shadow-lg shadow-[#E11D48]/25 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{creatingRoom ? 'Creating...' : 'Watch Room'}</span>
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
                    Synced · {members.length}/{ROOM_MAX_MEMBERS} in room
                  </span>
                )}
              </div>

              {/* Tier 3: Apple-style Sliding Playback Switches (Auto-Skip & Auto-Next) */}
              <div className="mt-3.5 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between sm:justify-start gap-6">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSkip}
                  onClick={toggleAutoSkip}
                  className="inline-flex items-center gap-2.5 py-0.5 text-xs sm:text-[13px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>Auto-Skip Intro</span>
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 ${
                      autoSkip ? 'bg-[#E11D48]' : 'bg-white/[0.16]'
                    }`}
                  >
                    <span
                      className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        autoSkip ? 'translate-x-[18px]' : 'translate-x-[2px]'
                      }`}
                    />
                  </span>
                </button>

                {(mediaType === 'anime' || mediaType === 'tv') && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.autoNext}
                    onClick={() => updatePreferences({ autoNext: !preferences.autoNext })}
                    className="inline-flex items-center gap-2.5 py-0.5 text-xs sm:text-[13px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>Auto-Next Episode</span>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 ${
                        preferences.autoNext ? 'bg-[#E11D48]' : 'bg-white/[0.16]'
                      }`}
                    >
                      <span
                        className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          preferences.autoNext ? 'translate-x-[18px]' : 'translate-x-[2px]'
                        }`}
                      />
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Solo Mode Right / Lower Column: Discovery Tabs & Grid/Rows (No Info card on Watching Page; clicking any show opens Info Page first) */}
        {!isInRoom && !keyboardOpen && (
          <aside
            className={
              splitDesktopSolo
                ? 'w-full px-4 pt-5 pb-20 lg:px-0 lg:pt-0 lg:pb-12'
                : 'max-w-[1120px] w-full mx-auto px-4 sm:px-6 pt-5 pb-20'
            }
          >
            {/* Discovery Tabs + Related / For You / Trending Media */}
            <div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-3.5 shelf-scroll">
                {(
                  [
                    { id: 'related', label: 'Related' },
                    { id: 'foryou', label: 'For you' },
                    { id: 'trending', label: 'Trending' },
                    { id: 'genre', label: `More ${currentGenreLabel}` },
                    { id: 'toprated', label: 'Top rated' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDiscoveryTab(t.id)}
                    className={`px-3.5 py-2 sm:py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                      discoveryTab === t.id
                        ? 'bg-white text-[#07080C] font-semibold'
                        : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.12] hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {discoveryLoading ? (
                <div
                  className={
                    splitDesktopSolo
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-1 gap-3'
                      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'
                  }
                >
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={
                        splitDesktopSolo
                          ? 'aspect-[2/3] lg:aspect-auto lg:h-24 rounded-xl bg-white/8 animate-pulse'
                          : 'aspect-[2/3] rounded-xl bg-white/8 animate-pulse'
                      }
                    />
                  ))}
                </div>
              ) : splitDesktopSolo ? (
                <>
                  {/* Mobile & Tablet Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 lg:hidden">
                    {discoverySlots.map((slot) =>
                      slot.kind === 'ad' ? (
                        <VastMediaAdCard key={`disc-mob-${discoveryTab}-${slot.adKey}`} compact />
                      ) : (
                        <MediaCard
                          key={`${slot.item._type}:${slot.item.id}`}
                          item={slot.item}
                          onClick={(chosen) => {
                            cacheSelectedMedia(chosen);
                            navigate(mediaDetailsUrl(chosen));
                          }}
                          compact
                        />
                      )
                    )}
                  </div>
                  {/* Desktop Right Rail Clean Vertical Media Rows */}
                  <div className="hidden lg:flex flex-col gap-1.5">
                    {discoverySlots.map((slot) =>
                      slot.kind === 'ad' ? (
                        <VastMediaAdCard key={`disc-rail-${discoveryTab}-${slot.adKey}`} variant="rail" />
                      ) : (
                        <RailMediaRow
                          key={`${slot.item._type}:${slot.item.id}`}
                          item={slot.item}
                          onSelect={(chosen) => {
                            cacheSelectedMedia(chosen);
                            navigate(mediaDetailsUrl(chosen));
                          }}
                        />
                      )
                    )}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {discoverySlots.map((slot) =>
                    slot.kind === 'ad' ? (
                      <VastMediaAdCard key={`disc-wide-${discoveryTab}-${slot.adKey}`} compact />
                    ) : (
                      <MediaCard
                        key={`${slot.item._type}:${slot.item.id}`}
                        item={slot.item}
                        onClick={(chosen) => {
                          cacheSelectedMedia(chosen);
                          navigate(mediaDetailsUrl(chosen));
                        }}
                        compact
                      />
                    )
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Watch Room Studio Right/Bottom Panel */}
        {isInRoom && room && (
          <aside className="flex flex-col min-h-0 flex-1 bg-[#0B0D13] border-t lg:border-t-0 lg:border-l border-white/8 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)]">
            {/* Room Telemetry & Member Roster */}
            <div className="px-4 py-3.5 bg-[#0D1018] border-b border-white/8 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      wsState === 'live'
                        ? 'bg-emerald-400'
                        : wsState === 'reconnecting'
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-white">
                    {wsState === 'live' ? 'Live Sync' : wsState === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => copyRoomInfo('code')}
                    className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-slate-300 hover:text-white cursor-pointer"
                  >
                    {room.code}
                    {copiedKey === 'code' ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-slate-500" />
                    )}
                  </button>
                </div>

                <span className="text-xs font-medium tabular-nums text-slate-400">
                  {members.length}/{ROOM_MAX_MEMBERS} watching
                </span>
              </div>

              {!keyboardOpen && (
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  {members.map((m) => {
                    const online = presenceMap[m.uid]?.online ?? Date.now() - m.lastSeenAt < 35000;
                    const memberIsHost = m.uid === room.hostUid;
                    const isSelf = m.uid === user?.uid;
                    const initial = String(m.displayName || 'M').trim().charAt(0).toUpperCase() || 'M';
                    return (
                      <div
                        key={m.uid}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                          isSelf ? 'bg-white/[0.06] border-white/14' : 'bg-white/[0.025] border-white/6'
                        }`}
                      >
                        <div className="relative w-6 h-6 rounded-md bg-[#181C28] border border-white/10 flex items-center justify-center text-[11px] font-bold text-slate-200 shrink-0">
                          {initial}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[#0D1018] ${
                              online ? 'bg-emerald-400' : 'bg-slate-500'
                            }`}
                          />
                        </div>
                        <div className="min-w-0 flex-1 flex items-center gap-1">
                          <span className="text-xs font-medium text-slate-200 truncate">{m.displayName}</span>
                          {isSelf && <span className="text-[10px] text-slate-400 shrink-0">(You)</span>}
                          {memberIsHost && <Crown className="w-3 h-3 text-amber-400 shrink-0 ml-auto" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chat Feed */}
            <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3.5">
              {messages.length === 0 ? (
                <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-4">
                  <span className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/8 flex items-center justify-center text-slate-400 mb-3">
                    <MessageSquare className="w-4 h-4" />
                  </span>
                  <p className="text-sm font-medium text-slate-200">Room chat is ready</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-[240px]">
                    Invite up to 3 friends with code below to watch together in sync.
                  </p>
                  <button
                    type="button"
                    onClick={() => copyRoomInfo('code')}
                    className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-mono tabular-nums text-white cursor-pointer"
                  >
                    {copiedKey === 'code' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    {room.code}
                  </button>
                </div>
              ) : (
                messages.map((msg) => {
                  const mine = msg.senderUid === user?.uid;
                  const fromHost = msg.senderUid === room.hostUid;
                  const clock = formatMsgClock(msg.createdAt);
                  return (
                    <div key={msg.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400">
                        <span className={mine ? 'text-[#FB7185] font-medium' : 'text-slate-300 font-medium'}>
                          {msg.senderName}
                        </span>
                        {fromHost && <Crown className="w-3 h-3 text-amber-400" />}
                        {clock && (
                          <>
                            <span className="text-slate-600" aria-hidden="true">·</span>
                            <span className="tabular-nums text-[10px] text-slate-500">{clock}</span>
                          </>
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] px-3.5 py-2 rounded-xl text-sm leading-relaxed break-words ${
                          mine
                            ? 'bg-[#E11D48] text-white rounded-br-sm'
                            : 'bg-[#141824] text-slate-100 border border-white/8 rounded-bl-sm'
                        }`}
                      >
                        {msg.body}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Chat Composer */}
            <form
              onSubmit={handleSendChat}
              className="p-3 border-t border-white/8 bg-[#080A0F] shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={500}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message the room..."
                  className="flex-1 h-10 px-3.5 rounded-xl bg-[#0F121B] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 transition-all"
                />
                <button
                  type="submit"
                  disabled={sendingChat || !chatInput.trim()}
                  aria-label="Send message"
                  className="w-10 h-10 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-40 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              {chatInput.length > 350 && (
                <div className="mt-1.5 text-right text-[10px] font-mono tabular-nums text-slate-500">
                  {chatInput.length}/500
                </div>
              )}
            </form>
          </aside>
        )}
      </div>

      {/* Mobile Episodes & Seasons Bottom Sheet (< 640px) */}
      {episodesOpen && (mediaType === 'anime' || mediaType === 'tv') && (
        <div
          data-ep-sheet="1"
          className="sm:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEpisodesOpen(false);
          }}
        >
          <div className="w-full max-h-[75dvh] rounded-t-3xl bg-[#0D1017] border-t border-white/14 shadow-[0_-20px_60px_rgba(0,0,0,0.85)] flex flex-col pb-[env(safe-area-inset-bottom)]">
            <div className="w-10 h-1.5 bg-white/20 rounded-full mx-auto mt-3 mb-1 shrink-0" />
            {renderEpisodesPickerContent()}
          </div>
        </div>
      )}

      {/* Leave Room Confirmation Modal */}
      {leaveConfirmOpen && room && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLeaveConfirmOpen(false);
          }}
        >
          <div className="max-w-md w-full rounded-2xl bg-[#0F1118] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-[#E11D48] via-[#FB7185] to-[#E11D48]" />
            <div className="p-6">
              <h2 className="font-display text-xl font-bold text-white">Leave Watch Room?</h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                {isHost && members.length > 1
                  ? 'As Host, leaving hands playback control to the next active member, or you can end the session for everyone.'
                  : members.length <= 1
                  ? 'You are the last member in this Watch Room. Leaving will close and clean up the room.'
                  : 'You can rejoin anytime with the invite code while the room remains active.'}
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setLeaveConfirmOpen(false)}
                  className="h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-sm text-slate-200 cursor-pointer"
                >
                  Stay
                </button>
                {isHost && members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleLeaveConfirmed(true)}
                    className="h-10 px-4 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-sm font-medium text-rose-200 cursor-pointer"
                  >
                    End for Everyone
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleLeaveConfirmed(false)}
                  className="h-10 px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-sm font-semibold text-white cursor-pointer"
                >
                  {members.length <= 1 ? 'Close Room' : 'Leave Room'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
