import { getIntentName, getSlotValue, type HandlerInput, type RequestHandler } from 'ask-sdk-core';
import type { IntentRequest, Response } from 'ask-sdk-model';
import { APL_PLAYER_VIDEO_ID } from '../config/constants';
import { executeAplCommandsDirective, supportsApl } from '../apl/utils';
import { normalizeLanguageCode } from '../services/subtitleSelector';
import {
  advanceToNextEpisode,
  getSessionState,
  getUserProfile,
  loadSubtitlesCached,
  renderPlayer,
  renderStreams,
  saveUserProfile,
  type SkillServices,
} from './helpers/navigation';

const PLAYBACK_INTENTS = new Set([
  'AMAZON.PauseIntent',
  'AMAZON.ResumeIntent',
  'AMAZON.StartOverIntent',
  'AMAZON.NextIntent',
  'SeekIntent',
  'ChangeSubtitleIntent',
  'DisableSubtitleIntent',
  'SwitchStreamIntent',
]);

function getSlotResolutionId(
  request: IntentRequest,
  slotName: string
): string | undefined {
  const slot = request.intent?.slots?.[slotName];
  const res = slot?.resolutions?.resolutionsPerAuthority?.[0];
  if (res?.status?.code === 'ER_SUCCESS_MATCH') {
    return res.values?.[0]?.value?.id;
  }
  return slot?.value;
}

export function createPlaybackIntentHandler(
  services: SkillServices
): RequestHandler {
  return {
    canHandle(handlerInput: HandlerInput): boolean {
      if (handlerInput.requestEnvelope.request.type !== 'IntentRequest') {
        return false;
      }
      return PLAYBACK_INTENTS.has(getIntentName(handlerInput.requestEnvelope));
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
      const intentName = getIntentName(handlerInput.requestEnvelope);
      const profile = await getUserProfile(handlerInput);
      const session = getSessionState(handlerInput);

      if (session.currentScreen !== 'player') {
        if (intentName === 'AMAZON.NextIntent') {
          return advanceToNextEpisode(handlerInput, services, profile);
        }
        return handlerInput.responseBuilder
          .speak('Ahora mismo no hay ningún vídeo reproduciéndose.')
          .getResponse();
      }

      if (!supportsApl(handlerInput)) {
        return handlerInput.responseBuilder
          .speak('Control disponible solo en Echo Show.')
          .getResponse();
      }

      switch (intentName) {
        case 'AMAZON.PauseIntent': {
          return handlerInput.responseBuilder
            .addDirective(
              executeAplCommandsDirective([
                {
                  type: 'ControlMedia',
                  componentId: APL_PLAYER_VIDEO_ID,
                  command: 'pause',
                },
              ])
            )
            .getResponse();
        }

        case 'AMAZON.ResumeIntent': {
          return handlerInput.responseBuilder
            .addDirective(
              executeAplCommandsDirective([
                {
                  type: 'ControlMedia',
                  componentId: APL_PLAYER_VIDEO_ID,
                  command: 'play',
                },
              ])
            )
            .getResponse();
        }

        case 'AMAZON.StartOverIntent': {
          return handlerInput.responseBuilder
            .addDirective(
              executeAplCommandsDirective([
                {
                  type: 'ControlMedia',
                  componentId: APL_PLAYER_VIDEO_ID,
                  command: 'rewind',
                },
              ])
            )
            .getResponse();
        }

        case 'SeekIntent': {
          const request = handlerInput.requestEnvelope.request as IntentRequest;
          const direction =
            getSlotResolutionId(request, 'direction') ?? 'forward';
          const rawAmount = Number.parseInt(
            getSlotValue(handlerInput.requestEnvelope, 'amount') ?? '30',
            10
          );
          const amount = Number.isNaN(rawAmount) ? 30 : Math.max(1, rawAmount);
          const unit = getSlotResolutionId(request, 'unit') ?? 'seconds';
          const multiplier = unit === 'minutes' ? 60000 : 1000;
          const sign = direction === 'backward' ? -1 : 1;

          return handlerInput.responseBuilder
            .addDirective(
              executeAplCommandsDirective([
                {
                  type: 'ControlMedia',
                  componentId: APL_PLAYER_VIDEO_ID,
                  command: 'seek',
                  value: sign * amount * multiplier,
                },
              ])
            )
            .getResponse();
        }

        case 'AMAZON.NextIntent': {
          return advanceToNextEpisode(handlerInput, services, profile);
        }

        case 'DisableSubtitleIntent': {
          const updatedProfile = { ...profile, subtitleLang: 'off' };
          await saveUserProfile(handlerInput, updatedProfile);
          return renderPlayer(handlerInput, services, updatedProfile, {
            streamIndex: session.activeStreamIndex ?? 0,
            offsetMs: session.playbackOffsetMs ?? 0,
            subtitleId: 'off',
            speechText: 'Subtítulos desactivados.',
          });
        }

        case 'ChangeSubtitleIntent': {
          const request = handlerInput.requestEnvelope.request as IntentRequest;
          const rawLang =
            getSlotResolutionId(request, 'language') ??
            getSlotValue(handlerInput.requestEnvelope, 'language') ??
            'spa';

          if (rawLang === 'off') {
            const updatedProfile = { ...profile, subtitleLang: 'off' };
            await saveUserProfile(handlerInput, updatedProfile);
            return renderPlayer(handlerInput, services, updatedProfile, {
              streamIndex: session.activeStreamIndex ?? 0,
              offsetMs: session.playbackOffsetMs ?? 0,
              subtitleId: 'off',
              speechText: 'Subtítulos desactivados.',
            });
          }

          const { code, label } = normalizeLanguageCode(rawLang);
          const media = session.activeMedia;
          const videoId = session.activeVideoId ?? media?.id;

          const updatedProfile = { ...profile, subtitleLang: code };
          await saveUserProfile(handlerInput, updatedProfile);

          if (!media || !videoId) {
            return handlerInput.responseBuilder
              .speak(`Preferencia de subtítulos guardada en ${label}.`)
              .getResponse();
          }

          const subs = await loadSubtitlesCached(
            handlerInput,
            services,
            updatedProfile,
            media.type,
            videoId
          ).catch(() => []);
          const match = subs.find((s) => s.langCode === code);

          if (!match) {
            return handlerInput.responseBuilder
              .speak(`No encontré subtítulos en ${label} para este vídeo.`)
              .getResponse();
          }

          return renderPlayer(handlerInput, services, updatedProfile, {
            streamIndex: session.activeStreamIndex ?? 0,
            offsetMs: session.playbackOffsetMs ?? 0,
            subtitleId: match.id,
            speechText: `Subtítulos en ${match.langLabel}.`,
          });
        }

        case 'SwitchStreamIntent': {
          if (!session.activeMedia || !session.activeVideoId) {
            return handlerInput.responseBuilder
              .speak('No hay fuentes activas para cambiar.')
              .getResponse();
          }
          return renderStreams(
            handlerInput,
            services,
            profile,
            session.activeMedia.type,
            session.activeMedia.id,
            session.activeVideoId,
            session.activeVideoTitle,
            'Elige otra fuente en la pantalla.'
          );
        }

        default:
          return handlerInput.responseBuilder.getResponse();
      }
    },
  };
}
