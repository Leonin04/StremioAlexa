import { validateMediaType } from '../security/validation';
import type {
  ContinueWatchingItem,
  MetaDetail,
  MetaVideoEpisode,
  StremioLibraryItem,
} from '../types/stremio';

export function parseSeasonEpisodeFromVideoId(videoId: string | undefined): {
  season?: number;
  episode?: number;
} {
  if (!videoId) return {};
  const parts = videoId.split(':');
  if (parts.length < 3) return {};

  const season = Number.parseInt(parts[parts.length - 2], 10);
  const episode = Number.parseInt(parts[parts.length - 1], 10);

  if (Number.isNaN(season) || Number.isNaN(episode)) {
    return {};
  }
  return { season, episode };
}

export function extractContinueWatching(
  libraryItems: StremioLibraryItem[],
  limit = 10
): ContinueWatchingItem[] {
  const results: ContinueWatchingItem[] = [];

  for (const item of libraryItems) {
    if (!item || item.removed || !item._id || !item.state) {
      continue;
    }

    const mediaType = validateMediaType(item.type);
    if (!mediaType) {
      continue;
    }

    const timeOffset = Math.max(0, Number(item.state.timeOffset ?? 0));
    const duration = Math.max(0, Number(item.state.duration ?? 0));
    const videoId = item.state.video_id || item._id;

    // Skip items with zero progress unless they are series tracking a specific episode
    if (timeOffset <= 0 && !item.state.video_id) {
      continue;
    }

    // Skip already completed movies (>= 95% watched)
    const progressPercent =
      duration > 0 ? Math.min(100, Math.round((timeOffset / duration) * 100)) : 0;
    if (mediaType === 'movie' && duration > 0 && progressPercent >= 95) {
      continue;
    }

    const lastWatched =
      item.state.lastWatched ?? item._mtime ?? item._ctime ?? '';
    const { season, episode } = parseSeasonEpisodeFromVideoId(videoId);

    results.push({
      id: item._id,
      type: mediaType,
      name: item.name || item._id,
      poster: item.poster,
      videoId,
      season,
      episode,
      timeOffsetMs: timeOffset,
      durationMs: duration,
      progressPercent,
      lastWatched,
    });
  }

  results.sort((a, b) => b.lastWatched.localeCompare(a.lastWatched));
  return results.slice(0, limit);
}

export function sortEpisodes(videos: MetaVideoEpisode[]): MetaVideoEpisode[] {
  return [...videos].sort((a, b) => {
    const seasonDiff = (a.season ?? 0) - (b.season ?? 0);
    if (seasonDiff !== 0) return seasonDiff;
    return (a.episode ?? 0) - (b.episode ?? 0);
  });
}

export function findNextEpisode(
  meta: MetaDetail | null | undefined,
  currentVideoId: string
): MetaVideoEpisode | null {
  if (!meta?.videos || meta.videos.length === 0) {
    return null;
  }

  const ordered = sortEpisodes(meta.videos);
  const currentIdx = ordered.findIndex((v) => v.id === currentVideoId);
  if (currentIdx === -1) {
    return null;
  }

  const currentSeason = ordered[currentIdx].season ?? 0;
  for (let i = currentIdx + 1; i < ordered.length; i++) {
    const candidate = ordered[i];
    // Skip Season 0 specials when advancing from a regular season
    if (currentSeason > 0 && (candidate.season ?? 0) === 0) {
      continue;
    }
    return candidate;
  }

  return null;
}

export interface UpdateLibraryItemParams {
  mediaId: string;
  mediaType: string;
  mediaName: string;
  poster?: string;
  videoId: string;
  timeOffsetMs: number;
  durationMs: number;
}

export function buildUpdatedLibraryItem(
  existing: StremioLibraryItem | undefined,
  params: UpdateLibraryItemParams
): StremioLibraryItem {
  const nowIso = new Date().toISOString();
  const safeOffset = Math.max(0, Math.round(params.timeOffsetMs));
  const safeDuration = Math.max(0, Math.round(params.durationMs));
  const prevState = existing?.state ?? {};
  const isCompleted = safeDuration > 0 && safeOffset / safeDuration >= 0.9;
  const timesWatched = (prevState.timesWatched ?? 0) + (isCompleted ? 1 : 0);

  return {
    _id: params.mediaId,
    name: existing?.name || params.mediaName,
    type: existing?.type || params.mediaType,
    poster: existing?.poster || params.poster,
    posterShape: existing?.posterShape || 'poster',
    removed: false,
    temp: existing?.temp ?? false,
    _ctime: existing?._ctime || nowIso,
    _mtime: nowIso,
    state: {
      ...prevState,
      lastWatched: nowIso,
      timeOffset: isCompleted ? 0 : safeOffset,
      timeWatched: safeOffset,
      duration: safeDuration || prevState.duration || 0,
      video_id: params.videoId,
      timesWatched,
      flaggedWatched: isCompleted ? 1 : prevState.flaggedWatched ?? 0,
    },
  };
}
