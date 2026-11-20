import {
  ADDON_TIMEOUT_MS,
  GLOBAL_ADDON_BUDGET_MS,
  MAX_CATALOG_ITEMS,
  MAX_CATALOG_ROWS,
} from '../config/constants';
import { logger } from '../security/logger';
import {
  sanitizeDisplayText,
  validateMediaId,
  validateMediaType,
  validateSafeHttpsUrl,
} from '../security/validation';
import type {
  AddonCatalogDescriptor,
  AddonDescriptor,
  CatalogRow,
  ClassifiedStream,
  MediaType,
  MetaDetail,
  MetaPreview,
  NormalizedSubtitle,
  StremioStream,
  StremioSubtitle,
} from '../types/stremio';
import { classifyStreams, type RawAddonStreamItem } from './streamAnalyzer';
import { normalizeSubtitles, type RawAddonSubtitleItem } from './subtitleSelector';

export function getAddonBaseUrl(transportUrl: string): string | null {
  const safeUrl = validateSafeHttpsUrl(transportUrl);
  if (!safeUrl) {
    return null;
  }
  return safeUrl.replace(/\/manifest\.json(?:\?.*)?$/i, '').replace(/\/+$/, '');
}

export function addonSupportsResource(
  addon: AddonDescriptor,
  resourceName: string,
  type: MediaType,
  id?: string
): boolean {
  const manifest = addon.manifest;
  if (!manifest?.resources || !Array.isArray(manifest.resources)) {
    return false;
  }

  for (const res of manifest.resources) {
    if (typeof res === 'string') {
      if (res !== resourceName) continue;
      const types = manifest.types ?? [];
      if (types.length > 0 && !types.includes(type)) continue;
      const prefixes = manifest.idPrefixes;
      if (id && prefixes && prefixes.length > 0) {
        if (!prefixes.some((p) => id.startsWith(p))) continue;
      }
      return true;
    }

    if (res && typeof res === 'object' && res.name === resourceName) {
      const types = res.types ?? manifest.types ?? [];
      if (types.length > 0 && !types.includes(type)) continue;
      const prefixes = res.idPrefixes ?? manifest.idPrefixes;
      if (id && prefixes && prefixes.length > 0) {
        if (!prefixes.some((p) => id.startsWith(p))) continue;
      }
      return true;
    }
  }

  return false;
}

function catalogSupportsSearch(catalog: AddonCatalogDescriptor): boolean {
  if (Array.isArray(catalog.extra)) {
    return catalog.extra.some((e) => e.name === 'search');
  }
  if (Array.isArray(catalog.extraSupported)) {
    return catalog.extraSupported.includes('search');
  }
  return false;
}

