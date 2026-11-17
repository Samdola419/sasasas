export type MediaType = 'anime' | 'movie' | 'tv';
export type PlayableMediaType = 'anime' | 'movie' | 'tv';

export interface MediaItem {
  _type: MediaType;
  id: string | number;
  idMal?: number;
  ani_id?: number;
  mal_id?: number;
  imdb?: string;
  tmdb?: string | number;
  tvmaze?: string | number;
  _title: string;
  title?: string;
  romaji?: string;
  nativeTitle?: string;
  synonyms?: string[];
  _poster?: string;
  _posterFallback?: string;
  _backdrop?: string;
  bannerImage?: string;
  cover?: string;
  _sub?: string;
  _year?: number;
  seasonYear?: number | string;
  averageScore?: number | null;
  episodes?: number;
  genres?: string[];
  _genres?: string[];
  tags?: string[];
  authors?: string[];
  pages?: number;
  summary?: string;
  description?: string;
  status?: string;
  premiered?: string;
  nextAiringEpisode?: {
    airingAt?: number;
    timeUntilAiring?: number;
    episode?: number;
  };
  trailer?: {
    id?: string;
    site?: string;
  };
  _src?: string;
  _savedAt?: number;
  _updatedAt?: number;
}

export interface WatchProgressEntry {
  e?: number;
  s?: number;
  ani?: number;
  p?: number;
  dur?: number;
  t: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface UserPreferences {
  lang: 'sub' | 'dub';
  autoNext: boolean;
  mangaSaver: boolean;
  localVolume: number;
  updatedAt?: number;
}

export interface RoomMediaSnapshot {
  type: PlayableMediaType;
  title: string;
  ani_id: number;
  mal_id: number;
  tmdb: number;
  imdb: string;
  tvmaze: number;
  episodes: number;
  episode_index: number;
  season: number;
  language: 'sub' | 'dub';
  source_index: number;
  source_name: string;
  position_seconds: number;
  playback_state: 'playing' | 'paused';
}

export interface RoomMember {
  uid: string;
  displayName: string;
  role: 'host' | 'guest';
  joinedAt: number;
  lastSeenAt: number;
  online?: boolean;
  connections?: number;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderUid: string;
  senderName: string;
  body: string;
  createdAt: number;
}

export interface WatchRoomState {
  roomId: string;
  code: string;
  hostUid: string;
  status: 'active' | 'ended';
  memberCount: number;
  mediaType: PlayableMediaType;
  media: RoomMediaSnapshot;
  playbackState: 'playing' | 'paused';
  positionSeconds: number;
  playbackSeq: number;
  playbackUpdatedAt: number;
  hostSigningPublicKey: string | null;
  channelToken: string;
  revision: number;
  createdAt: number;
  lastActivityAt: number;
  expiresAt: number;
}

export interface SignedPlaybackPacket {
  room_id: string;
  host_uid: string;
  kind: 'host_state' | 'host_playback';
  command?: 'play' | 'pause' | 'seek' | 'episode';
  playback_seq: number;
  sent_at: number;
  position_seconds: number;
  playback_state: 'playing' | 'paused';
  playback_rate: number;
  media: RoomMediaSnapshot;
  signature: string;
}

export interface PlayerEventMessage {
  kind: 'play' | 'pause' | 'seek' | 'time' | 'complete';
  time?: number;
  duration?: number;
}

export interface MangaChapter {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string;
  pages: number;
  group?: string;
}

export interface TvEpisode {
  id?: number;
  season: number;
  number: number;
  name?: string;
  summary?: string;
}
