import {
  SkillBuilders,
  type LambdaHandler,
  type PersistenceAdapter,
} from 'ask-sdk-core';
import { StremioAddonClient } from './services/addonClient';
import { DynamoDbCacheStore } from './services/storage/cacheStore';
import { DynamoDbV3PersistenceAdapter } from './services/storage/persistenceAdapter';
import { StremioApiClient } from './services/stremioApiClient';
import { createAplEventHandler } from './handlers/aplEventHandler';
import { createBuiltInIntentHandlers } from './handlers/builtInIntents';
import { GlobalErrorHandler } from './handlers/errorHandler';
import type { SkillServices } from './handlers/helpers/navigation';
import { createLaunchHandler } from './handlers/launchHandler';
import { createNavigationIntentHandler } from './handlers/navigationIntents';
import { createPlaybackIntentHandler } from './handlers/playbackIntents';

export interface CreateSkillDeps {
  services?: SkillServices;
  persistenceAdapter?: PersistenceAdapter;
}

export function createSkillHandler(deps: CreateSkillDeps = {}): LambdaHandler {
  const tableName = process.env.TABLE_NAME ?? '';

  const services: SkillServices = deps.services ?? {
    stremioApi: new StremioApiClient(),
    addonClient: new StremioAddonClient(),
    cacheStore: new DynamoDbCacheStore(tableName),
  };

  const persistenceAdapter: PersistenceAdapter =
    deps.persistenceAdapter ?? new DynamoDbV3PersistenceAdapter({ tableName });

  return SkillBuilders.custom()
    .withPersistenceAdapter(persistenceAdapter)
    .addRequestHandlers(
      createLaunchHandler(services),
      createAplEventHandler(services),
      createPlaybackIntentHandler(services),
      createNavigationIntentHandler(services),
      ...createBuiltInIntentHandlers(services)
    )
    .addErrorHandlers(GlobalErrorHandler)
    .lambda();
}

let defaultHandler: LambdaHandler | null = null;

export const handler: LambdaHandler = (event, context, callback) => {
  if (!defaultHandler) {
    defaultHandler = createSkillHandler();
  }
  return defaultHandler(event, context, callback);
};
