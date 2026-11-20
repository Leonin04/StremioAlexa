import { MAX_STREAMS_DISPLAY } from '../config/constants';
import { sanitizeDisplayText, validateSafeHttpsUrl } from '../security/validation';
import type { ClassifiedStream, StremioStream } from '../types/stremio';

export interface RawAddonStreamItem {
  addonName: string;
  stream: StremioStream;
}

function formatBytes(bytes: number | undefined): string | undefined {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
    return undefined;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function detectResolution(text: string): string | undefined {
  if (/\b(2160p|4k|uhd)\b/i.test(text)) return '4K';
  if (/\b1080p\b/i.test(text)) return '1080p';
  if (/\b720p\b/i.test(text)) return '720p';
  if (/\b480p\b/i.test(text)) return '480p';
  return undefined;
}

function detectContainer(text: string, safeUrl: string): string | undefined {
  let pathname = '';
  try {
    pathname = new URL(safeUrl).pathname.toLowerCase();
  } catch {
    pathname = '';
  }

  const combined = `${pathname} ${text.toLowerCase()}`;
  if (/\.mkv(\b|$)/i.test(combined)) return 'MKV';
  if (/\.avi(\b|$)/i.test(combined)) return 'AVI';
  if (/\.m3u8(\b|$)/i.test(combined)) return 'HLS';
  if (/\.webm(\b|$)/i.test(combined)) return 'WEBM';
  if (/\.mp4(\b|$)/i.test(combined)) return 'MP4';
  return undefined;
}

function detectVideoCodec(text: string): string | undefined {
  if (/\b(dolby[\s._-]*vision|dovi)\b|\bdv\b/i.test(text)) return 'Dolby Vision';
  if (/\b(hevc|x265|h\.?265)\b/i.test(text)) return 'HEVC';
  if (/\bav1\b/i.test(text)) return 'AV1';
  if (/\b(h\.?264|x264|avc)\b/i.test(text)) return 'H.264';
  return undefined;
}

function detectAudioCodec(text: string): string | undefined {
  if (/\b(truehd|atmos)\b/i.test(text)) return 'TrueHD/Atmos';
  if (/\bdts(?:-?hd)?\b/i.test(text)) return 'DTS';
  if (/\b(e-?ac-?3|eac3|ddp|dd\+)\b/i.test(text)) return 'EAC3';
  if (/\b(ac-?3|ac3|dd5\.1)\b/i.test(text)) return 'AC3';
  if (/\baac\b/i.test(text)) return 'AAC';
  return undefined;
}

function detectSizeLabel(text: string, videoSize?: number): string | undefined {
  const match = /(\d+(?:[.,]\d+)?)\s*(GB|GiB|MB|MiB)\b/i.exec(text);
  if (match) {
    const unit = match[2].toUpperCase().replace('IB', 'B');
    return `${match[1].replace(',', '.')} ${unit}`;
  }
  return formatBytes(videoSize);
}

function detectSizeGb(sizeLabel: string | undefined): number | undefined {
  if (!sizeLabel) return undefined;
  const match = /^(\d+(?:\.\d+)?)\s*(GB|MB)$/i.exec(sizeLabel);
  if (!match) return undefined;
  const num = Number.parseFloat(match[1]);
  return match[2].toUpperCase() === 'GB' ? num : num / 1024;
}

function detectLanguageTags(text: string): string[] {
  const tags: string[] = [];
  if (/🇪🇸|\b(esp|spa|spanish|castellano|cast)\b/i.test(text)) {
    tags.push('ESP');
  }
  if (/🇲🇽|🇦🇷|\b(lat|latino)\b/i.test(text)) {
    tags.push('LAT');
  }
  if (/🇯🇵|\b(jap|jpn|japanese)\b/i.test(text)) {
    tags.push('JAP');
  }
  if (/🇬🇧|🇺🇸|\b(eng|english)\b/i.test(text)) {
    tags.push('ENG');
  }
  if (/\b(dual|multi)\b/i.test(text)) {
    tags.push('MULTI');
  }
  if (/\bvose\b/i.test(text)) {
    tags.push('VOSE');
  }
  return tags;
}

export function classifyStreams(
  rawItems: RawAddonStreamItem[]
): ClassifiedStream[] {
  const classified: ClassifiedStream[] = [];
  const seenUrls = new Set<string>();

  for (const { addonName, stream } of rawItems) {
    // Discard torrents without direct HTTPS URL (e.g., pure infoHash) and unsafe URLs
    const safeUrl = validateSafeHttpsUrl(stream.url);
    if (!safeUrl || seenUrls.has(safeUrl)) {
      continue;
    }
    seenUrls.add(safeUrl);

    const filename = stream.behaviorHints?.filename ?? '';
    const titlePart = stream.title ?? stream.description ?? '';
    const namePart = stream.name ?? '';
    const fullMetaText = `${namePart} ${titlePart} ${filename} ${safeUrl}`;

    const resolution = detectResolution(fullMetaText);
    const container = detectContainer(fullMetaText, safeUrl);
    const videoCodec = detectVideoCodec(fullMetaText);
    const audioCodec = detectAudioCodec(fullMetaText);
    const sizeLabel = detectSizeLabel(
      fullMetaText,
      stream.behaviorHints?.videoSize
    );
    const languageTags = detectLanguageTags(fullMetaText);

    const warningReasons: string[] = [];
    if (container && ['MKV', 'AVI', 'HLS', 'WEBM'].includes(container)) {
      warningReasons.push(container === 'HLS' ? 'HLS (M3U8)' : container);
    }
    if (videoCodec && ['HEVC', 'AV1', 'Dolby Vision'].includes(videoCodec)) {
      warningReasons.push(videoCodec);
    }
    if (resolution === '4K') {
      warningReasons.push('4K');
    }
    if (
      audioCodec &&
      ['TrueHD/Atmos', 'DTS', 'EAC3', 'AC3'].includes(audioCodec)
    ) {
      warningReasons.push(audioCodec);
    }
    if (
      warningReasons.length === 0 &&
      stream.behaviorHints?.notWebReady === true &&
      container !== 'MP4'
    ) {
      warningReasons.push('Formato no web');
    }

    const compatibility =
      warningReasons.length > 0 ? 'warning' : 'compatible';
    const statusBadge =
      compatibility === 'compatible'
        ? '✓ Compatible'
        : '⚠ Puede no reproducirse';
    const warningReason =
      warningReasons.length > 0
        ? warningReasons.slice(0, 3).join(' · ')
        : undefined;

    let score = compatibility === 'compatible' ? 10000 : 0;
    if (container === 'MP4') score += 300;
    if (videoCodec === 'H.264') score += 200;
    if (audioCodec === 'AAC') score += 100;
    if (resolution === '1080p') score += 120;
    else if (resolution === '720p') score += 90;
    else if (resolution === '480p') score += 40;
    else if (resolution === '4K') score -= 50;

    if (languageTags.includes('ESP')) score += 30;
    if (languageTags.includes('LAT')) score += 20;
    if (languageTags.includes('MULTI')) score += 15;

    const sizeGb = detectSizeGb(sizeLabel);
    if (sizeGb !== undefined && sizeGb > 15) {
      score -= 20;
    }

    const rawDisplay =
      sanitizeDisplayText(titlePart || namePart || filename || addonName, 140) ||
      addonName;

    const metaParts = [
      resolution,
      container,
      videoCodec,
      audioCodec,
      sizeLabel,
      ...languageTags,
    ].filter((v): v is string => Boolean(v));

    classified.push({
      index: 0,
      addonName: sanitizeDisplayText(addonName, 40) || 'Addon',
      url: safeUrl,
      displayTitle: rawDisplay,
      metaLine:
        metaParts.length > 0
          ? metaParts.join(' · ')
          : `${sanitizeDisplayText(addonName, 30)} · Stream HTTPS`,
      compatibility,
      statusBadge,
      warningReason,
      resolution,
      container,
      videoCodec,
      audioCodec,
      sizeLabel,
      languageTags,
      score,
      rawTitle: sanitizeDisplayText(`${namePart} ${titlePart}`, 180),
    });
  }

  classified.sort((a, b) => b.score - a.score);

  return classified.slice(0, MAX_STREAMS_DISPLAY).map((item, idx) => ({
    ...item,
    index: idx,
  }));
}
