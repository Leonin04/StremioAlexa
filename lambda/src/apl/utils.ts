import type { HandlerInput } from 'ask-sdk-core';
import type { interfaces } from 'ask-sdk-model';
import { APL_MAIN_TOKEN } from '../config/constants';

export function supportsApl(handlerInput: HandlerInput): boolean {
  const supported =
    handlerInput.requestEnvelope.context?.System?.device?.supportedInterfaces;
  return Boolean(supported && 'Alexa.Presentation.APL' in supported);
}

export function renderAplDirective(
  document: Record<string, unknown>,
  datasources: Record<string, unknown>,
  token = APL_MAIN_TOKEN
): interfaces.alexa.presentation.apl.RenderDocumentDirective {
  return {
    type: 'Alexa.Presentation.APL.RenderDocument',
    token,
    document,
    datasources,
  };
}

export function executeAplCommandsDirective(
  commands: Array<interfaces.alexa.presentation.apl.Command | Record<string, unknown>>,
  token = APL_MAIN_TOKEN
): interfaces.alexa.presentation.apl.ExecuteCommandsDirective {
  return {
    type: 'Alexa.Presentation.APL.ExecuteCommands',
    token,
    commands: commands as interfaces.alexa.presentation.apl.Command[],
  };
}
