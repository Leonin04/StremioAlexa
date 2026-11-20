import { describe, expect, it } from 'vitest';
import {
  buildUpdatedLibraryItem,
  extractContinueWatching,
  findNextEpisode,
} from '../services/playbackProgress';
import type { MetaDetail, StremioLibraryItem } from '../types/stremio';

describe('playbackProgress', () => {
  it('extracts and sorts continue watching items while skipping removed or finished movies', () => {
    const items: StremioLibraryItem[] = [
      {
        _id: 'tt-finished',
        type: 'movie',
        name: 'Finished Movie',
        state: {
          timeOffset: 5800000,
          duration: 6000000,
          lastWatched: '2026-11-20T18:00:00.000Z',
        },
      },
      {
        _id: 'tt-removed',
        type: 'movie',
        name: 'Removed Movie',
        removed: true,
        state: {
          timeOffset: 100000,
          duration: 5000000,
          lastWatched: '2026-11-20T19:00:00.000Z',
        },
      },
      {
        _id: 'tt0388629',
        type: 'series',
        name: 'One Piece',
        state: {
          video_id: 'tt0388629:1:42',
          timeOffset: 300000,
          duration: 1400000,
          lastWatched: '2026-11-20T19:30:00.000Z',
        },
      },
      {
        _id: 'tt1375666',
        type: 'movie',
        name: 'Inception',
        state: {
          video_id: 'tt1375666',
          timeOffset: 1800000,
          duration: 7200000,
          lastWatched: '2026-11-20T12:00:00.000Z',
        },
      },
    ];

    const cw = extractContinueWatching(items);
    expect(cw).toHaveLength(2);
    expect(cw[0].id).toBe('tt0388629');
    expect(cw[0].season).toBe(1);
    expect(cw[0].episode).toBe(42);
    expect(cw[0].progressPercent).toBe(21);
    expect(cw[1].id).toBe('tt1375666');
    expect(cw[1].progressPercent).toBe(25);
  });

  it('finds next episode within a season and across season boundaries skipping specials', () => {
    const meta: MetaDetail = {
      id: 'tt0388629',
      type: 'series',
      name: 'One Piece',
      videos: [
        { id: 'tt0388629:0:1', season: 0, episode: 1, title: 'Special' },
        { id: 'tt0388629:1:61', season: 1, episode: 61, title: 'Final S1' },
        { id: 'tt0388629:1:60', season: 1, episode: 60, title: 'Penúltimo S1' },
        { id: 'tt0388629:2:1', season: 2, episode: 1, title: 'Inicio S2' },
      ],
    };

    expect(findNextEpisode(meta, 'tt0388629:1:60')?.id).toBe('tt0388629:1:61');
    expect(findNextEpisode(meta, 'tt0388629:1:61')?.id).toBe('tt0388629:2:1');
    expect(findNextEpisode(meta, 'tt0388629:2:1')).toBeNull();
  });

  it('builds updated Stremio library items and marks >= 90% as watched', () => {
    const midProgress = buildUpdatedLibraryItem(undefined, {
      mediaId: 'tt0388629',
      mediaType: 'series',
      mediaName: 'One Piece',
      videoId: 'tt0388629:1:5',
      timeOffsetMs: 600000,
      durationMs: 1400000,
    });

    expect(midProgress.state?.timeOffset).toBe(600000);
    expect(midProgress.state?.timesWatched).toBe(0);
    expect(midProgress.state?.video_id).toBe('tt0388629:1:5');

    const completed = buildUpdatedLibraryItem(midProgress, {
      mediaId: 'tt0388629',
      mediaType: 'series',
      mediaName: 'One Piece',
      videoId: 'tt0388629:1:5',
      timeOffsetMs: 1320000,
      durationMs: 1400000,
    });

    expect(completed.state?.timeOffset).toBe(0);
    expect(completed.state?.timesWatched).toBe(1);
    expect(completed.state?.flaggedWatched).toBe(1);
  });
});
