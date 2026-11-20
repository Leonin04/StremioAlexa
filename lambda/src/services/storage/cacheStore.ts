import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { logger } from '../../security/logger';
import { getDynamoDocClient } from './dynamoClient';
import { buildUserPk } from './persistenceAdapter';

const CACHE_INDEX_SK = 'CACHE#_INDEX';
const MAX_TRACKED_KEYS = 50;

function toCacheSk(key: string): string {
  const sanitized = key.replace(/[^a-zA-Z0-9._:@#-]/g, '_').slice(0, 180);
  return `CACHE#${sanitized}`;
}

export interface CacheStore {
  get<T>(userId: string, key: string): Promise<T | null>;
  set<T>(
    userId: string,
    key: string,
    payload: T,
    ttlSeconds: number
  ): Promise<void>;
  delete(userId: string, key: string): Promise<void>;
  invalidatePrefix(userId: string, prefix: string): Promise<void>;
  invalidateAll(userId: string): Promise<void>;
}

export class DynamoDbCacheStore implements CacheStore {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;

  constructor(tableName: string, docClient?: DynamoDBDocumentClient) {
    this.tableName = tableName;
    this.docClient = docClient ?? getDynamoDocClient();
  }

  async get<T>(userId: string, key: string): Promise<T | null> {
    if (!this.tableName || !userId) {
      return null;
    }

    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            pk: buildUserPk(userId),
            sk: toCacheSk(key),
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      const nowEpoch = Math.floor(Date.now() / 1000);
      if (typeof result.Item.ttl === 'number' && result.Item.ttl <= nowEpoch) {
        return null;
      }

      return (result.Item.payload as T) ?? null;
    } catch (err) {
      logger.warn('Cache get failed', { key, error: err });
      return null;
    }
  }

  async set<T>(
    userId: string,
    key: string,
    payload: T,
    ttlSeconds: number
  ): Promise<void> {
    if (!this.tableName || !userId) {
      return;
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const cacheSk = toCacheSk(key);
    const ttl = nowEpoch + Math.max(10, Math.floor(ttlSeconds));

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: buildUserPk(userId),
            sk: cacheSk,
            payload,
            ttl,
            updatedAt: new Date().toISOString(),
          },
        })
      );
      await this.trackKey(userId, cacheSk, ttl);
    } catch (err) {
      logger.warn('Cache set failed', { key, error: err });
    }
  }

  async delete(userId: string, key: string): Promise<void> {
    if (!this.tableName || !userId) {
      return;
    }

    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            pk: buildUserPk(userId),
            sk: toCacheSk(key),
          },
        })
      );
    } catch (err) {
      logger.warn('Cache delete failed', { key, error: err });
    }
  }

  async invalidatePrefix(userId: string, prefix: string): Promise<void> {
    if (!this.tableName || !userId) {
      return;
    }

    const skPrefix = toCacheSk(prefix);
    try {
      const tracked = await this.getTrackedKeys(userId);
      const matching = tracked.filter((sk) => sk.startsWith(skPrefix));
      await Promise.allSettled(
        matching.map((sk) =>
          this.docClient.send(
            new DeleteCommand({
              TableName: this.tableName,
              Key: { pk: buildUserPk(userId), sk },
            })
          )
        )
      );
      const remaining = tracked.filter((sk) => !sk.startsWith(skPrefix));
      await this.saveTrackedKeys(userId, remaining);
    } catch (err) {
      logger.warn('Cache invalidatePrefix failed', { prefix, error: err });
    }
  }

  async invalidateAll(userId: string): Promise<void> {
    await this.invalidatePrefix(userId, '');
    try {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            pk: buildUserPk(userId),
            sk: CACHE_INDEX_SK,
          },
        })
      );
    } catch (err) {
      logger.warn('Cache index delete failed', { error: err });
    }
  }

  private async getTrackedKeys(userId: string): Promise<string[]> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: buildUserPk(userId),
          sk: CACHE_INDEX_SK,
        },
      })
    );
    const keys = result.Item?.keys;
    return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
  }

  private async saveTrackedKeys(userId: string, keys: string[], ttl?: number): Promise<void> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: buildUserPk(userId),
          sk: CACHE_INDEX_SK,
          keys: keys.slice(-MAX_TRACKED_KEYS),
          ttl: ttl ?? nowEpoch + 3600,
        },
      })
    );
  }

  private async trackKey(userId: string, cacheSk: string, ttl: number): Promise<void> {
    const existing = await this.getTrackedKeys(userId);
    if (existing.includes(cacheSk)) {
      return;
    }
    const updated = [...existing, cacheSk].slice(-MAX_TRACKED_KEYS);
    await this.saveTrackedKeys(userId, updated, ttl);
  }
}
