import type { HandlerInput } from 'ask-sdk-core';
import type { Response } from 'ask-sdk-model';
import {
  CACHE_TTLS,
  DEFAULT_SUBTITLE_LANG,
  EPISODES_PER_PAGE,
  MAX_NAV_STACK,
} from '../../config/constants';
import { buildDetailScreen } from '../../apl/screens/detailScreen';
import { buildHomeScreen } from '../../apl/screens/homeScreen';
import { buildLoginScreen } from '../../apl/screens/loginScreen';
import { buildPlayerScreen } from '../../apl/screens/playerScreen';
import { buildSearchScreen } from '../../apl/screens/searchScreen';
import { buildStreamsScreen } from '../../apl/screens/streamsScreen';
import { renderAplDirective, supportsApl } from '../../apl/utils';
import { logger } from '../../security/logger';
import {
  sanitizeDisplayText,
  sanitizeSearchQuery,
  validateMediaId,
  validateMediaType,
} from '../../security/validation';
import type { StremioAddonClient } from '../../services/addonClient';
import {
  buildUpdatedLibraryItem,
  extractContinueWatching,
  findNextEpisode,
  parseSeasonEpisodeFromVideoId,
  sortEpisodes,
} from '../../services/playbackProgress';
import { extractAlexaUserId } from '../../services/storage/persistenceAdapter';
import type { CacheStore } from '../../services/storage/cacheStore';
import {
  StremioApiClient,
  StremioAuthError,
} from '../../services/stremioApiClient';
import { pickDefaultSubtitle } from '../../services/subtitleSelector';
import type {
  NavStackEntry,
  SessionState,
  UserProfile,
} from '../../types/session';
import type {
  AddonDescriptor,
  CatalogRow,
  ClassifiedStream,
  MediaType,
  MetaDetail,
  NormalizedSubtitle,
  StremioLibraryItem,
} from '../../types/stremio';

export interface SkillServices {
  stremioApi: StremioApiClient;
  addonClient: StremioAddonClient;
  cacheStore: CacheStore;
}

