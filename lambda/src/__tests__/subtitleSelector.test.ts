import { describe, expect, it } from 'vitest';
import {
  normalizeLanguageCode,
  normalizeSubtitles,
  pickDefaultSubtitle,
} from '../services/subtitleSelector';

describe('subtitleSelector', () => {
  it('normalizes Spanish and English variants consistently', () => {
    expect(normalizeLanguageCode('es')).toEqual({
      code: 'spa',
      label: 'Español',
    });
    expect(normalizeLanguageCode('es-419')).toEqual({
      code: 'spa',
      label: 'Español (Latino)',
    });
    expect(normalizeLanguageCode('Spanish')).toEqual({
      code: 'spa',
      label: 'Español',
    });
    expect(normalizeLanguageCode('eng')).toEqual({
      code: 'eng',
      label: 'Inglés',
    });
  });

  it('filters insecure or non-SRT subtitles and prioritizes preferred language', () => {
    const subs = normalizeSubtitles(
      [
        {
          addonName: 'OpenSubtitles',
          subtitle: {
            id: 'en-1',
            lang: 'eng',
            url: 'https://subs.example.com/en.srt',
          },
        },
        {
          addonName: 'OpenSubtitles',
          subtitle: {
            id: 'es-vtt',
            lang: 'spa',
            url: 'https://subs.example.com/es.vtt',
          },
        },
        {
          addonName: 'OpenSubtitles',
          subtitle: {
            id: 'es-http',
            lang: 'spa',
            url: 'http://subs.example.com/es.srt',
          },
        },
        {
          addonName: 'OpenSubtitles v3',
          subtitle: {
            id: 'es-1',
            lang: 'es',
            url: 'https://subs.example.com/es.srt',
          },
        },
      ],
      'spa'
    );

    expect(subs).toHaveLength(2);
    expect(subs[0].langCode).toBe('spa');
    expect(subs[0].url).toBe('https://subs.example.com/es.srt');
    expect(subs[1].langCode).toBe('eng');

    expect(pickDefaultSubtitle(subs, 'spa')?.langCode).toBe('spa');
    expect(pickDefaultSubtitle(subs, 'eng')?.langCode).toBe('eng');
    expect(pickDefaultSubtitle(subs, 'off')).toBeNull();
    expect(pickDefaultSubtitle(subs, 'fre')).toBeNull();
  });
});
