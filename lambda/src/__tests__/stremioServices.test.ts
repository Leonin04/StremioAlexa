import { afterEach, describe, expect, it, vi } from 'vitest';
import { StremioAddonClient } from '../services/addonClient';
import { StremioApiClient, StremioAuthError } from '../services/stremioApiClient';
import type { AddonDescriptor } from '../types/stremio';

describe('StremioApiClient & StremioAddonClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends expected payloads to api.strem.io endpoints', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (url.endsWith('/login')) {
        expect(body).toEqual({
          type: 'Login',
          email: 'user@example.com',
          password: 'secret',
          facebook: false,
        });
        return new Response(
          JSON.stringify({
            result: { authKey: 'key-123', user: { email: 'user@example.com' } },
          }),
          { status: 200 }
        );
      }

      if (url.endsWith('/addonCollectionGet')) {
        expect(body).toEqual({
          type: 'AddonCollectionGet',
          authKey: 'key-123',
          update: true,
        });
        return new Response(JSON.stringify({ result: { addons: [] } }), {
          status: 200,
        });
      }

      if (url.endsWith('/datastoreGet')) {
        expect(body).toEqual({
          type: 'DatastoreGet',
          authKey: 'key-123',
          collection: 'libraryItem',
          ids: [],
          all: true,
        });
        return new Response(JSON.stringify({ result: [] }), { status: 200 });
      }

      if (url.endsWith('/datastorePut')) {
        expect(body.type).toBe('DatastorePut');
        expect(body.collection).toBe('libraryItem');
        expect(body.changes).toHaveLength(1);
        return new Response(JSON.stringify({ result: { success: true } }), {
          status: 200,
        });
      }

      return new Response('{}', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const api = new StremioApiClient();
    const loginRes = await api.login('user@example.com', 'secret');
    expect(loginRes.authKey).toBe('key-123');

    const addons = await api.getAddonCollection('key-123');
    expect(addons).toEqual([]);

    const lib = await api.getLibraryItems('key-123');
    expect(lib).toEqual([]);

    await api.putLibraryItem('key-123', { _id: 'tt123', type: 'movie' });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws StremioAuthError on 401 or invalid session response', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 1, message: 'Session does not exist' } }),
          { status: 401 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);

    const api = new StremioApiClient();
    await expect(api.getAddonCollection('expired')).rejects.toBeInstanceOf(
      StremioAuthError
    );
  });

  it('queries stream addons in parallel without ever fetching Debrid stream URLs', async () => {
    const addons: AddonDescriptor[] = [
      {
        transportUrl: 'https://torrentio.example.com/manifest.json',
        manifest: {
          id: 'com.torrentio',
          version: '1.0.0',
          name: 'Torrentio RD',
          resources: ['stream'],
          types: ['movie', 'series'],
        },
      },
      {
        transportUrl: 'https://broken-addon.example.com/manifest.json',
        manifest: {
          id: 'com.broken',
          version: '1.0.0',
          name: 'Broken Addon',
          resources: [{ name: 'stream', types: ['series'], idPrefixes: ['tt'] }],
        },
      },
    ];

    const debridVideoUrl = 'https://debrid-cdn.example.com/files/one-piece-ep1.mp4';
    const calledUrls: string[] = [];

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calledUrls.push(url);

      if (url.includes('broken-addon.example.com')) {
        throw new Error('Network failure');
      }

      if (url.includes('torrentio.example.com/stream/series/')) {
        return new Response(
          JSON.stringify({
            streams: [
              {
                name: '[RD+] Torrentio 1080p',
                title: 'One.Piece.E01.1080p.H264.AAC.mp4',
                url: debridVideoUrl,
              },
            ],
          }),
          { status: 200 }
        );
      }

      return new Response('{}', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new StremioAddonClient();
    const streams = await client.fetchStreams(addons, 'series', 'tt0388629:1:1');

    expect(streams).toHaveLength(1);
    expect(streams[0].url).toBe(debridVideoUrl);
    expect(calledUrls).not.toContain(debridVideoUrl);
    expect(calledUrls.some((u) => u.includes('debrid-cdn.example.com'))).toBe(
      false
    );
  });
});
