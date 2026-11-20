import type { HandlerInput, RequestHandler } from 'ask-sdk-core';
import type { Response, interfaces } from 'ask-sdk-model';
import { DEFAULT_SUBTITLE_LANG } from '../config/constants';
import { logger } from '../security/logger';
import {
  isValidEmail,
  maskEmail,
  sanitizeSearchQuery,
} from '../security/validation';
import { extractAlexaUserId } from '../services/storage/persistenceAdapter';
import { StremioAuthError } from '../services/stremioApiClient';
import {
  advanceToNextEpisode,
  buildCurrentNavEntry,
  getSessionState,
  getUserProfile,
  loadSubtitlesCached,
  navigateBack,
  persistPlaybackProgress,
  pushNavStack,
  renderDetail,
  renderHome,
  renderLogin,
  renderPlayer,
  renderSearch,
  renderStreams,
  saveUserProfile,
  updateSessionState,
  type SkillServices,
} from './helpers/navigation';

function extractComponentValue(
  components: Record<string, unknown> | undefined,
  id: string
): string {
  if (!components) return '';
  const entry = components[id];
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const obj = entry as Record<string, unknown>;
    if (typeof obj.value === 'string') return obj.value;
    if (typeof obj.text === 'string') return obj.text;
  }
  return '';
}

