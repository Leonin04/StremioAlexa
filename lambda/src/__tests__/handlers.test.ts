import type { PersistenceAdapter } from 'ask-sdk-core';
import type { RequestEnvelope, ResponseEnvelope } from 'ask-sdk-model';
import { describe, expect, it, vi } from 'vitest';
import { APL_PLAYER_VIDEO_ID } from '../config/constants';
import { createSkillHandler } from '../index';
import type { CacheStore } from '../services/storage/cacheStore';
import type { SkillServices } from '../handlers/helpers/navigation';
import type { StremioAddonClient } from '../services/addonClient';
import type { StremioApiClient } from '../services/stremioApiClient';

class MemoryPersistenceAdapter implements PersistenceAdapter {
  store = new Map<string, Record<string, unknown>>();

  async getAttributes(envelope: RequestEnvelope): Promise<Record<string, unknown>> {
    const userId =
      envelope.session?.user?.userId ??
      envelope.context?.System?.user?.userId ??
      'user-1';
    return { ...(this.store.get(userId) ?? {}) };
  }

  async saveAttributes(
    envelope: RequestEnvelope,
    attributes: Record<string, unknown>
  ): Promise<void> {
    const userId =
      envelope.session?.user?.userId ??
      envelope.context?.System?.user?.userId ??
      'user-1';
    this.store.set(userId, { ...attributes });
  }

  async deleteAttributes(envelope: RequestEnvelope): Promise<void> {
    const userId =
      envelope.session?.user?.userId ??
      envelope.context?.System?.user?.userId ??
      'user-1';
    this.store.delete(userId);
  }
}

class MemoryCacheStore implements CacheStore {
  private map = new Map<string, unknown>();

  async get<T>(userId: string, key: string): Promise<T | null> {
    return (this.map.get(`${userId}:${key}`) as T) ?? null;
  }

  async set<T>(userId: string, key: string, payload: T): Promise<void> {
    this.map.set(`${userId}:${key}`, payload);
  }

  async delete(userId: string, key: string): Promise<void> {
    this.map.delete(`${userId}:${key}`);
  }

  async invalidatePrefix(userId: string, prefix: string): Promise<void> {
    for (const k of this.map.keys()) {
      if (k.startsWith(`${userId}:${prefix}`)) {
        this.map.delete(k);
      }
    }
  }

  async invalidateAll(userId: string): Promise<void> {
    await this.invalidatePrefix(userId, '');
  }
}

function buildBaseEnvelope(
  request: Record<string, unknown>,
  sessionAttributes: Record<string, unknown> = {}
): RequestEnvelope {
  return {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'amzn1.echo-api.session.test',
      application: { applicationId: 'amzn1.ask.skill.test' },
      attributes: sessionAttributes,
      user: { userId: 'amzn1.ask.account.TESTUSER' },
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.test' },
        user: { userId: 'amzn1.ask.account.TESTUSER' },
        device: {
          deviceId: 'amzn1.ask.device.TEST',
          supportedInterfaces: {
            'Alexa.Presentation.APL': { runtime: { maxVersion: '2024.2' } },
          },
        },
        apiEndpoint: 'https://api.eu.amazonalexa.com',
      },
    },
    request: {
      requestId: 'amzn1.echo-api.request.test',
      timestamp: '2026-11-20T20:00:00Z',
      locale: 'es-ES',
      ...request,
    },
  } as unknown as RequestEnvelope;
}

async function invokeSkill(
  handlerFn: ReturnType<typeof createSkillHandler>,
  envelope: RequestEnvelope
): Promise<ResponseEnvelope> {
  return new Promise((resolve, reject) => {
    handlerFn(envelope, {} as never, (err, res) => {
      if (err) {
        reject(err);
      } else {
        resolve(res as ResponseEnvelope);
      }
    });
  });
}

function getDirective<T>(resp: ResponseEnvelope, idx = 0): T {
  return resp.response.directives?.[idx] as unknown as T;
}

