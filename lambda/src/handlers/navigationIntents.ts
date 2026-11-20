import { getIntentName, getSlotValue, type HandlerInput, type RequestHandler } from 'ask-sdk-core';
import type { Response } from 'ask-sdk-model';
import { EPISODES_PER_PAGE } from '../config/constants';
import { sanitizeSearchQuery } from '../security/validation';
import { sortEpisodes } from '../services/playbackProgress';
import { extractAlexaUserId } from '../services/storage/persistenceAdapter';
import {
  advanceToNextEpisode,
  buildCurrentNavEntry,
  getSessionState,
  getUserProfile,
  loadMetaCached,
  navigateBack,
  pushNavStack,
  renderDetail,
  renderHome,
  renderLogin,
  renderSearch,
  renderStreams,
  saveUserProfile,
  type SkillServices,
} from './helpers/navigation';

const NAVIGATION_INTENTS = new Set([
  'SearchMediaIntent',
  'GoHomeIntent',
  'OpenSearchIntent',
  'SelectSeasonIntent',
  'PlayEpisodeIntent',
  'NextEpisodeIntent',
  'RefreshAddonsIntent',
  'LogoutIntent',
  'GoBackIntent',
]);

export function createNavigationIntentHandler(
  services: SkillServices
): RequestHandler {
  return {
    canHandle(handlerInput: HandlerInput): boolean {
      if (handlerInput.requestEnvelope.request.type !== 'IntentRequest') {
        return false;
      }
      return NAVIGATION_INTENTS.has(getIntentName(handlerInput.requestEnvelope));
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
      const intentName = getIntentName(handlerInput.requestEnvelope);
      const profile = await getUserProfile(handlerInput);
      const session = getSessionState(handlerInput);

      if (!profile.authKey && intentName !== 'LogoutIntent') {
        return renderLogin(
          handlerInput,
          undefined,
          'Primero inicia sesión en Stremio usando la pantalla.'
        );
      }

      switch (intentName) {
        case 'SearchMediaIntent': {
          const rawQuery = getSlotValue(handlerInput.requestEnvelope, 'query') ?? '';
          const query = sanitizeSearchQuery(rawQuery);
          if (!query) {
            return renderSearch(
              handlerInput,
              services,
              profile,
              '',
              '¿Qué título quieres buscar?'
            );
          }
          const current = buildCurrentNavEntry(session);
          if (current) pushNavStack(handlerInput, current);
          return renderSearch(handlerInput, services, profile, query);
        }

        case 'OpenSearchIntent': {
          const current = buildCurrentNavEntry(session);
          if (current) pushNavStack(handlerInput, current);
          return renderSearch(handlerInput, services, profile, '');
        }

        case 'GoHomeIntent': {
          return renderHome(handlerInput, services, profile);
        }

        case 'SelectSeasonIntent': {
          const media = session.activeMedia;
          if (!media) {
            return handlerInput.responseBuilder
              .speak('Abre primero una serie para elegir temporada.')
              .getResponse();
          }
          const seasonVal = Number.parseInt(
            getSlotValue(handlerInput.requestEnvelope, 'season') ?? '1',
            10
          );
          const season = Number.isNaN(seasonVal) ? 1 : seasonVal;
          return renderDetail(
            handlerInput,
            services,
            profile,
            media.type,
            media.id,
            {
              season,
              episodePage: 0,
              speechText: `Temporada ${season}.`,
            }
          );
        }

        case 'PlayEpisodeIntent': {
          const media = session.activeMedia;
          if (!media) {
            return handlerInput.responseBuilder
              .speak('Abre primero una serie para elegir un episodio.')
              .getResponse();
          }
          const seasonSlot = getSlotValue(handlerInput.requestEnvelope, 'season');
          const episodeSlot = getSlotValue(handlerInput.requestEnvelope, 'episode');
          const targetSeason = seasonSlot
            ? Number.parseInt(seasonSlot, 10)
            : session.activeSeason ?? 1;
          const targetEpisode = episodeSlot
            ? Number.parseInt(episodeSlot, 10)
            : 1;

          const meta = await loadMetaCached(
            handlerInput,
            services,
            profile,
            media.type,
            media.id
          );
          const ordered = meta?.videos ? sortEpisodes(meta.videos) : [];
          const match = ordered.find(
            (v) =>
              (v.season ?? 1) === targetSeason &&
              (v.episode ?? 0) === targetEpisode
          );

          if (!match) {
            return renderDetail(
              handlerInput,
              services,
              profile,
              media.type,
              media.id,
              {
                season: targetSeason,
                episodePage: Math.max(
                  0,
                  Math.floor((targetEpisode - 1) / EPISODES_PER_PAGE)
                ),
                speechText: `No encontré el episodio ${targetEpisode} de la temporada ${targetSeason}.`,
              }
            );
          }

          const current = buildCurrentNavEntry(session);
          if (current) pushNavStack(handlerInput, current);
          const epTitle = match.title || match.name || `Episodio ${targetEpisode}`;
          return renderStreams(
            handlerInput,
            services,
            profile,
            media.type,
            media.id,
            match.id,
            `${media.name} - T${targetSeason}E${targetEpisode} ${epTitle}`,
            `Fuentes para temporada ${targetSeason} episodio ${targetEpisode}.`
          );
        }

        case 'NextEpisodeIntent': {
          return advanceToNextEpisode(handlerInput, services, profile);
        }

        case 'RefreshAddonsIntent': {
          const userId = extractAlexaUserId(handlerInput.requestEnvelope);
          await services.cacheStore.invalidateAll(userId);
          return renderHome(
            handlerInput,
            services,
            profile,
            'Addons y biblioteca actualizados.',
            true
          );
        }

        case 'LogoutIntent': {
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
            'He cerrado tu sesión de Stremio.'
          );
        }

        case 'GoBackIntent': {
          return navigateBack(handlerInput, services, profile);
        }

        default:
          return handlerInput.responseBuilder.getResponse();
      }
    },
  };
}
