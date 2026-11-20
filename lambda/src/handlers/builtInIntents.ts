import { getIntentName, type HandlerInput, type RequestHandler } from 'ask-sdk-core';
import type { Response } from 'ask-sdk-model';
import {
  getSessionState,
  getUserProfile,
  navigateBack,
  persistPlaybackProgress,
  renderHome,
  type SkillServices,
} from './helpers/navigation';

export function createBuiltInIntentHandlers(
  services: SkillServices
): RequestHandler[] {
  const navigateHomeHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
      return (
        handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
        getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NavigateHomeIntent'
      );
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
      const profile = await getUserProfile(handlerInput);
      return renderHome(handlerInput, services, profile);
    },
  };

  const previousHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
      return (
        handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
        getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PreviousIntent'
      );
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
      const profile = await getUserProfile(handlerInput);
      return navigateBack(handlerInput, services, profile);
    },
  };

  const helpHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
      return (
        handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
        getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
      );
    },
    handle(handlerInput: HandlerInput): Response {
      return handlerInput.responseBuilder
        .speak(
          'Puedes decir "busca One Piece", "temporada 2", "pon subtítulos en español", "siguiente episodio" o navegar tocando la pantalla.'
        )
        .getResponse();
    },
  };

  const cancelStopHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
      if (handlerInput.requestEnvelope.request.type !== 'IntentRequest') {
        return false;
      }
      const name = getIntentName(handlerInput.requestEnvelope);
      return name === 'AMAZON.CancelIntent' || name === 'AMAZON.StopIntent';
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
      const session = getSessionState(handlerInput);
      if (session.currentScreen === 'player') {
        const profile = await getUserProfile(handlerInput);
        await persistPlaybackProgress(
          handlerInput,
          services,
          profile,
          session.playbackOffsetMs ?? 0,
          session.playbackDurationMs ?? 0
        );
      }

      return handlerInput.responseBuilder
        .speak('Hasta luego.')
        .withShouldEndSession(true)
        .getResponse();
    },
  };

  const fallbackHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
      return (
        handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
        getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
      );
    },
    handle(handlerInput: HandlerInput): Response {
      return handlerInput.responseBuilder
        .speak(
          'No te he entendido bien. Prueba con "busca" seguido de un título o usa la pantalla.'
        )
        .getResponse();
    },
  };

  const sessionEndedHandler: RequestHandler = {
    canHandle(handlerInput: HandlerInput): boolean {
      return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput: HandlerInput): Response {
      return handlerInput.responseBuilder.getResponse();
    },
  };

  return [
    navigateHomeHandler,
    previousHandler,
    helpHandler,
    cancelStopHandler,
    fallbackHandler,
    sessionEndedHandler,
  ];
}
