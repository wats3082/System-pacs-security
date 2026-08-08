import type { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import { AppError } from './errors';

export type PageKey = Record<string, NativeAttributeValue>;

export function encodeToken(key?: PageKey): string | undefined {
  return key
    ? Buffer.from(JSON.stringify(key), 'utf8').toString('base64url')
    : undefined;
}

export function decodeToken(token?: string): PageKey | undefined {
  if (!token) return undefined;
  try {
    const value: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as PageKey;
  } catch {
    throw new AppError(400, 'INVALID_NEXT_TOKEN', 'nextToken is invalid');
  }
}
