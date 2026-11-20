import { STREMIO_API_BASE, STREMIO_API_TIMEOUT_MS } from '../config/constants';
import { logger } from '../security/logger';
import type {
  AddonDescriptor,
  StremioLibraryItem,
  StremioLoginResult,
} from '../types/stremio';

export class StremioAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StremioAuthError';
  }
}

export class StremioApiError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'StremioApiError';
    this.code = code;
  }
}

interface StremioApiEnvelope<T> {
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
}

function isAuthErrorPayload(code?: number, message?: string): boolean {
  if (code === 1 || code === 2 || code === 1001 || code === 1002) {
    return true;
  }
  const msg = (message ?? '').toLowerCase();
  return (
    msg.includes('session') ||
    msg.includes('auth') ||
    msg.includes('password') ||
    msg.includes('credentials') ||
    msg.includes('unauthorized') ||
    msg.includes('user not found') ||
    msg.includes('wrong')
  );
}

export class StremioApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    baseUrl = STREMIO_API_BASE,
    timeoutMs = STREMIO_API_TIMEOUT_MS
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  /**
   * Authenticates directly against Stremio API.
   * TODO(security): Private personal skill authenticates via Echo Show EditText email/password
   * directly to api.strem.io without external OAuth/MFA per user design choice.
   * The password is only sent over TLS and never stored or logged.
   */
  async login(email: string, password: string): Promise<StremioLoginResult> {
    const result = await this.postApi<StremioLoginResult>('login', {
      type: 'Login',
      email,
      password,
      facebook: false,
    });

    if (!result?.authKey) {
      throw new StremioAuthError('Stremio did not return an authKey');
    }

    return result;
  }

  async getAddonCollection(authKey: string): Promise<AddonDescriptor[]> {
    const result = await this.postApi<
      AddonDescriptor[] | { addons?: AddonDescriptor[] }
    >('addonCollectionGet', {
      type: 'AddonCollectionGet',
      authKey,
      update: true,
    });

    if (Array.isArray(result)) {
      return result;
    }
    if (result && Array.isArray(result.addons)) {
      return result.addons;
    }
    return [];
  }

  async getLibraryItems(authKey: string): Promise<StremioLibraryItem[]> {
    const result = await this.postApi<StremioLibraryItem[]>('datastoreGet', {
      type: 'DatastoreGet',
      authKey,
      collection: 'libraryItem',
      ids: [],
      all: true,
    });

    return Array.isArray(result) ? result : [];
  }

  async putLibraryItem(
    authKey: string,
    item: StremioLibraryItem
  ): Promise<void> {
    await this.postApi<unknown>('datastorePut', {
      type: 'DatastorePut',
      authKey,
      collection: 'libraryItem',
      changes: [item],
    });
  }

  private async postApi<T>(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let payload: StremioApiEnvelope<T> | null = null;
      try {
        payload = (await response.json()) as StremioApiEnvelope<T>;
      } catch {
        payload = null;
      }

      if (response.status === 401 || response.status === 403) {
        throw new StremioAuthError(
          payload?.error?.message ?? `HTTP ${response.status} authentication error`
        );
      }

      if (!response.ok) {
        throw new StremioApiError(
          payload?.error?.message ?? `Stremio API HTTP ${response.status}`,
          response.status
        );
      }

      if (payload?.error) {
        const { code, message } = payload.error;
        if (isAuthErrorPayload(code, message)) {
          throw new StremioAuthError(message ?? 'Stremio authentication failed');
        }
        throw new StremioApiError(message ?? 'Stremio API error', code);
      }

      if (!payload || payload.result === undefined) {
        throw new StremioApiError(`Empty result from Stremio ${endpoint}`);
      }

      return payload.result;
    } catch (err) {
      if (err instanceof StremioAuthError || err instanceof StremioApiError) {
        throw err;
      }
      if ((err as Error)?.name === 'AbortError') {
        logger.warn('Stremio API request timed out', { endpoint });
        throw new StremioApiError(`Stremio API timeout on ${endpoint}`);
      }
      logger.error('Stremio API request failed', { endpoint, error: err });
      throw new StremioApiError(`Stremio API request failed on ${endpoint}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