export async function getUserProfile(
  handlerInput: HandlerInput
): Promise<UserProfile> {
  const raw =
    (await handlerInput.attributesManager.getPersistentAttributes()) as Partial<UserProfile>;

  return {
    authKey: typeof raw.authKey === 'string' && raw.authKey ? raw.authKey : undefined,
    maskedEmail:
      typeof raw.maskedEmail === 'string' ? raw.maskedEmail : undefined,
    subtitleLang:
      typeof raw.subtitleLang === 'string' && raw.subtitleLang
        ? raw.subtitleLang
        : DEFAULT_SUBTITLE_LANG,
    updatedAt:
      typeof raw.updatedAt === 'string'
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export async function saveUserProfile(
  handlerInput: HandlerInput,
  profile: UserProfile
): Promise<void> {
  const sanitized: UserProfile = {
    authKey: profile.authKey,
    maskedEmail: profile.maskedEmail,
    subtitleLang: profile.subtitleLang || DEFAULT_SUBTITLE_LANG,
    updatedAt: new Date().toISOString(),
  };
  handlerInput.attributesManager.setPersistentAttributes(
    sanitized as unknown as Record<string, unknown>
  );
  await handlerInput.attributesManager.savePersistentAttributes();
}

export function getSessionState(handlerInput: HandlerInput): SessionState {
  return handlerInput.attributesManager.getSessionAttributes() as SessionState;
}

export function updateSessionState(
  handlerInput: HandlerInput,
  patch: Partial<SessionState>
): SessionState {
  const current = getSessionState(handlerInput);
  const next: SessionState = { ...current, ...patch };
  handlerInput.attributesManager.setSessionAttributes(
    next as unknown as Record<string, unknown>
  );
  return next;
}

export function pushNavStack(
  handlerInput: HandlerInput,
  entry: NavStackEntry
): void {
  const session = getSessionState(handlerInput);
  const stack = Array.isArray(session.navStack) ? [...session.navStack] : [];
  const last = stack[stack.length - 1];
  const isDuplicate =
    last &&
    last.screen === entry.screen &&
    last.mediaId === entry.mediaId &&
    last.videoId === entry.videoId;

  if (!isDuplicate) {
    stack.push(entry);
  }
  updateSessionState(handlerInput, {
    navStack: stack.slice(-MAX_NAV_STACK),
  });
}

export function buildCurrentNavEntry(session: SessionState): NavStackEntry | null {
  if (!session.currentScreen || session.currentScreen === 'login') {
    return null;
  }
  return {
    screen: session.currentScreen,
    mediaType: session.activeMedia?.type,
    mediaId: session.activeMedia?.id,
    videoId: session.activeVideoId,
    season: session.activeSeason,
    episodePage: session.episodePage,
    query: session.lastQuery,
  };
}

export async function handleAuthExpired(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  message = 'Tu sesión de Stremio ha caducado. Inicia sesión de nuevo en la pantalla.'
): Promise<Response> {
  const userId = extractAlexaUserId(handlerInput.requestEnvelope);
  await services.cacheStore.invalidateAll(userId);
  await saveUserProfile(handlerInput, {
    subtitleLang: profile.subtitleLang,
    updatedAt: new Date().toISOString(),
  });
  handlerInput.attributesManager.setSessionAttributes({});
  return renderLogin(
    handlerInput,
    'Sesión caducada. Vuelve a introducir tus credenciales.',
    message
  );
}

export async function ensureAddons(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  forceRefresh = false
): Promise<AddonDescriptor[]> {
  if (!profile.authKey) {
    throw new StremioAuthError('No authKey');
  }

  const userId = extractAlexaUserId(handlerInput.requestEnvelope);
  if (!forceRefresh) {
    const cached = await services.cacheStore.get<AddonDescriptor[]>(
      userId,
      'addons'
    );
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  const addons = await services.stremioApi.getAddonCollection(profile.authKey);
  await services.cacheStore.set(userId, 'addons', addons, CACHE_TTLS.ADDONS);
  return addons;
}

export async function getLibraryCached(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  forceRefresh = false
): Promise<StremioLibraryItem[]> {
  if (!profile.authKey) {
    return [];
  }

  const userId = extractAlexaUserId(handlerInput.requestEnvelope);
  if (!forceRefresh) {
    const cached = await services.cacheStore.get<StremioLibraryItem[]>(
      userId,
      'library'
    );
    if (cached) {
      return cached;
    }
  }

  const items = await services.stremioApi.getLibraryItems(profile.authKey);
  await services.cacheStore.set(userId, 'library', items, 120);
  return items;
}

export function renderLogin(
  handlerInput: HandlerInput,
  errorMessage?: string,
  speechText?: string
): Response {
  updateSessionState(handlerInput, { currentScreen: 'login' });

  const builder = handlerInput.responseBuilder;
  if (supportsApl(handlerInput)) {
    const { document, datasources } = buildLoginScreen({ errorMessage });
    builder.addDirective(renderAplDirective(document, datasources));
  }
  if (speechText) {
    builder.speak(speechText);
  }
  return builder.getResponse();
}

export async function renderHome(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  speechText?: string,
  forceRefresh = false
): Promise<Response> {
  if (!profile.authKey) {
    return renderLogin(
      handlerInput,
      undefined,
      'Inicia sesión con tu cuenta de Stremio en la pantalla para empezar.'
    );
  }

  try {
    const userId = extractAlexaUserId(handlerInput.requestEnvelope);
    const [addons, libraryItems] = await Promise.all([
      ensureAddons(handlerInput, services, profile, forceRefresh),
      getLibraryCached(handlerInput, services, profile, forceRefresh).catch(
        (err) => {
          if (err instanceof StremioAuthError) throw err;
          return [] as StremioLibraryItem[];
        }
      ),
    ]);

    let catalogs: CatalogRow[] | null = forceRefresh
      ? null
      : await services.cacheStore.get<CatalogRow[]>(userId, 'board');

    if (!catalogs) {
      catalogs = await services.addonClient.fetchHomeCatalogs(addons);
      await services.cacheStore.set(userId, 'board', catalogs, CACHE_TTLS.BOARD);
    }

    const continueWatching = extractContinueWatching(libraryItems);

    updateSessionState(handlerInput, {
      currentScreen: 'home',
      navStack: [],
    });

    const builder = handlerInput.responseBuilder;
    if (supportsApl(handlerInput)) {
      const { document, datasources } = buildHomeScreen({
        maskedEmail: profile.maskedEmail,
        continueWatching,
        catalogs,
      });
      builder.addDirective(renderAplDirective(document, datasources));
    }
    if (speechText) {
      builder.speak(speechText);
    }
    return builder.getResponse();
  } catch (err) {
    if (err instanceof StremioAuthError) {
      return handleAuthExpired(handlerInput, services, profile);
    }
    throw err;
  }
}

export async function renderSearch(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  rawQuery?: string,
  speechText?: string
): Promise<Response> {
  if (!profile.authKey) {
    return renderLogin(handlerInput);
  }

  try {
    const query = rawQuery ? sanitizeSearchQuery(rawQuery) : '';
    let results: Awaited<ReturnType<StremioAddonClient['searchCatalogs']>> = [];
    let searched = false;

    if (query) {
      const addons = await ensureAddons(handlerInput, services, profile);
      results = await services.addonClient.searchCatalogs(addons, query);
      searched = true;
    }

    updateSessionState(handlerInput, {
      currentScreen: 'search',
      lastQuery: query,
    });

    const builder = handlerInput.responseBuilder;
    if (supportsApl(handlerInput)) {
      const { document, datasources } = buildSearchScreen({
        maskedEmail: profile.maskedEmail,
        query,
        results,
        searched,
      });
      builder.addDirective(renderAplDirective(document, datasources));
    }

    const spoken =
      speechText ??
      (searched
        ? results.length > 0
          ? `Encontré ${results.length} resultados para ${query}.`
          : `No encontré resultados para ${query}.`
        : 'Escribe o dime qué quieres buscar.');

    builder.speak(spoken);
    return builder.getResponse();
  } catch (err) {
    if (err instanceof StremioAuthError) {
      return handleAuthExpired(handlerInput, services, profile);
    }
    throw err;
  }
}

export async function loadMetaCached(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  mediaType: MediaType,
  mediaId: string
): Promise<MetaDetail | null> {
  const userId = extractAlexaUserId(handlerInput.requestEnvelope);
  const cacheKey = `meta:${mediaType}:${mediaId}`;
  const cached = await services.cacheStore.get<MetaDetail>(userId, cacheKey);
  if (cached) {
    return cached;
  }

  const addons = await ensureAddons(handlerInput, services, profile);
  const meta = await services.addonClient.fetchMeta(addons, mediaType, mediaId);
  if (meta) {
    await services.cacheStore.set(userId, cacheKey, meta, CACHE_TTLS.META);
  }
  return meta;
}

export async function renderDetail(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  rawType: string,
  rawId: string,
  opts: {
    season?: number;
    episodePage?: number;
    focusVideoId?: string;
    speechText?: string;
  } = {}
): Promise<Response> {
  if (!profile.authKey) {
    return renderLogin(handlerInput);
  }

  const mediaType = validateMediaType(rawType);
  const mediaId = validateMediaId(rawId);
  if (!mediaType || !mediaId) {
    return handlerInput.responseBuilder
      .speak('No he podido identificar ese contenido.')
      .getResponse();
  }

  try {
    const [meta, libraryItems] = await Promise.all([
      loadMetaCached(handlerInput, services, profile, mediaType, mediaId),
      getLibraryCached(handlerInput, services, profile).catch(() => [] as StremioLibraryItem[]),
    ]);

    if (!meta) {
      return handlerInput.responseBuilder
        .speak('No encontré la ficha de ese título en tus addons.')
        .getResponse();
    }

    const libEntry = libraryItems.find((item) => item._id === mediaId);
    const resumeVideoId = opts.focusVideoId || libEntry?.state?.video_id;
    const resumeOffsetMs = libEntry?.state?.timeOffset;

    let selectedSeason = opts.season;
    let episodePage = opts.episodePage;

    if (selectedSeason === undefined && resumeVideoId && meta.videos?.length) {
      const parsed = parseSeasonEpisodeFromVideoId(resumeVideoId);
      if (parsed.season !== undefined) {
        selectedSeason = parsed.season;
        const seasonEps = sortEpisodes(meta.videos).filter(
          (v) => (v.season ?? 1) === parsed.season
        );
        const epIdx = seasonEps.findIndex((v) => v.id === resumeVideoId);
        if (epIdx >= 0 && episodePage === undefined) {
          episodePage = Math.floor(epIdx / EPISODES_PER_PAGE);
        }
      }
    }

    updateSessionState(handlerInput, {
      currentScreen: 'detail',
      activeMedia: {
        type: meta.type,
        id: meta.id,
        name: meta.name,
        poster: meta.poster,
      },
      activeSeason: selectedSeason,
      episodePage: episodePage ?? 0,
    });

    const builder = handlerInput.responseBuilder;
    if (supportsApl(handlerInput)) {
      const { document, datasources } = buildDetailScreen({
        maskedEmail: profile.maskedEmail,
        meta,
        selectedSeason,
        episodePage,
        resumeVideoId,
        resumeOffsetMs,
      });
      builder.addDirective(renderAplDirective(document, datasources));
    }

    if (opts.speechText) {
      builder.speak(opts.speechText);
    }

    return builder.getResponse();
  } catch (err) {
    if (err instanceof StremioAuthError) {
      return handleAuthExpired(handlerInput, services, profile);
    }
    throw err;
  }
}

export async function loadStreamsCached(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  mediaType: MediaType,
  videoId: string
): Promise<ClassifiedStream[]> {
  const userId = extractAlexaUserId(handlerInput.requestEnvelope);
  const cacheKey = `streams:${mediaType}:${videoId}`;
  const cached = await services.cacheStore.get<ClassifiedStream[]>(
    userId,
    cacheKey
  );
  if (cached) {
    return cached;
  }

  const addons = await ensureAddons(handlerInput, services, profile);
  const streams = await services.addonClient.fetchStreams(
    addons,
    mediaType,
    videoId
  );
  if (streams.length > 0) {
    await services.cacheStore.set(userId, cacheKey, streams, CACHE_TTLS.STREAMS);
  }
  return streams;
}

export async function loadSubtitlesCached(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  mediaType: MediaType,
  videoId: string
): Promise<NormalizedSubtitle[]> {
  const userId = extractAlexaUserId(handlerInput.requestEnvelope);
  const cacheKey = `subtitles:${mediaType}:${videoId}:${profile.subtitleLang}`;
  const cached = await services.cacheStore.get<NormalizedSubtitle[]>(
    userId,
    cacheKey
  );
  if (cached) {
    return cached;
  }

  const addons = await ensureAddons(handlerInput, services, profile);
  const subtitles = await services.addonClient.fetchSubtitles(
    addons,
    mediaType,
    videoId,
    profile.subtitleLang
  );
  if (subtitles.length > 0) {
    await services.cacheStore.set(
      userId,
      cacheKey,
      subtitles,
      CACHE_TTLS.SUBTITLES
    );
  }
  return subtitles;
}

export async function renderStreams(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  rawType: string,
  rawMediaId: string,
  rawVideoId: string,
  videoTitle?: string,
  speechText?: string
): Promise<Response> {
  if (!profile.authKey) {
    return renderLogin(handlerInput);
  }

  const mediaType = validateMediaType(rawType);
  const mediaId = validateMediaId(rawMediaId);
  const videoId = validateMediaId(rawVideoId);
  if (!mediaType || !mediaId || !videoId) {
    return handlerInput.responseBuilder
      .speak('No se pudo cargar esa fuente de vídeo.')
      .getResponse();
  }

  try {
    const streams = await loadStreamsCached(
      handlerInput,
      services,
      profile,
      mediaType,
      videoId
    );

    const session = getSessionState(handlerInput);
    const displayTitle = sanitizeDisplayText(
      videoTitle || session.activeMedia?.name || mediaId,
      100
    );

    updateSessionState(handlerInput, {
      currentScreen: 'streams',
      activeMedia: session.activeMedia?.id === mediaId
        ? session.activeMedia
        : { type: mediaType, id: mediaId, name: displayTitle },
      activeVideoId: videoId,
      activeVideoTitle: displayTitle,
    });

    const builder = handlerInput.responseBuilder;
    if (supportsApl(handlerInput)) {
      const { document, datasources } = buildStreamsScreen({
        maskedEmail: profile.maskedEmail,
        mediaTitle: displayTitle,
        streams,
      });
      builder.addDirective(renderAplDirective(document, datasources));
    }

    if (speechText) {
      builder.speak(speechText);
    } else if (streams.length === 0) {
      builder.speak(
        'No encontré streams HTTPS directos compatibles en tus addons.'
      );
    }

    return builder.getResponse();
  } catch (err) {
    if (err instanceof StremioAuthError) {
      return handleAuthExpired(handlerInput, services, profile);
    }
    throw err;
  }
}

export async function renderPlayer(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  opts: {
    streamIndex?: number;
    offsetMs?: number;
    subtitleId?: string;
    speechText?: string;
  } = {}
): Promise<Response> {
  if (!profile.authKey) {
    return renderLogin(handlerInput);
  }

  const session = getSessionState(handlerInput);
  const media = session.activeMedia;
  const videoId = session.activeVideoId ?? media?.id;

  if (!media || !videoId) {
    return renderHome(
      handlerInput,
      services,
      profile,
      'No hay ningún vídeo seleccionado.'
    );
  }

  try {
    const [streams, subtitles, meta, libraryItems] = await Promise.all([
      loadStreamsCached(handlerInput, services, profile, media.type, videoId),
      loadSubtitlesCached(
        handlerInput,
        services,
        profile,
        media.type,
        videoId
      ).catch(() => [] as NormalizedSubtitle[]),
      loadMetaCached(handlerInput, services, profile, media.type, media.id).catch(
        () => null
      ),
      getLibraryCached(handlerInput, services, profile).catch(
        () => [] as StremioLibraryItem[]
      ),
    ]);

    if (streams.length === 0) {
      return renderStreams(
        handlerInput,
        services,
        profile,
        media.type,
        media.id,
        videoId,
        session.activeVideoTitle,
        'No encontré fuentes HTTPS compatibles para reproducir.'
      );
    }

    const idx = opts.streamIndex ?? session.activeStreamIndex ?? 0;
    const activeStream = streams[idx] ?? streams[0];

    const chosenSubId =
      opts.subtitleId !== undefined
        ? opts.subtitleId
        : session.activeSubtitleId;

    let activeSubtitle: NormalizedSubtitle | null = null;
    if (chosenSubId === 'off') {
      activeSubtitle = null;
    } else if (chosenSubId) {
      activeSubtitle =
        subtitles.find((s) => s.id === chosenSubId) ??
        pickDefaultSubtitle(subtitles, profile.subtitleLang);
    } else {
      activeSubtitle = pickDefaultSubtitle(subtitles, profile.subtitleLang);
    }

    let offsetMs = opts.offsetMs;
    let durationMs = session.playbackDurationMs ?? 0;

    if (offsetMs === undefined) {
      const libItem = libraryItems.find((item) => item._id === media.id);
      if (libItem?.state?.video_id === videoId && libItem.state.timeOffset) {
        offsetMs = libItem.state.timeOffset;
        durationMs = libItem.state.duration ?? durationMs;
      } else {
        offsetMs = 0;
      }
    }

    const hasNextEpisode = Boolean(findNextEpisode(meta, videoId));

    updateSessionState(handlerInput, {
      currentScreen: 'player',
      activeStreamIndex: activeStream.index,
      activeSubtitleId: activeSubtitle ? activeSubtitle.id : 'off',
      playbackOffsetMs: offsetMs,
      playbackDurationMs: durationMs,
    });

    const builder = handlerInput.responseBuilder;
    if (supportsApl(handlerInput)) {
      const { document, datasources } = buildPlayerScreen({
        title: session.activeVideoTitle || media.name,
        activeStream,
        activeSubtitle,
        streams,
        subtitles,
        offsetMs,
        durationMs,
        hasNextEpisode,
      });
      builder.addDirective(renderAplDirective(document, datasources));
    }

    if (opts.speechText) {
      builder.speak(opts.speechText);
    }

    return builder.getResponse();
  } catch (err) {
    if (err instanceof StremioAuthError) {
      return handleAuthExpired(handlerInput, services, profile);
    }
    throw err;
  }
}

export async function persistPlaybackProgress(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  rawOffsetMs: number,
  rawDurationMs: number
): Promise<void> {
  if (!profile.authKey) {
    return;
  }

  const session = getSessionState(handlerInput);
  const media = session.activeMedia;
  const videoId = session.activeVideoId ?? media?.id;
  if (!media || !videoId) {
    return;
  }

  const timeOffsetMs = Number.isFinite(rawOffsetMs)
    ? Math.max(0, Math.round(rawOffsetMs))
    : session.playbackOffsetMs ?? 0;
  const durationMs = Number.isFinite(rawDurationMs)
    ? Math.max(0, Math.round(rawDurationMs))
    : session.playbackDurationMs ?? 0;

  updateSessionState(handlerInput, {
    playbackOffsetMs: timeOffsetMs,
    playbackDurationMs: durationMs,
  });

  try {
    const userId = extractAlexaUserId(handlerInput.requestEnvelope);
    const cachedLib =
      (await services.cacheStore.get<StremioLibraryItem[]>(userId, 'library')) ??
      [];
    const existing = cachedLib.find((item) => item._id === media.id);

    const updatedItem = buildUpdatedLibraryItem(existing, {
      mediaId: media.id,
      mediaType: media.type,
      mediaName: media.name,
      poster: media.poster,
      videoId,
      timeOffsetMs,
      durationMs,
    });

    const nextLib = [
      updatedItem,
      ...cachedLib.filter((item) => item._id !== media.id),
    ];
    await services.cacheStore.set(userId, 'library', nextLib, 120);
    await services.stremioApi.putLibraryItem(profile.authKey, updatedItem);
  } catch (err) {
    if (err instanceof StremioAuthError) {
      logger.warn('Auth expired while saving playback progress');
      return;
    }
    logger.warn('Failed to sync progress to Stremio', { error: err });
  }
}

export async function navigateBack(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  speechText?: string
): Promise<Response> {
  const session = getSessionState(handlerInput);
  const stack = Array.isArray(session.navStack) ? [...session.navStack] : [];
  const previous = stack.pop();

  updateSessionState(handlerInput, { navStack: stack });

  if (!previous || previous.screen === 'home') {
    return renderHome(handlerInput, services, profile, speechText);
  }

  if (previous.screen === 'search') {
    return renderSearch(
      handlerInput,
      services,
      profile,
      previous.query,
      speechText
    );
  }

  if (previous.screen === 'detail' && previous.mediaType && previous.mediaId) {
    return renderDetail(
      handlerInput,
      services,
      profile,
      previous.mediaType,
      previous.mediaId,
      {
        season: previous.season,
        episodePage: previous.episodePage,
        speechText,
      }
    );
  }

  if (
    previous.screen === 'streams' &&
    previous.mediaType &&
    previous.mediaId &&
    previous.videoId
  ) {
    return renderStreams(
      handlerInput,
      services,
      profile,
      previous.mediaType,
      previous.mediaId,
      previous.videoId,
      undefined,
      speechText
    );
  }

  return renderHome(handlerInput, services, profile, speechText);
}

export async function advanceToNextEpisode(
  handlerInput: HandlerInput,
  services: SkillServices,
  profile: UserProfile,
  currentOffsetMs?: number,
  currentDurationMs?: number
): Promise<Response> {
  if (!profile.authKey) {
    return renderLogin(handlerInput);
  }

  const session = getSessionState(handlerInput);
  const media = session.activeMedia;
  const currentVideoId = session.activeVideoId;

  if (!media || !currentVideoId) {
    return handlerInput.responseBuilder
      .speak('No hay ninguna serie activa para pasar al siguiente episodio.')
      .getResponse();
  }

  if (currentOffsetMs !== undefined || currentDurationMs !== undefined) {
    await persistPlaybackProgress(
      handlerInput,
      services,
      profile,
      currentOffsetMs ?? session.playbackOffsetMs ?? 0,
      currentDurationMs ?? session.playbackDurationMs ?? 0
    );
  }

  const meta = await loadMetaCached(
    handlerInput,
    services,
    profile,
    media.type,
    media.id
  );
  const nextEp = findNextEpisode(meta, currentVideoId);

  if (!nextEp) {
    return renderDetail(handlerInput, services, profile, media.type, media.id, {
      speechText: 'Has llegado al último episodio disponible.',
    });
  }

  const seasonLabel = nextEp.season ?? 1;
  const epNum = nextEp.episode ?? 0;
  const epName = nextEp.title || nextEp.name || `Episodio ${epNum}`;
  const nextTitle = `${media.name} - T${seasonLabel}E${epNum} ${epName}`;

  const streams = await loadStreamsCached(
    handlerInput,
    services,
    profile,
    media.type,
    nextEp.id
  );

  updateSessionState(handlerInput, {
    activeVideoId: nextEp.id,
    activeVideoTitle: nextTitle,
    activeSeason: seasonLabel,
    activeStreamIndex: 0,
    playbackOffsetMs: 0,
    playbackDurationMs: 0,
  });

  if (streams.length === 0) {
    return renderStreams(
      handlerInput,
      services,
      profile,
      media.type,
      media.id,
      nextEp.id,
      nextTitle,
      `No encontré fuentes compatibles para el episodio ${epNum}.`
    );
  }

  return renderPlayer(handlerInput, services, profile, {
    streamIndex: 0,
    offsetMs: 0,
    speechText: `Reproduciendo episodio ${epNum}.`,
  });
}
