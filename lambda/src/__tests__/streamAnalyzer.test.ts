import { describe, expect, it } from 'vitest';
import { classifyStreams } from '../services/streamAnalyzer';

describe('streamAnalyzer', () => {
  it('filters out P2P torrents without HTTPS URLs and unsafe HTTP URLs', () => {
    const result = classifyStreams([
      {
        addonName: 'Torrentio',
        stream: {
          name: 'Torrentio 1080p',
          title: 'One.Piece.E01.1080p.mp4',
          infoHash: 'abcdef1234567890',
          fileIdx: 0,
        },
      },
      {
        addonName: 'InsecureAddon',
        stream: {
          name: 'HTTP Stream',
          url: 'http://cdn.example.com/video.mp4',
        },
      },
      {
        addonName: 'Torrentio RD',
        stream: {
          name: '[RD+] Torrentio 1080p',
          title: 'One.Piece.E01.1080p.WEB-DL.H264.AAC.mp4\n👤 50 💾 420 MB 🇪🇸',
          url: 'https://debrid.example.com/dl/token123/One.Piece.E01.mp4',
          behaviorHints: {
            filename: 'One.Piece.E01.1080p.H264.AAC.mp4',
          },
        },
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].addonName).toBe('Torrentio RD');
    expect(result[0].compatibility).toBe('compatible');
    expect(result[0].statusBadge).toBe('✓ Compatible');
    expect(result[0].container).toBe('MP4');
    expect(result[0].videoCodec).toBe('H.264');
    expect(result[0].audioCodec).toBe('AAC');
    expect(result[0].languageTags).toContain('ESP');
  });

  it('marks MKV, HEVC, 4K and DTS/AC3 streams with warning and sorts compatible first', () => {
    const result = classifyStreams([
      {
        addonName: 'Torrentio RD',
        stream: {
          name: '[RD+] 4K',
          title: 'Movie.2160p.HEVC.x265.DTS.mkv 💾 14.5 GB',
          url: 'https://debrid.example.com/dl/movie.mkv',
        },
      },
      {
        addonName: 'Torrentio RD',
        stream: {
          name: '[RD+] 720p',
          title: 'Movie.720p.x264.AAC.mp4 💾 1.1 GB 🇪🇸',
          url: 'https://debrid.example.com/dl/movie-720.mp4',
        },
      },
      {
        addonName: 'MediaFusion',
        stream: {
          name: 'MF 1080p',
          title: 'Movie.1080p.H264.AC3.mp4 💾 2.2 GB',
          url: 'https://debrid.example.com/dl/movie-ac3.mp4',
        },
      },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0].url).toContain('movie-720.mp4');
    expect(result[0].compatibility).toBe('compatible');

    expect(result[1].compatibility).toBe('warning');
    expect(result[1].warningReason).toContain('AC3');

    expect(result[2].compatibility).toBe('warning');
    expect(result[2].warningReason).toContain('MKV');
    expect(result[2].warningReason).toContain('HEVC');
    expect(result[2].warningReason).toContain('4K');
    expect(result.map((s) => s.index)).toEqual([0, 1, 2]);
  });
});
