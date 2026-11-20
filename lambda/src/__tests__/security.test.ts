import { describe, expect, it, vi } from 'vitest';
import { redactForLog } from '../security/logger';
import {
  isValidEmail,
  maskEmail,
  sanitizeDisplayText,
  sanitizeSearchQuery,
  validateMediaId,
  validateMediaType,
  validateSafeHttpsUrl,
} from '../security/validation';

describe('Security validation', () => {
  it('validates emails and masks them safely', () => {
    expect(isValidEmail('alice@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);

    expect(maskEmail('alice@example.com')).toBe('a***e@example.com');
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
  });

  it('validates media types against allow-list', () => {
    expect(validateMediaType('movie')).toBe('movie');
    expect(validateMediaType('SERIES')).toBe('series');
    expect(validateMediaType('anime')).toBe('anime');
    expect(validateMediaType('javascript')).toBeNull();
    expect(validateMediaType('../etc')).toBeNull();
  });

  it('validates media IDs and blocks traversal/query injection characters', () => {
    expect(validateMediaId('tt0388629')).toBe('tt0388629');
    expect(validateMediaId('tt0388629:1:42')).toBe('tt0388629:1:42');
    expect(validateMediaId('kitsu:12345')).toBe('kitsu:12345');

    expect(validateMediaId('../secret')).toBeNull();
    expect(validateMediaId('tt12345?admin=1')).toBeNull();
    expect(validateMediaId('tt12345#frag')).toBeNull();
    expect(validateMediaId('tt12345/../../etc')).toBeNull();
  });

  it('allows safe HTTPS URLs and blocks HTTP, credentials, and SSRF targets', () => {
    expect(
      validateSafeHttpsUrl('https://v3-cinemeta.strem.io/manifest.json')
    ).toBe('https://v3-cinemeta.strem.io/manifest.json');

    expect(validateSafeHttpsUrl('http://v3-cinemeta.strem.io/manifest.json')).toBeNull();
    expect(validateSafeHttpsUrl('https://user:pass@example.com/a')).toBeNull();
    expect(validateSafeHttpsUrl('https://localhost/manifest.json')).toBeNull();
    expect(validateSafeHttpsUrl('https://127.0.0.1/manifest.json')).toBeNull();
    expect(validateSafeHttpsUrl('https://169.254.169.254/latest/meta-data')).toBeNull();
    expect(validateSafeHttpsUrl('https://10.0.0.1/internal')).toBeNull();
    expect(validateSafeHttpsUrl('https://192.168.1.50/nas')).toBeNull();
    expect(validateSafeHttpsUrl('https://172.16.5.10/api')).toBeNull();
    expect(validateSafeHttpsUrl('https://[::1]/local')).toBeNull();
    expect(validateSafeHttpsUrl('https://[fe80::1]/link')).toBeNull();
    expect(validateSafeHttpsUrl('https://addon.local/manifest.json')).toBeNull();
    expect(validateSafeHttpsUrl('https://service.internal/manifest.json')).toBeNull();
  });

  it('sanitizes search queries and display text', () => {
    expect(sanitizeSearchQuery('  One   Piece \n\t ')).toBe('One Piece');
    expect(sanitizeSearchQuery('a'.repeat(200)).length).toBe(120);
    expect(sanitizeDisplayText('Hello\u0000World', 8)).toBe('Hello W…');
  });

  it('redacts sensitive fields recursively in logs', () => {
    const redacted = redactForLog({
      password: 'SuperSecretPassword123',
      authKey: 'stremio-auth-token-xyz',
      email: 'alice@example.com',
      nested: {
        authorization: 'Bearer abc',
        safeField: 'visible',
      },
    }) as Record<string, unknown>;

    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.authKey).toBe('[REDACTED]');
    expect(redacted.email).toBe('[REDACTED]');
    expect((redacted.nested as Record<string, unknown>).authorization).toBe(
      '[REDACTED]'
    );
    expect((redacted.nested as Record<string, unknown>).safeField).toBe(
      'visible'
    );

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(spy).not.toHaveBeenCalled();
  });
});
