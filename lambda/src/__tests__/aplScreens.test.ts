import { describe, expect, it } from 'vitest';
import { APL_PLAYER_VIDEO_ID, APL_VERSION, THEME_COLORS } from '../config/constants';
import { buildDetailScreen } from '../apl/screens/detailScreen';
import { buildHomeScreen } from '../apl/screens/homeScreen';
import { buildLoginScreen } from '../apl/screens/loginScreen';
import { buildPlayerScreen } from '../apl/screens/playerScreen';
import { buildSearchScreen } from '../apl/screens/searchScreen';
import { buildStreamsScreen } from '../apl/screens/streamsScreen';

function findComponent(
  node: unknown,
  predicate: (obj: Record<string, unknown>) => boolean
): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findComponent(item, predicate);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (predicate(obj)) return obj;

  for (const val of Object.values(obj)) {
    const found = findComponent(val, predicate);
    if (found) return found;
  }
  return null;
}

describe('APL screens', () => {
  it('builds LoginScreen with APL 2024.2, Stremio theme, and secureInput password', () => {
    const { document, datasources } = buildLoginScreen({
      errorMessage: 'Credenciales inválidas',
    });

    expect(document.version).toBe(APL_VERSION);
    expect(JSON.stringify(document)).toContain(THEME_COLORS.BG_DEEP);
    expect(JSON.stringify(document)).toContain(THEME_COLORS.ACCENT_PRIMARY);

    const passwordInput = findComponent(
      document,
      (o) => o.type === 'EditText' && o.id === 'passwordInput'
    );
    expect(passwordInput?.secureInput).toBe(true);
    expect((datasources.login as Record<string, unknown>).hasError).toBe(true);
  });

  it('builds HomeScreen and SearchScreen with valid APL 2024.2 structures', () => {
    const home = buildHomeScreen({
      maskedEmail: 'a***e@example.com',
      continueWatching: [
        {
          id: 'tt0388629',
          type: 'series',
          name: 'One Piece',
          videoId: 'tt0388629:1:42',
          season: 1,
          episode: 42,
          timeOffsetMs: 300000,
          durationMs: 1400000,
          progressPercent: 21,
          lastWatched: '2026-11-20T18:00:00.000Z',
        },
      ],
      catalogs: [],
    });
    expect(home.document.version).toBe(APL_VERSION);
    expect((home.datasources.home as Record<string, unknown>).hasContinueWatching).toBe(
      true
    );

    const search = buildSearchScreen({
      query: 'One Piece',
      results: [
        { id: 'tt0388629', type: 'series', name: 'One Piece', releaseInfo: '1999-' },
      ],
      searched: true,
    });
    expect(search.document.version).toBe(APL_VERSION);
    expect((search.datasources.search as Record<string, unknown>).hasResults).toBe(
      true
    );
  });

  it('paginates long series seasons in DetailScreen (25 episodes per page)', () => {
    const videos = Array.from({ length: 60 }, (_, idx) => ({
      id: `tt0388629:1:${idx + 1}`,
      season: 1,
      episode: idx + 1,
      title: `Episodio ${idx + 1}`,
    }));

    const page0 = buildDetailScreen({
      meta: { id: 'tt0388629', type: 'series', name: 'One Piece', videos },
      selectedSeason: 1,
      episodePage: 0,
    });
    const detail0 = page0.datasources.detail as Record<string, unknown>;
    expect((detail0.episodes as unknown[]).length).toBe(25);
    expect(detail0.hasPagination).toBe(true);
    expect(detail0.hasNextPage).toBe(true);

    const page2 = buildDetailScreen({
      meta: { id: 'tt0388629', type: 'series', name: 'One Piece', videos },
      selectedSeason: 1,
      episodePage: 2,
    });
    const detail2 = page2.datasources.detail as Record<string, unknown>;
    expect((detail2.episodes as unknown[]).length).toBe(10);
    expect(detail2.hasNextPage).toBe(false);
    expect(detail2.hasPrevPage).toBe(true);
  });

  it('builds StreamsScreen and PlayerScreen with screenLock, textTrack SRT and in-player drawers', () => {
    const streamsScreen = buildStreamsScreen({
      mediaTitle: 'One Piece - T1E1',
      streams: [
        {
          index: 0,
          addonName: 'Torrentio RD',
          url: 'https://debrid.example.com/ep1.mp4',
          displayTitle: 'One Piece 1080p MP4',
          metaLine: '1080p · MP4 · H.264 · AAC',
          compatibility: 'compatible',
          statusBadge: '✓ Compatible',
          languageTags: ['ESP'],
          score: 10600,
          rawTitle: 'One Piece 1080p MP4',
        },
      ],
    });
    expect(streamsScreen.document.version).toBe(APL_VERSION);

    const withSub = buildPlayerScreen({
      title: 'One Piece - T1E1',
      activeStream: {
        index: 0,
        addonName: 'Torrentio RD',
        url: 'https://debrid.example.com/ep1.mp4',
        displayTitle: 'One Piece 1080p MP4',
        metaLine: '1080p · MP4',
        compatibility: 'compatible',
        statusBadge: '✓ Compatible',
        languageTags: ['JAP'],
        score: 10500,
        rawTitle: 'One Piece',
      },
      activeSubtitle: {
        id: 'spa-0',
        url: 'https://subs.example.com/ep1.srt',
        langCode: 'spa',
        langLabel: 'Español',
        providerName: 'OpenSubtitles',
        isSrt: true,
      },
      streams: [],
      subtitles: [],
      offsetMs: 45000,
      durationMs: 1400000,
      hasNextEpisode: true,
    });

    const videoComp = findComponent(
      withSub.document,
      (o) => o.type === 'Video' && o.id === APL_PLAYER_VIDEO_ID
    );
    expect(videoComp?.screenLock).toBe(true);
    expect(videoComp?.autoplay).toBe(true);
    expect(videoComp?.audioTrack).toBe('foreground');

    const source = (withSub.datasources.player as { source: Array<Record<string, unknown>> })
      .source;
    expect(source[0].offset).toBe(45000);
    expect(source[0].textTrack).toEqual([
      {
        type: 'caption',
        url: 'https://subs.example.com/ep1.srt',
        language: 'spa',
        description: 'Español',
      },
    ]);

    const withoutSub = buildPlayerScreen({
      title: 'One Piece - T1E1',
      activeStream: {
        index: 0,
        addonName: 'Torrentio RD',
        url: 'https://debrid.example.com/ep1.mp4',
        displayTitle: 'One Piece 1080p MP4',
        metaLine: '1080p · MP4',
        compatibility: 'compatible',
        statusBadge: '✓ Compatible',
        languageTags: ['ESP'],
        score: 10500,
        rawTitle: 'One Piece',
      },
      activeSubtitle: null,
      streams: [],
      subtitles: [],
      offsetMs: 0,
      durationMs: 1400000,
      hasNextEpisode: false,
    });
    const noSubSource = (
      withoutSub.datasources.player as { source: Array<Record<string, unknown>> }
    ).source;
    expect(noSubSource[0].textTrack).toBeUndefined();
  });
});
