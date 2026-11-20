import type { ErrorHandler, HandlerInput } from 'ask-sdk-core';
import type { Response } from 'ask-sdk-model';
import { logger } from '../security/logger';

export const GlobalErrorHandler: ErrorHandler = {
  canHandle(): boolean {
    return true;
  },
  handle(handlerInput: HandlerInput, error: Error): Response {
    logger.error('Unhandled skill error', {
      requestType: handlerInput.requestEnvelope.request.type,
      error,
    });

    return handlerInput.responseBuilder
      .speak(
        'Ha ocurrido un problema al procesar la petición con Stremio. Inténtalo de nuevo.'
      )
      .getResponse();
  },
};