function createTestDeps() {
  const persistence = new MemoryPersistenceAdapter();
  const cacheStore = new MemoryCacheStore();

  const stremioApi = {
    login: vi.fn(async () => ({
      authKey: 'stremio-auth-key-999',
      user: { email: 'alice@example.com' },
    })),
    getAddonCollection: vi.fn(async () => [
      {
        transportUrl: 'https://v3-cinemeta.strem.io/manifest.json',
        manifest: {
          id: 'com.linvo.cinemeta',
          version: '3.0.0',
          name: 'Cinemeta',
          resources: ['catalog', 'meta'],
          types: ['movie', 'series'],
        },
      },
    ]),
    getLibraryItems: vi.fn(async () => []),
    putLibraryItem: vi.fn(async () => undefined),
  } as unknown as StremioApiClient;

  const addonClient = {
    fetchHomeCatalogs: vi.fn(async () => [
      {
        id: 'top-series',
        title: 'Popular · Series',
        addonName: 'Cinemeta',
        type: 'series',
        items: [{ id: 'tt0388629', type: 'series', name: 'One Piece' }],
      },
    ]),
    searchCatalogs: vi.fn(async () => [
      { id: 'tt0388629', type: 'series', name: 'One Piece', releaseInfo: '1999-' },
    ]),
    fetchMeta: vi.fn(async () => ({
      id: 'tt0388629',
      type: 'series',
      name: 'One Piece',
      videos: [
        { id: 'tt0388629:1:1', season: 1, episode: 1, title: 'Soy Luffy' },
        { id: 'tt0388629:1:2', season: 1, episode: 2, title: 'Zoro' },
      ],
    })),
    fetchStreams: vi.fn(async () => [
      {
        index: 0,
        addonName: 'Torrentio RD',
        url: 'https://debrid.example.com/onepiece-ep1-jap.mp4',
        displayTitle: 'One Piece E01 1080p JAP',
        metaLine: '1080p · MP4 · H.264 · AAC · JAP',
        compatibility: 'compatible',
        statusBadge: '✓ Compatible',
        languageTags: ['JAP'],
        score: 10600,
        rawTitle: 'One Piece JAP',
      },
      {
        index: 1,
        addonName: 'Torrentio RD',
        url: 'https://debrid.example.com/onepiece-ep1-esp.mp4',
        displayTitle: 'One Piece E01 1080p ESP',
        metaLine: '1080p · MP4 · H.264 · AAC · ESP',
        compatibility: 'compatible',
        statusBadge: '✓ Compatible',
        languageTags: ['ESP'],
        score: 10550,
        rawTitle: 'One Piece ESP',
      },
    ]),
    fetchSubtitles: vi.fn(async () => [
      {
        id: 'spa-0',
        url: 'https://subs.example.com/ep1-es.srt',
        langCode: 'spa',
        langLabel: 'Español',
        providerName: 'OpenSubtitles',
        isSrt: true,
      },
      {
        id: 'eng-1',
        url: 'https://subs.example.com/ep1-en.srt',
        langCode: 'eng',
        langLabel: 'Inglés',
        providerName: 'OpenSubtitles',
        isSrt: true,
      },
    ]),
  } as unknown as StremioAddonClient;

  const services: SkillServices = {
    stremioApi,
    addonClient,
    cacheStore,
  };

  const skillHandler = createSkillHandler({
    services,
    persistenceAdapter: persistence,
  });

  return { skillHandler, persistence, stremioApi, addonClient };
}

