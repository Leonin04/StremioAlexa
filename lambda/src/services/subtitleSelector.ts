import { MAX_SUBTITLES_DISPLAY } from '../config/constants';
import { sanitizeDisplayText, validateSafeHttpsUrl } from '../security/validation';
import type { NormalizedSubtitle, StremioSubtitle } from '../types/stremio';

export interface RawAddonSubtitleItem {
  addonName: string;
  subtitle: StremioSubtitle;
}

const LANGUAGE_MAP: Array<{
  code: string;
  label: string;
  patterns: RegExp[];
}> = [
  {
    code: 'spa',
    label: 'Español',
    patterns: [/^es$/i, /^es[-_]/i, /^spa$/i, /^esp$/i, /spanish/i, /espa[ñn]ol/i, /castellano/i],
  },
  {
    code: 'eng',
    label: 'Inglés',
    patterns: [/^en$/i, /^en[-_]/i, /^eng$/i, /english/i, /ingl[eé]s/i],
  },
  {
    code: 'jpn',
    label: 'Japonés',
    patterns: [/^ja$/i, /^ja[-_]/i, /^jpn$/i, /^jap$/i, /japanese/i, /japon[eé]s/i],
  },
  {
    code: 'fre',
    label: 'Francés',
    patterns: [/^fr$/i, /^fr[-_]/i, /^fre$/i, /^fra$/i, /french/i, /franc[eé]s/i],
  },
  {
    code: 'ger',
    label: 'Alemán',
    patterns: [/^de$/i, /^de[-_]/i, /^ger$/i, /^deu$/i, /german/i, /alem[aá]n/i],
  },
  {
    code: 'por',
    label: 'Portugués',
    patterns: [/^pt$/i, /^pt[-_]/i, /^por$/i, /^pob$/i, /portuguese/i, /portugu[eé]s/i],
  },
  {
    code: 'ita',
    label: 'Italiano',
    patterns: [/^it$/i, /^it[-_]/i, /^ita$/i, /italian/i, /italiano/i],
  },
];

export function normalizeLanguageCode(rawLang: string | undefined): {
  code: string;
  label: string;
} {
  const trimmed = (rawLang ?? '').trim();
  if (!trimmed) {
    return { code: 'und', label: 'Desconocido' };
  }

  for (const entry of LANGUAGE_MAP) {
    if (entry.patterns.some((rx) => rx.test(trimmed))) {
      const isLatam = /^es[-_](419|mx|la|ar)|lat/i.test(trimmed);
      return {
        code: entry.code,
        label: isLatam ? 'Español (Latino)' : entry.label,
      };
    }
  }

  const normalized = trimmed.toLowerCase().slice(0, 8);
  return {
    code: normalized,
    label: sanitizeDisplayText(trimmed, 24),
  };
}

function isSubtitleSrt(safeUrl: string): boolean {
  let pathname = '';
  try {
    pathname = new URL(safeUrl).pathname.toLowerCase();
  } catch {
    pathname = safeUrl.toLowerCase();
  }

  if (pathname.endsWith('.srt') || /\.srt(\?|$)/i.test(safeUrl)) {
    return true;
  }
  if (/\.(vtt|ass|ssa|sub|idx)(\?|$)/i.test(pathname)) {
    return false;
  }
  // OpenSubtitles / Stremio subtitle endpoints often proxy SRT without extension
  return true;
}

export function normalizeSubtitles(
  rawItems: RawAddonSubtitleItem[],
  preferredLang = 'spa'
): NormalizedSubtitle[] {
  const seenUrls = new Set<string>();
  const normalized: NormalizedSubtitle[] = [];

  for (let i = 0; i < rawItems.length; i++) {
    const { addonName, subtitle } = rawItems[i];
    const safeUrl = validateSafeHttpsUrl(subtitle.url);
    if (!safeUrl || seenUrls.has(safeUrl)) {
      continue;
    }
    seenUrls.add(safeUrl);

    const { code, label } = normalizeLanguageCode(subtitle.lang);
    const isSrt = isSubtitleSrt(safeUrl);
    if (!isSrt) {
      // APL Video textTrack only reliably renders SRT captions
      continue;
    }

    const idBase = sanitizeDisplayText(subtitle.id || `${code}-${i}`, 60).replace(
      /\s+/g,
      '_'
    );
    normalized.push({
      id: `${idBase}-${normalized.length}`,
      url: safeUrl,
      langCode: code,
      langLabel: label,
      providerName: sanitizeDisplayText(addonName, 32) || 'Subtítulos',
      isSrt,
    });
  }

  const pref = normalizeLanguageCode(preferredLang).code;
  normalized.sort((a, b) => {
    const rank = (item: NormalizedSubtitle): number => {
      if (pref !== 'off' && item.langCode === pref) return 0;
      if (item.langCode === 'spa') return 1;
      if (item.langCode === 'eng') return 2;
      return 3;
    };
    return rank(a) - rank(b);
  });

  return normalized.slice(0, MAX_SUBTITLES_DISPLAY);
}

export function pickDefaultSubtitle(
  subtitles: NormalizedSubtitle[],
  preferredLang: string
): NormalizedSubtitle | null {
  if (!preferredLang || preferredLang === 'off') {
    return null;
  }

  const targetCode = normalizeLanguageCode(preferredLang).code;
  return (
    subtitles.find((sub) => sub.langCode === targetCode && sub.isSrt) ?? null
  );
}
