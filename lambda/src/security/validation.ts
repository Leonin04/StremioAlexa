import net from 'node:net';
import { ALLOWED_MEDIA_TYPES } from '../config/constants';
import type { MediaType } from '../types/stremio';

const MEDIA_ID_REGEX = /^[a-zA-Z0-9._:@-]{1,128}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224) return true; // multicast & reserved

  return false;
}

function isPrivateOrReservedIpv6(rawIp: string): boolean {
  const ip = rawIp.toLowerCase().split('%')[0];
  if (ip === '::' || ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1
  if (ip.startsWith('::ffff:')) {
    const rest = ip.slice('::ffff:'.length);
    if (net.isIPv4(rest)) {
      return isPrivateOrReservedIpv4(rest);
    }
    const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(rest);
    if (hexMatch) {
      const hi = Number.parseInt(hexMatch[1], 16);
      const lo = Number.parseInt(hexMatch[2], 16);
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isPrivateOrReservedIpv4(v4);
    }
    return true;
  }

  const firstHextet = Number.parseInt(ip.split(':')[0] || '0', 16);
  if (!Number.isNaN(firstHextet)) {
    // fc00::/7 Unique Local Addresses (fc00..fdff)
    if ((firstHextet & 0xfe00) === 0xfc00) return true;
    // fe80::/10 Link-Local (fe80..febf)
    if ((firstHextet & 0xffc0) === 0xfe80) return true;
    // ff00::/8 Multicast
    if ((firstHextet & 0xff00) === 0xff00) return true;
  }

  return false;
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) {
    return false;
  }
  return EMAIL_REGEX.test(trimmed);
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) {
    return '***';
  }
  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export function sanitizeSearchQuery(query: string): string {
  const cleaned = query
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 120);
}

export function sanitizeDisplayText(
  text: string | undefined | null,
  maxLen = 200
): string {
  if (!text) {
    return '';
  }
  const cleaned = String(text)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

export function validateMediaType(type: string | undefined | null): MediaType | null {
  if (!type) {
    return null;
  }
  const normalized = type.trim().toLowerCase() as MediaType;
  return ALLOWED_MEDIA_TYPES.includes(normalized) ? normalized : null;
}

export function validateMediaId(id: string | undefined | null): string | null {
  if (!id) {
    return null;
  }
  const trimmed = id.trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    return null;
  }
  return MEDIA_ID_REGEX.test(trimmed) ? trimmed : null;
}

export function validateSafeHttpsUrl(rawUrl: string | undefined | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const rawHost = parsed.hostname.toLowerCase();
  if (!rawHost) {
    return null;
  }

  const host =
    rawHost.startsWith('[') && rawHost.endsWith(']')
      ? rawHost.slice(1, -1)
      : rawHost;

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host.endsWith('.home.arpa')
  ) {
    return null;
  }

  const ipType = net.isIP(host);
  if (ipType === 4 && isPrivateOrReservedIpv4(host)) {
    return null;
  }
  if (ipType === 6 && isPrivateOrReservedIpv6(host)) {
    return null;
  }

  return parsed.toString();
}
