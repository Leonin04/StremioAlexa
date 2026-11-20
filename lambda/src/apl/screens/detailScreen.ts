import { EPISODES_PER_PAGE, THEME_COLORS } from '../../config/constants';
import { sortEpisodes } from '../../services/playbackProgress';
import type { MetaDetail } from '../../types/stremio';
import { buildTopNavHeader, createBaseAplDocument } from '../theme';

export interface DetailScreenData {
  maskedEmail?: string;
  meta: MetaDetail;
  selectedSeason?: number;
  episodePage?: number;
  resumeVideoId?: string;
  resumeOffsetMs?: number;
}

function formatOffsetLabel(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(mins)}:${pad(secs)}`
    : `${mins}:${pad(secs)}`;
}

export function buildDetailScreen(data: DetailScreenData): {
  document: Record<string, unknown>;
  datasources: Record<string, unknown>;
} {
  const allVideos = data.meta.videos ? sortEpisodes(data.meta.videos) : [];
  const isSeries = allVideos.length > 0 || data.meta.type === 'series';

  const seasonNumbers = Array.from(
    new Set(allVideos.map((v) => v.season ?? 1))
  ).sort((a, b) => a - b);

  const defaultSeason =
    seasonNumbers.find((s) => s > 0) ?? seasonNumbers[0] ?? 1;
  const activeSeason =
    data.selectedSeason !== undefined && seasonNumbers.includes(data.selectedSeason)
      ? data.selectedSeason
      : defaultSeason;

  const seasonEpisodes = allVideos.filter(
    (v) => (v.season ?? 1) === activeSeason
  );
  const totalPages = Math.max(
    1,
    Math.ceil(seasonEpisodes.length / EPISODES_PER_PAGE)
  );
  const currentPage = Math.max(
    0,
    Math.min(totalPages - 1, data.episodePage ?? 0)
  );

  const pageEpisodes = seasonEpisodes
    .slice(
      currentPage * EPISODES_PER_PAGE,
      (currentPage + 1) * EPISODES_PER_PAGE
    )
    .map((ep) => {
      const epNum = ep.episode ?? 0;
      const epName = ep.title || ep.name || `Episodio ${epNum}`;
      return {
        id: ep.id,
        episodeLabel: `T${activeSeason} · E${epNum}`,
        title: epName,
        fullTitle: `${data.meta.name} - T${activeSeason}E${epNum} ${epName}`,
        released: ep.released ? ep.released.slice(0, 10) : '',
        isInProgress: Boolean(data.resumeVideoId && data.resumeVideoId === ep.id),
      };
    });

  const infoParts = [
    data.meta.releaseInfo,
    data.meta.imdbRating ? `★ ${data.meta.imdbRating}` : undefined,
    data.meta.runtime,
    data.meta.genres?.slice(0, 3).join(', '),
  ].filter(Boolean);

  const hasResume = Boolean(
    data.resumeOffsetMs && data.resumeOffsetMs > 5000
  );
  const resumeLabel = hasResume
    ? `Reanudar (${formatOffsetLabel(data.resumeOffsetMs!)})`
    : '';

  const document = createBaseAplDocument([
    {
      type: 'Image',
      when: '${payload.detail.backdrop != ""}',
      source: '${payload.detail.backdrop}',
      position: 'absolute',
      width: '100vw',
      height: '100vh',
      scale: 'best-fill',
      overlayColor: THEME_COLORS.BG_OVERLAY,
    },
    buildTopNavHeader({
      activeTab: 'none',
      showBack: true,
      maskedEmail: data.maskedEmail,
    }),
    {
      type: 'ScrollView',
      width: '100%',
      grow: 1,
      padding: '22dp',
      item: {
        type: 'Container',
        width: '100%',
        items: [
          {
            type: 'Container',
            direction: 'row',
            width: '100%',
            paddingBottom: '20dp',
            items: [
              {
                type: 'Frame',
                width: '145dp',
                height: '215dp',
                borderRadius: '14dp',
                backgroundColor: THEME_COLORS.BG_SURFACE,
                borderWidth: '1dp',
                borderColor: THEME_COLORS.BORDER_SUBTLE,
                marginRight: '20dp',
                item: {
                  type: 'Container',
                  width: '100%',
                  height: '100%',
                  items: [
                    {
                      type: 'Image',
                      when: '${payload.detail.poster != ""}',
                      source: '${payload.detail.poster}',
                      width: '100%',
                      height: '100%',
                      scale: 'best-fill',
                    },
                    {
                      type: 'Text',
                      when: '${payload.detail.poster == ""}',
                      text: '${payload.detail.name}',
                      color: THEME_COLORS.TEXT_SECONDARY,
                      fontSize: '16dp',
                      textAlign: 'center',
                      textAlignVertical: 'center',
                      padding: '10dp',
                      width: '100%',
                      height: '100%',
                    },
                  ],
                },
              },
              {
                type: 'Container',
                grow: 1,
                shrink: 1,
                items: [
                  {
                    type: 'Text',
                    text: '${payload.detail.name}',
                    color: THEME_COLORS.TEXT_PRIMARY,
                    fontSize: '28dp',
                    fontWeight: '700',
                    maxLines: 2,
                  },
                  {
                    type: 'Text',
                    when: '${payload.detail.infoLine != ""}',
                    text: '${payload.detail.infoLine}',
                    color: THEME_COLORS.ACCENT_HOVER,
                    fontSize: '15dp',
                    paddingTop: '6dp',
                    paddingBottom: '10dp',
                  },
                  {
                    type: 'Text',
                    when: '${payload.detail.description != ""}',
                    text: '${payload.detail.description}',
                    color: THEME_COLORS.TEXT_SECONDARY,
                    fontSize: '16dp',
                    maxLines: 4,
                    paddingBottom: '14dp',
                  },
                  {
                    type: 'Container',
                    when: '${!payload.detail.isSeries}',
                    direction: 'row',
                    alignItems: 'center',
                    items: [
                      {
                        type: 'TouchWrapper',
                        onPress: [
                          {
                            type: 'SendEvent',
                            arguments: [
                              'OPEN_STREAMS',
                              '${payload.detail.type}',
                              '${payload.detail.id}',
                              '${payload.detail.id}',
                              '${payload.detail.name}',
                            ],
                          },
                        ],
                        item: {
                          type: 'Frame',
                          height: '48dp',
                          paddingLeft: '24dp',
                          paddingRight: '24dp',
                          borderRadius: '12dp',
                          backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
                          item: {
                            type: 'Text',
                            text: '▶ Ver fuentes',
                            color: THEME_COLORS.TEXT_PRIMARY,
                            fontSize: '18dp',
                            fontWeight: '700',
                            textAlignVertical: 'center',
                            height: '100%',
                          },
                        },
                      },
                      {
                        type: 'Text',
                        when: '${payload.detail.resumeLabel != ""}',
                        text: '${payload.detail.resumeLabel}',
                        color: THEME_COLORS.ACCENT_HOVER,
                        fontSize: '15dp',
                        paddingLeft: '14dp',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'Container',
            when: '${payload.detail.isSeries}',
            width: '100%',
            items: [
              {
                type: 'Text',
                text: 'Temporadas',
                color: THEME_COLORS.TEXT_PRIMARY,
                fontSize: '18dp',
                fontWeight: '700',
                paddingBottom: '10dp',
              },
              {
                type: 'Sequence',
                scrollDirection: 'horizontal',
                width: '100%',
                height: '46dp',
                data: '${payload.detail.seasons}',
                items: [
                  {
                    type: 'TouchWrapper',
                    paddingRight: '10dp',
                    onPress: [
                      {
                        type: 'SendEvent',
                        arguments: ['SELECT_SEASON', '${data.season}'],
                      },
                    ],
                    item: {
                      type: 'Frame',
                      height: '40dp',
                      paddingLeft: '16dp',
                      paddingRight: '16dp',
                      borderRadius: '20dp',
                      backgroundColor:
                        "${data.isActive ? '#7B5BF5' : '#181529'}",
                      borderWidth: '1dp',
                      borderColor:
                        "${data.isActive ? '#9D82FF' : '#312C4E'}",
                      item: {
                        type: 'Text',
                        text: '${data.label}',
                        color: THEME_COLORS.TEXT_PRIMARY,
                        fontSize: '16dp',
                        fontWeight: '600',
                        textAlignVertical: 'center',
                        height: '100%',
                      },
                    },
                  },
                ],
              },
              {
                type: 'Container',
                when: '${payload.detail.hasPagination}',
                direction: 'row',
                alignItems: 'center',
                justifyContent: 'spaceBetween',
                paddingTop: '10dp',
                paddingBottom: '10dp',
                items: [
                  {
                    type: 'TouchWrapper',
                    when: '${payload.detail.hasPrevPage}',
                    onPress: [
                      {
                        type: 'SendEvent',
                        arguments: [
                          'SELECT_EPISODE_PAGE',
                          '${payload.detail.prevPage}',
                        ],
                      },
                    ],
                    item: {
                      type: 'Frame',
                      height: '38dp',
                      paddingLeft: '14dp',
                      paddingRight: '14dp',
                      borderRadius: '10dp',
                      backgroundColor: THEME_COLORS.BG_ELEVATED,
                      item: {
                        type: 'Text',
                        text: '← Anteriores',
                        color: THEME_COLORS.TEXT_PRIMARY,
                        fontSize: '15dp',
                        textAlignVertical: 'center',
                        height: '100%',
                      },
                    },
                  },
                  {
                    type: 'Text',
                    text: '${payload.detail.pageLabel}',
                    color: THEME_COLORS.TEXT_SECONDARY,
                    fontSize: '15dp',
                  },
                  {
                    type: 'TouchWrapper',
                    when: '${payload.detail.hasNextPage}',
                    onPress: [
                      {
                        type: 'SendEvent',
                        arguments: [
                          'SELECT_EPISODE_PAGE',
                          '${payload.detail.nextPage}',
                        ],
                      },
                    ],
                    item: {
                      type: 'Frame',
                      height: '38dp',
                      paddingLeft: '14dp',
                      paddingRight: '14dp',
                      borderRadius: '10dp',
                      backgroundColor: THEME_COLORS.BG_ELEVATED,
                      item: {
                        type: 'Text',
                        text: 'Siguientes →',
                        color: THEME_COLORS.TEXT_PRIMARY,
                        fontSize: '15dp',
                        textAlignVertical: 'center',
                        height: '100%',
                      },
                    },
                  },
                ],
              },
              {
                type: 'Container',
                width: '100%',
                paddingTop: '10dp',
                data: '${payload.detail.episodes}',
                items: [
                  {
                    type: 'TouchWrapper',
                    paddingBottom: '8dp',
                    onPress: [
                      {
                        type: 'SendEvent',
                        arguments: [
                          'OPEN_STREAMS',
                          '${payload.detail.type}',
                          '${payload.detail.id}',
                          '${data.id}',
                          '${data.fullTitle}',
                        ],
                      },
                    ],
                    item: {
                      type: 'Frame',
                      width: '100%',
                      minHeight: '58dp',
                      backgroundColor: THEME_COLORS.BG_SURFACE,
                      borderRadius: '12dp',
                      borderWidth: '1dp',
                      borderColor:
                        "${data.isInProgress ? '#7B5BF5' : '#312C4E'}",
                      paddingLeft: '16dp',
                      paddingRight: '16dp',
                      paddingTop: '10dp',
                      paddingBottom: '10dp',
                      item: {
                        type: 'Container',
                        direction: 'row',
                        alignItems: 'center',
                        justifyContent: 'spaceBetween',
                        items: [
                          {
                            type: 'Container',
                            grow: 1,
                            shrink: 1,
                            paddingRight: '12dp',
                            items: [
                              {
                                type: 'Text',
                                text: '${data.episodeLabel} · ${data.title}',
                                color: THEME_COLORS.TEXT_PRIMARY,
                                fontSize: '17dp',
                                fontWeight: '600',
                                maxLines: 1,
                              },
                              {
                                type: 'Text',
                                when: '${data.released != ""}',
                                text: '${data.released}',
                                color: THEME_COLORS.TEXT_SECONDARY,
                                fontSize: '13dp',
                              },
                            ],
                          },
                          {
                            type: 'Text',
                            text: "${data.isInProgress ? '▶ Reanudar' : '▶ Ver'}",
                            color: THEME_COLORS.ACCENT_HOVER,
                            fontSize: '15dp',
                            fontWeight: '700',
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ]);

  const datasources = {
    detail: {
      id: data.meta.id,
      type: data.meta.type,
      name: data.meta.name,
      poster: data.meta.poster ?? '',
      backdrop: data.meta.background ?? data.meta.poster ?? '',
      infoLine: infoParts.join(' · '),
      description: data.meta.description ?? '',
      isSeries,
      resumeLabel,
      seasons: seasonNumbers.map((s) => ({
        season: s,
        label: s === 0 ? 'Especiales' : `T${s}`,
        isActive: s === activeSeason,
      })),
      episodes: pageEpisodes,
      hasPagination: totalPages > 1,
      hasPrevPage: currentPage > 0,
      hasNextPage: currentPage < totalPages - 1,
      prevPage: Math.max(0, currentPage - 1),
      nextPage: Math.min(totalPages - 1, currentPage + 1),
      pageLabel: `Página ${currentPage + 1} de ${totalPages} (${seasonEpisodes.length} eps.)`,
    },
  };

  return { document, datasources };
}
