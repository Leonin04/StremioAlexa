import type { PersistenceAdapter } from 'ask-sdk-core';
import type { RequestEnvelope } from 'ask-sdk-model';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { getDynamoDocClient } from './dynamoClient';

const PROFILE_SK = 'PROFILE';

export function extractAlexaUserId(requestEnvelope: RequestEnvelope): string {
  const userId =
    requestEnvelope.session?.user?.userId ??
    requestEnvelope.context?.System?.user?.userId;

  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('Missing Alexa userId in request envelope');
  }

  return userId.trim();
}

export function buildUserPk(userId: string): string {
  return `USER#${userId}`;
}

export interface DynamoDbV3AdapterConfig {
  tableName: string;
  docClient?: DynamoDBDocumentClient;
}

export class DynamoDbV3PersistenceAdapter implements PersistenceAdapter {
  private readonly tableName: string;
  private readonly docClient: DynamoDBDocumentClient;

  constructor(config: DynamoDbV3AdapterConfig) {
    if (!config.tableName) {
      throw new Error('DynamoDbV3PersistenceAdapter requires tableName');
    }
    this.tableName = config.tableName;
    this.docClient = config.docClient ?? getDynamoDocClient();
  }

  async getAttributes(
    requestEnvelope: RequestEnvelope
  ): Promise<Record<string, unknown>> {
    const userId = extractAlexaUserId(requestEnvelope);
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: buildUserPk(userId),
          sk: PROFILE_SK,
        },
        ConsistentRead: true,
      })
    );

    const attrs = result.Item?.attributes;
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
      return {};
    }
    return attrs as Record<string, unknown>;
  }

  async saveAttributes(
    requestEnvelope: RequestEnvelope,
    attributes: Record<string, unknown>
  ): Promise<void> {
    const userId = extractAlexaUserId(requestEnvelope);
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: buildUserPk(userId),
          sk: PROFILE_SK,
          attributes,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  async deleteAttributes(requestEnvelope: RequestEnvelope): Promise<void> {
    const userId = extractAlexaUserId(requestEnvelope);
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          pk: buildUserPk(userId),
          sk: PROFILE_SK,
        },
      })
    );
  }
}