function parseNumberArg(val: unknown, fallback = 0): number {
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

export function createAplEventHandler(services: SkillServices): RequestHandler {
  return {
    canHandle(handlerInput: HandlerInput): boolean {
      return (
        handlerInput.requestEnvelope.request.type ===
        'Alexa.Presentation.APL.UserEvent'
      );
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
      const request = handlerInput.requestEnvelope
        .request as interfaces.alexa.presentation.apl.UserEvent;
      const args = Array.isArray(request.arguments) ? request.arguments : [];
      const components = request.components as Record<string, unknown> | undefined;
      const action = String(args[0] ?? '');

      const profile = await getUserProfile(handlerInput);
      const session = getSessionState(handlerInput);

      switch (action) {
        case 'LOGIN_SUBMIT': {
          const email = (
            extractComponentValue(components, 'emailInput') ||
            String(args[1] ?? '')
          ).trim();
          const password =
            extractComponentValue(components, 'passwordInput') ||
            String(args[2] ?? '');

          if (!isValidEmail(email) || !password) {
            return renderLogin(
              handlerInput,
              'Introduce un correo válido y tu contraseña de Stremio.',
              'Introduce tu correo y contraseña en la pantalla.'
            );
          }

          try {
            const loginResult = await services.stremioApi.login(email, password);
            const updatedProfile = {
              authKey: loginResult.authKey,
              maskedEmail: maskEmail(email),
              subtitleLang: profile.subtitleLang || DEFAULT_SUBTITLE_LANG,
              updatedAt: new Date().toISOString(),
            };
            await saveUserProfile(handlerInput, updatedProfile);
            return renderHome(
              handlerInput,
              services,
              updatedProfile,
              'Sesión iniciada correctamente.',
              true
            );
          } catch (err) {
            if (err instanceof StremioAuthError) {
              return renderLogin(
                handlerInput,
                'Correo o contraseña de Stremio incorrectos.',
                'Correo o contraseña incorrectos. Inténtalo de nuevo.'
              );
            }
            logger.warn('Stremio login failed unexpectedly', { error: err });
            return renderLogin(
              handlerInput,
              'No se pudo conectar con Stremio en este momento.',
              'Error de conexión con Stremio.'
            );
          }
        }

        case 'NAV_HOME': {
          return renderHome(handlerInput, services, profile);
        }

        case 'NAV_SEARCH': {
          const current = buildCurrentNavEntry(session);
          if (current) pushNavStack(handlerInput, current);
          return renderSearch(handlerInput, services, profile, '');
        }

        case 'NAV_BACK': {
          return navigateBack(handlerInput, services, profile);
        }

        case 'REFRESH_ADDONS': {
          const userId = extractAlexaUserId(handlerInput.requestEnvelope);
          await services.cacheStore.invalidateAll(userId);
          return renderHome(
            handlerInput,
            services,
            profile,
            'Addons y biblioteca sincronizados.',
            true
          );
        }

        case 'LOGOUT': {
          const userId = extractAlexaUserId(handlerInput.requestEnvelope);
          await services.cacheStore.invalidateAll(userId);
          await saveUserProfile(handlerInput, {
            subtitleLang: profile.subtitleLang,
            updatedAt: new Date().toISOString(),
          });
          handlerInput.attributesManager.setSessionAttributes({});
          return renderLogin(
            handlerInput,
            undefined,
            'Sesión cerrada. Hasta pronto.'
          );
        }

        case 'SEARCH_SUBMIT': {
          const rawQuery =
            extractComponentValue(components, 'searchInput') ||
            String(args[1] ?? '');
          const cleanQuery = sanitizeSearchQuery(rawQuery);
          if (!cleanQuery) {
            return renderSearch(
              handlerInput,
              services,
              profile,
              '',
              'Escribe o dime qué película o serie quieres buscar.'
            );
          }
          return renderSearch(handlerInput, services, profile, cleanQuery);
        }

        case 'OPEN_DETAIL': {
          const type = String(args[1] ?? '');
          const id = String(args[2] ?? '');
          const videoId = args[3] ? String(args[3]) : undefined;
          const current = buildCurrentNavEntry(session);
          if (current) pushNavStack(handlerInput, current);
          return renderDetail(handlerInput, services, profile, type, id, {
            focusVideoId: videoId,
          });
        }

        case 'SELECT_SEASON': {
          const media = session.activeMedia;
          if (!media) {
            return renderHome(handlerInput, services, profile);
          }
          const season = parseNumberArg(args[1], 1);
          return renderDetail(
            handlerInput,
            services,
            profile,
            media.type,
            media.id,
            { season, episodePage: 0 }
          );
        }

        case 'SELECT_EPISODE_PAGE': {
          const media = session.activeMedia;
          if (!media) {
            return renderHome(handlerInput, services, profile);
          }
          const episodePage = parseNumberArg(args[1], 0);
          return renderDetail(
            handlerInput,
            services,
            profile,
            media.type,
            media.id,
            { season: session.activeSeason, episodePage }
          );
        }

        case 'OPEN_STREAMS': {
          const type = String(args[1] ?? '');
          const id = String(args[2] ?? '');
          const videoId = String(args[3] ?? id);
          const videoTitle = args[4] ? String(args[4]) : undefined;
          const current = buildCurrentNavEntry(session);
          if (current) pushNavStack(handlerInput, current);
          return renderStreams(
            handlerInput,
            services,
            profile,
            type,
            id,
            videoId,
            videoTitle
          );
        }

        case 'PLAY_STREAM': {
          const streamIndex = parseNumberArg(args[1], 0);
          const current = buildCurrentNavEntry(session);
          if (current) pushNavStack(handlerInput, current);
          return renderPlayer(handlerInput, services, profile, {
            streamIndex,
          });
        }

        case 'SAVE_PROGRESS': {
          const offsetMs = parseNumberArg(args[1], session.playbackOffsetMs ?? 0);
          const durationMs = parseNumberArg(
            args[2],
            session.playbackDurationMs ?? 0
          );
          await persistPlaybackProgress(
            handlerInput,
            services,
            profile,
            offsetMs,
            durationMs
          );
          // Do NOT re-render APL document when pausing so playback position stays intact
          return handlerInput.responseBuilder.getResponse();
        }

        case 'VIDEO_ENDED': {
          const offsetMs = parseNumberArg(args[1], session.playbackOffsetMs ?? 0);
          const durationMs = parseNumberArg(
            args[2],
            session.playbackDurationMs ?? 0
          );
          await persistPlaybackProgress(
            handlerInput,
            services,
            profile,
            durationMs > 0 ? durationMs : offsetMs,
            durationMs
          );
          return handlerInput.responseBuilder.getResponse();
        }

        case 'PLAYER_BACK': {
          const offsetMs = parseNumberArg(args[1], session.playbackOffsetMs ?? 0);
          const durationMs = parseNumberArg(
            args[2],
            session.playbackDurationMs ?? 0
          );
          await persistPlaybackProgress(
            handlerInput,
            services,
            profile,
            offsetMs,
            durationMs
          );
          return navigateBack(handlerInput, services, profile);
        }

        case 'SELECT_SUBTITLE': {
          const subtitleId = String(args[1] ?? 'off');
          const offsetMs = parseNumberArg(args[2], session.playbackOffsetMs ?? 0);
          const durationMs = parseNumberArg(
            args[3],
            session.playbackDurationMs ?? 0
          );

          await persistPlaybackProgress(
            handlerInput,
            services,
            profile,
            offsetMs,
            durationMs
          );

          let nextLang = profile.subtitleLang;
          if (subtitleId === 'off') {
            nextLang = 'off';
          } else if (session.activeMedia && session.activeVideoId) {
            const subs = await loadSubtitlesCached(
              handlerInput,
              services,
              profile,
              session.activeMedia.type,
              session.activeVideoId
            ).catch(() => []);
            const chosen = subs.find((s) => s.id === subtitleId);
            if (chosen) {
              nextLang = chosen.langCode;
            }
          }

          const updatedProfile = {
            ...profile,
            subtitleLang: nextLang,
          };
          await saveUserProfile(handlerInput, updatedProfile);
          updateSessionState(handlerInput, { playbackDurationMs: durationMs });

          return renderPlayer(handlerInput, services, updatedProfile, {
            streamIndex: session.activeStreamIndex ?? 0,
            offsetMs,
            subtitleId,
          });
        }

        case 'SWITCH_STREAM': {
          const streamIndex = parseNumberArg(args[1], 0);
          const offsetMs = parseNumberArg(args[2], session.playbackOffsetMs ?? 0);
          const durationMs = parseNumberArg(
            args[3],
            session.playbackDurationMs ?? 0
          );

          await persistPlaybackProgress(
            handlerInput,
            services,
            profile,
            offsetMs,
            durationMs
          );
          updateSessionState(handlerInput, { playbackDurationMs: durationMs });

          return renderPlayer(handlerInput, services, profile, {
            streamIndex,
            offsetMs,
            subtitleId: session.activeSubtitleId,
          });
        }

        case 'NEXT_EPISODE': {
          const offsetMs = parseNumberArg(args[1], session.playbackOffsetMs ?? 0);
          const durationMs = parseNumberArg(
            args[2],
            session.playbackDurationMs ?? 0
          );
          return advanceToNextEpisode(
            handlerInput,
            services,
            profile,
            offsetMs,
            durationMs
          );
        }

        default: {
          logger.warn('Unhandled APL UserEvent action', { action });
          return handlerInput.responseBuilder.getResponse();
        }
      }
    },
  };
}