describe('Alexa skill handlers end-to-end', () => {
  it('shows LoginScreen on launch without credentials and stores only authKey on login', async () => {
    const { skillHandler, persistence, stremioApi } = createTestDeps();

    const launchResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope({ type: 'LaunchRequest' })
    );
    const launchDir = getDirective<{
      type: string;
      datasources: Record<string, unknown>;
    }>(launchResp);
    expect(launchDir.type).toBe('Alexa.Presentation.APL.RenderDocument');
    expect(launchDir.datasources.login).toBeDefined();
    expect(launchResp.response.shouldEndSession).toBeUndefined();

    const loginResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: ['LOGIN_SUBMIT'],
          components: {
            emailInput: 'alice@example.com',
            passwordInput: 'MyVerySecretPassword!',
          },
        },
        launchResp.sessionAttributes ?? {}
      )
    );

    expect(stremioApi.login).toHaveBeenCalledWith(
      'alice@example.com',
      'MyVerySecretPassword!'
    );

    const saved = persistence.store.get('amzn1.ask.account.TESTUSER');
    expect(saved?.authKey).toBe('stremio-auth-key-999');
    expect(saved?.maskedEmail).toBe('a***e@example.com');
    expect(JSON.stringify(saved)).not.toContain('MyVerySecretPassword');
    expect(saved).not.toHaveProperty('password');

    const homeDir = getDirective<{
      datasources: Record<string, unknown>;
    }>(loginResp);
    expect(homeDir.datasources.home).toBeDefined();
  });

  it('walks search -> detail -> streams -> player -> subtitles -> switch stream -> save -> next episode -> voice pause/seek', async () => {
    const { skillHandler, persistence, stremioApi } = createTestDeps();
    persistence.store.set('amzn1.ask.account.TESTUSER', {
      authKey: 'stremio-auth-key-999',
      maskedEmail: 'a***e@example.com',
      subtitleLang: 'spa',
      updatedAt: '2026-11-20T19:00:00Z',
    });

    // 1. Voice search
    const searchResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope({
        type: 'IntentRequest',
        intent: {
          name: 'SearchMediaIntent',
          confirmationStatus: 'NONE',
          slots: { query: { name: 'query', value: 'One Piece' } },
        },
      })
    );
    const searchDir = getDirective<{
      datasources: { search: { results: unknown[] } };
    }>(searchResp);
    expect(searchDir.datasources.search.results).toHaveLength(1);

    // 2. Open Detail
    const detailResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: ['OPEN_DETAIL', 'series', 'tt0388629'],
        },
        searchResp.sessionAttributes ?? {}
      )
    );
    const detailDir = getDirective<{
      datasources: { detail: { episodes: unknown[] } };
    }>(detailResp);
    expect(detailDir.datasources.detail.episodes).toHaveLength(2);

    // 3. Open Streams
    const streamsResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: [
            'OPEN_STREAMS',
            'series',
            'tt0388629',
            'tt0388629:1:1',
            'One Piece - T1E1 Soy Luffy',
          ],
        },
        detailResp.sessionAttributes ?? {}
      )
    );
    const streamsDir = getDirective<{
      datasources: { streams: { items: unknown[] } };
    }>(streamsResp);
    expect(streamsDir.datasources.streams.items).toHaveLength(2);

    // 4. Play Stream 0 (defaults to Spanish subtitle)
    const playResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: ['PLAY_STREAM', '0'],
        },
        streamsResp.sessionAttributes ?? {}
      )
    );
    const playDir = getDirective<{
      datasources: {
        player: {
          activeSubtitleId: string;
          source: Array<{ url: string; textTrack?: Array<{ url: string }> }>;
        };
      };
    }>(playResp);
    expect(playDir.datasources.player.activeSubtitleId).toBe('spa-0');
    expect(playDir.datasources.player.source[0].textTrack?.[0].url).toBe(
      'https://subs.example.com/ep1-es.srt'
    );

    // 5. Switch Subtitle to English at 120000ms and persist language preference
    const subResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: ['SELECT_SUBTITLE', 'eng-1', '120000', '1400000'],
        },
        playResp.sessionAttributes ?? {}
      )
    );
    const subDir = getDirective<{
      datasources: {
        player: {
          offsetMs: number;
          activeSubtitleId: string;
          source: Array<{ textTrack?: Array<{ url: string }> }>;
        };
      };
    }>(subResp);
    expect(subDir.datasources.player.offsetMs).toBe(120000);
    expect(subDir.datasources.player.activeSubtitleId).toBe('eng-1');
    expect(subDir.datasources.player.source[0].textTrack?.[0].url).toBe(
      'https://subs.example.com/ep1-en.srt'
    );
    expect(
      persistence.store.get('amzn1.ask.account.TESTUSER')?.subtitleLang
    ).toBe('eng');

    // 6. Switch Stream to Spanish audio stream keeping offset 125000ms
    const switchResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: ['SWITCH_STREAM', '1', '125000', '1400000'],
        },
        subResp.sessionAttributes ?? {}
      )
    );
    const switchDir = getDirective<{
      datasources: {
        player: {
          offsetMs: number;
          source: Array<{ url: string }>;
        };
      };
    }>(switchResp);
    expect(switchDir.datasources.player.offsetMs).toBe(125000);
    expect(switchDir.datasources.player.source[0].url).toBe(
      'https://debrid.example.com/onepiece-ep1-esp.mp4'
    );

    // 7. SAVE_PROGRESS syncs to Stremio without re-rendering APL document
    const saveResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: ['SAVE_PROGRESS', '200000', '1400000'],
        },
        switchResp.sessionAttributes ?? {}
      )
    );
    expect(saveResp.response.directives ?? []).toHaveLength(0);
    expect(stremioApi.putLibraryItem).toHaveBeenCalled();

    // 8. Voice Pause & Seek use ControlMedia ExecuteCommands
    const pauseResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'IntentRequest',
          intent: { name: 'AMAZON.PauseIntent', confirmationStatus: 'NONE' },
        },
        switchResp.sessionAttributes ?? {}
      )
    );
    const pauseDir = getDirective<{
      type: string;
      commands: Array<{ type: string; componentId: string; command: string }>;
    }>(pauseResp);
    expect(pauseDir.type).toBe('Alexa.Presentation.APL.ExecuteCommands');
    expect(pauseDir.commands[0]).toEqual({
      type: 'ControlMedia',
      componentId: APL_PLAYER_VIDEO_ID,
      command: 'pause',
    });

    const seekResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'IntentRequest',
          intent: {
            name: 'SeekIntent',
            confirmationStatus: 'NONE',
            slots: {
              direction: { name: 'direction', value: 'adelanta' },
              amount: { name: 'amount', value: '2' },
              unit: {
                name: 'unit',
                value: 'minutos',
                resolutions: {
                  resolutionsPerAuthority: [
                    {
                      authority: 'custom',
                      status: { code: 'ER_SUCCESS_MATCH' },
                      values: [{ value: { id: 'minutes', name: 'minutos' } }],
                    },
                  ],
                },
              },
            },
          },
        },
        switchResp.sessionAttributes ?? {}
      )
    );
    const seekDir = getDirective<{
      commands: Array<{ command: string; value: number }>;
    }>(seekResp);
    expect(seekDir.commands[0].command).toBe('seek');
    expect(seekDir.commands[0].value).toBe(120000);

    // 9. Next Episode advances to tt0388629:1:2
    const nextResp = await invokeSkill(
      skillHandler,
      buildBaseEnvelope(
        {
          type: 'Alexa.Presentation.APL.UserEvent',
          arguments: ['NEXT_EPISODE', '1390000', '1400000'],
        },
        switchResp.sessionAttributes ?? {}
      )
    );
    expect(nextResp.sessionAttributes?.activeVideoId).toBe('tt0388629:1:2');
    const nextDir = getDirective<{
      datasources: { player: { title: string; offsetMs: number } };
    }>(nextResp);
    expect(nextDir.datasources.player.title).toContain('Zoro');
    expect(nextDir.datasources.player.offsetMs).toBe(0);
  });
});