function catalogRequiresExtra(catalog: AddonCatalogDescriptor): boolean {
  if (Array.isArray(catalog.extra)) {
    return catalog.extra.some((e) => e.isRequired === true);
  }
  if (Array.isArray(catalog.extraRequired)) {
    return catalog.extraRequired.length > 0;
  }
  return false;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = ADDON_TIMEOUT_MS
): Promise<T | null> {
  const safeUrl = validateSafeHttpsUrl(url);
  if (!safeUrl) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(safeUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      logger.debug('Addon fetch error', { urlHost: new URL(safeUrl).hostname });
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function withGlobalBudget<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), GLOBAL_ADDON_BUDGET_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sanitizeMetaPreview(raw: Record<string, unknown>): MetaPreview | null {
  const type = validateMediaType(String(raw.type ?? ''));
  const id = validateMediaId(String(raw.id ?? ''));
  const name = sanitizeDisplayText(String(raw.name ?? ''), 100);
  if (!type || !id || !name) {
    return null;
  }

  return {
    id,
    type,
    name,
    poster: validateSafeHttpsUrl(raw.poster as string) ?? undefined,
    background: validateSafeHttpsUrl(raw.background as string) ?? undefined,
    releaseInfo: raw.releaseInfo
      ? sanitizeDisplayText(String(raw.releaseInfo), 24)
      : undefined,
    imdbRating: raw.imdbRating
      ? sanitizeDisplayText(String(raw.imdbRating), 10)
      : undefined,
    description: raw.description
      ? sanitizeDisplayText(String(raw.description), 400)
      : undefined,
  };
}

export class StremioAddonClient {
  async fetchHomeCatalogs(addons: AddonDescriptor[]): Promise<CatalogRow[]> {
    const candidates: Array<{
      baseUrl: string;
      addonName: string;
      catalog: AddonCatalogDescriptor;
      type: MediaType;
    }> = [];

    for (const addon of addons) {
      const baseUrl = getAddonBaseUrl(addon.transportUrl);
      if (!baseUrl) continue;
      const catalogs = addon.manifest?.catalogs ?? [];
      for (const catalog of catalogs) {
        if (catalogRequiresExtra(catalog)) continue;
        const type = validateMediaType(catalog.type);
        if (!type) continue;
        candidates.push({
          baseUrl,
          addonName: addon.manifest.name,
          catalog,
          type,
        });
      }
    }

    const selected = candidates.slice(0, MAX_CATALOG_ROWS);
    const results = await withGlobalBudget(
      Promise.allSettled(
        selected.map(async ({ baseUrl, addonName, catalog, type }) => {
          const catalogId = encodeURIComponent(catalog.id);
          const url = `${baseUrl}/catalog/${type}/${catalogId}.json`;
          const data = await fetchJsonWithTimeout<{ metas?: Array<Record<string, unknown>> }>(url);
          const items = (data?.metas ?? [])
            .map(sanitizeMetaPreview)
            .filter((item): item is MetaPreview => item !== null)
            .slice(0, MAX_CATALOG_ITEMS);

          if (items.length === 0) return null;

          const typeLabel = type === 'movie' ? 'Películas' : type === 'series' ? 'Series' : type;
          const title = sanitizeDisplayText(
            catalog.name ? `${catalog.name} · ${typeLabel}` : `${addonName} · ${typeLabel}`,
            60
          );

          return {
            id: `${catalog.id}-${type}`,
            title,
            addonName: sanitizeDisplayText(addonName, 40),
            type,
            items,
          } satisfies CatalogRow;
        })
      )
    );

    if (!results) return [];
    const rows: CatalogRow[] = [];
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        rows.push(res.value);
      }
    }
    return rows;
  }

  async searchCatalogs(
    addons: AddonDescriptor[],
    query: string
  ): Promise<MetaPreview[]> {
    const encodedQuery = encodeURIComponent(query);
    const searchEndpoints: Array<{ url: string }> = [];

    for (const addon of addons) {
      const baseUrl = getAddonBaseUrl(addon.transportUrl);
      if (!baseUrl) continue;
      for (const catalog of addon.manifest?.catalogs ?? []) {
        if (!catalogSupportsSearch(catalog)) continue;
        const type = validateMediaType(catalog.type);
        if (!type) continue;
        const catalogId = encodeURIComponent(catalog.id);
        searchEndpoints.push({
          url: `${baseUrl}/catalog/${type}/${catalogId}/search=${encodedQuery}.json`,
        });
      }
    }

    const limited = searchEndpoints.slice(0, 6);
    const results = await withGlobalBudget(
      Promise.allSettled(
        limited.map(({ url }) =>
          fetchJsonWithTimeout<{ metas?: Array<Record<string, unknown>> }>(url)
        )
      )
    );

    if (!results) return [];

    const deduped = new Map<string, MetaPreview>();
    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value?.metas) continue;
      for (const raw of res.value.metas) {
        const preview = sanitizeMetaPreview(raw);
        if (!preview) continue;
        const key = `${preview.type}:${preview.id}`;
        if (!deduped.has(key)) {
          deduped.set(key, preview);
        }
        if (deduped.size >= 24) break;
      }
    }

    return Array.from(deduped.values());
  }

  async fetchMeta(
    addons: AddonDescriptor[],
    type: MediaType,
    id: string
  ): Promise<MetaDetail | null> {
    const validId = validateMediaId(id);
    if (!validId) return null;

    const supporting = addons.filter((a) =>
      addonSupportsResource(a, 'meta', type, validId)
    );

    // Prioritize Cinemeta / official metadata addons first
    supporting.sort((a, b) => {
      const aOfficial = a.flags?.official || /cinemeta/i.test(a.manifest.id) ? 0 : 1;
      const bOfficial = b.flags?.official || /cinemeta/i.test(b.manifest.id) ? 0 : 1;
      return aOfficial - bOfficial;
    });

    const endpoints = supporting
      .slice(0, 4)
      .map((addon) => {
        const baseUrl = getAddonBaseUrl(addon.transportUrl);
        return baseUrl
          ? `${baseUrl}/meta/${type}/${encodeURIComponent(validId)}.json`
          : null;
      })
      .filter((u): u is string => u !== null);

    const results = await withGlobalBudget(
      Promise.allSettled(
        endpoints.map((url) =>
          fetchJsonWithTimeout<{ meta?: Record<string, unknown> }>(url)
        )
      )
    );

    if (!results) return null;

    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value?.meta) continue;
      const raw = res.value.meta;
      const base = sanitizeMetaPreview({ ...raw, type: raw.type ?? type, id: raw.id ?? validId });
      if (!base) continue;

      const rawVideos = Array.isArray(raw.videos) ? raw.videos : [];
      const videos = rawVideos
        .filter((v): v is Record<string, unknown> => Boolean(v && typeof v === 'object'))
        .map((v) => ({
          id: validateMediaId(String(v.id ?? '')) ?? String(v.id ?? ''),
          title: sanitizeDisplayText(String(v.title ?? v.name ?? ''), 120) || undefined,
          name: sanitizeDisplayText(String(v.name ?? ''), 120) || undefined,
          season: typeof v.season === 'number' ? v.season : Number(v.season ?? 0),
          episode: typeof v.episode === 'number' ? v.episode : Number(v.episode ?? 0),
          released: v.released ? sanitizeDisplayText(String(v.released), 30) : undefined,
          thumbnail: validateSafeHttpsUrl(v.thumbnail as string) ?? undefined,
          overview: v.overview ? sanitizeDisplayText(String(v.overview), 240) : undefined,
        }))
        .filter((v) => Boolean(v.id));

      return {
        ...base,
        genres: Array.isArray(raw.genres)
          ? raw.genres.slice(0, 5).map((g) => sanitizeDisplayText(String(g), 24))
          : undefined,
        runtime: raw.runtime ? sanitizeDisplayText(String(raw.runtime), 24) : undefined,
        videos: videos.length > 0 ? videos : undefined,
      };
    }

    return null;
  }

  /**
   * Queries stream addons in parallel. Never fetches or probes any Debrid stream URL.
   */
  async fetchStreams(
    addons: AddonDescriptor[],
    type: MediaType,
    videoId: string
  ): Promise<ClassifiedStream[]> {
    const validId = validateMediaId(videoId);
    if (!validId) return [];

    const supporting = addons.filter((a) =>
      addonSupportsResource(a, 'stream', type, validId)
    );

    const queries = supporting
      .map((addon) => {
        const baseUrl = getAddonBaseUrl(addon.transportUrl);
        if (!baseUrl) return null;
        return {
          addonName: addon.manifest.name,
          url: `${baseUrl}/stream/${type}/${encodeURIComponent(validId)}.json`,
        };
      })
      .filter((q): q is { addonName: string; url: string } => q !== null);

    const results = await withGlobalBudget(
      Promise.allSettled(
        queries.map(async ({ addonName, url }) => {
          const data = await fetchJsonWithTimeout<{ streams?: StremioStream[] }>(url);
          return {
            addonName,
            streams: Array.isArray(data?.streams) ? data.streams : [],
          };
        })
      )
    );

    if (!results) return [];

    const rawItems: RawAddonStreamItem[] = [];
    for (const res of results) {
      if (res.status !== 'fulfilled') continue;
      for (const stream of res.value.streams) {
        rawItems.push({ addonName: res.value.addonName, stream });
      }
    }

    return classifyStreams(rawItems);
  }

  async fetchSubtitles(
    addons: AddonDescriptor[],
    type: MediaType,
    videoId: string,
    preferredLang: string
  ): Promise<NormalizedSubtitle[]> {
    const validId = validateMediaId(videoId);
    if (!validId) return [];

    const supporting = addons.filter((a) =>
      addonSupportsResource(a, 'subtitles', type, validId)
    );

    const queries = supporting
      .map((addon) => {
        const baseUrl = getAddonBaseUrl(addon.transportUrl);
        if (!baseUrl) return null;
        return {
          addonName: addon.manifest.name,
          url: `${baseUrl}/subtitles/${type}/${encodeURIComponent(validId)}.json`,
        };
      })
      .filter((q): q is { addonName: string; url: string } => q !== null);

    const results = await withGlobalBudget(
      Promise.allSettled(
        queries.map(async ({ addonName, url }) => {
          const data = await fetchJsonWithTimeout<{ subtitles?: StremioSubtitle[] }>(url);
          return {
            addonName,
            subtitles: Array.isArray(data?.subtitles) ? data.subtitles : [],
          };
        })
      )
    );

    if (!results) return [];

    const rawItems: RawAddonSubtitleItem[] = [];
    for (const res of results) {
      if (res.status !== 'fulfilled') continue;
      for (const subtitle of res.value.subtitles) {
        rawItems.push({ addonName: res.value.addonName, subtitle });
      }
    }

    return normalizeSubtitles(rawItems, preferredLang);
  }
}
