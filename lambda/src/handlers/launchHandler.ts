import type { HandlerInput, RequestHandler } from 'ask-sdk-core';
import type { Response } from 'ask-sdk-model';
import { supportsApl } from '../apl/utils';
import {
  getUserProfile,
  renderHome,
  renderLogin,
  type SkillServices,
} from './helpers/navigation';

export function createLaunchHandler(services: SkillServices): RequestHandler {
  return {
    canHandle(handlerInput: HandlerInput): boolean {
      return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput: HandlerInput): Promise<Response> {
      if (!supportsApl(handlerInput)) {
        return handlerInput.responseBuilder
          .speak(
            'Stremio para Alexa requiere un dispositivo con pantalla Echo Show.'
          )
          .withShouldEndSession(true)
          .getResponse();
      }

      const profile = await getUserProfile(handlerInput);
      if (!profile.authKey) {
        return renderLogin(
          handlerInput,
          undefined,
          'Bienvenido a Stremio. Inicia sesión en la pantalla con tu cuenta para ver tu catálogo.'
        );
      }

      return renderHome(handlerInput, services, profile, 'Bienvenido a Stremio.');
    },
  };
}
