import { THEME_COLORS } from '../../config/constants';
import type { CatalogRow, ContinueWatchingItem } from '../../types/stremio';
import { buildTopNavHeader, createBaseAplDocument } from '../theme';

export interface HomeScreenData {
  maskedEmail?: string;
  continueWatching: ContinueWatchingItem[];
  catalogs: CatalogRow[];
}

export function buildHomeScreen(data: HomeScreenData): {
  document: Record<string, unknown>;
  datasources: Record<string, unknown>;
} {
  const continueItems = data.continueWatching.map((cw) => ({
    ...cw,
    subtitle:
      cw.season !== undefined && cw.episode !== undefined
        ? `T${cw.season} · E${cw.episode}`
        : cw.type === 'movie'
          ? 'Película'
          : 'Continuar',
    progressWidth: `${Math.max(4, Math.min(100, cw.progressPercent))}%`,
  }));

  const document = createBaseAplDocument([
    buildTopNavHeader({
      activeTab: 'home',
      showBack: false,
      maskedEmail: data.maskedEmail,
    }),
    {
      type: 'ScrollView',
      width: '100%',
      grow: 1,
      paddingTop: '18dp',
      paddingBottom: '28dp',
      item: {
        type: 'Container',
        width: '100%',
        paddingLeft: '24dp',
        paddingRight: '24dp',
        items: [
          {
            type: 'Container',
            when: '${payload.home.hasContinueWatching}',
            paddingBottom: '22dp',
            items: [
              {
                type: 'Text',
                text: 'Continuar viendo',
                color: THEME_COLORS.TEXT_PRIMARY,
                fontSize: '22dp',
                fontWeight: '700',
                paddingBottom: '12dp',
              },
              {
                type: 'Sequence',
                scrollDirection: 'horizontal',
                width: '100%',
                height: '250dp',
                data: '${payload.home.continueWatching}',
                items: [
                  {
                    type: 'TouchWrapper',
                    paddingRight: '14dp',
                    onPress: [
                      {
                        type: 'SendEvent',
                        arguments: [
                          'OPEN_DETAIL',
                          '${data.type}',
                          '${data.id}',
                          '${data.videoId}',
                        ],
                      },
                    ],
                    item: {
                      type: 'Container',
                      width: '150dp',
                      items: [
                        {
                          type: 'Frame',
                          width: '150dp',
                          height: '200dp',
                          borderRadius: '12dp',
                          backgroundColor: THEME_COLORS.BG_SURFACE,
                          borderWidth: '1dp',
                          borderColor: THEME_COLORS.BORDER_SUBTLE,
                          item: {
                            type: 'Container',
                            width: '100%',
                            height: '100%',
                            items: [
                              {
                                type: 'Image',
                                when: '${data.poster != ""}',
                                source: '${data.poster}',
                                width: '100%',
                                height: '194dp',
                                scale: 'best-fill',
                              },
                              {
                                type: 'Frame',
                                when: '${data.poster == ""}',
                                width: '100%',
                                height: '194dp',
                                backgroundColor: THEME_COLORS.BG_ELEVATED,
                                item: {
                                  type: 'Text',
                                  text: '${data.name}',
                                  color: THEME_COLORS.TEXT_SECONDARY,
                                  fontSize: '14dp',
                                  textAlign: 'center',
                                  textAlignVertical: 'center',
                                  padding: '8dp',
                                  width: '100%',
                                  height: '100%',
                                },
                              },
                              {
                                type: 'Frame',
                                width: '100%',
                                height: '6dp',
                                backgroundColor: THEME_COLORS.BORDER_SUBTLE,
                                item: {
                                  type: 'Frame',
                                  width: '${data.progressWidth}',
                                  height: '100%',
                                  backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
                                },
                              },
                            ],
                          },
                        },
                        {
                          type: 'Text',
                          text: '${data.name}',
                          color: THEME_COLORS.TEXT_PRIMARY,
                          fontSize: '15dp',
                          fontWeight: '600',
                          maxLines: 1,
                          paddingTop: '6dp',
                        },
                        {
                          type: 'Text',
                          text: '${data.subtitle}',
                          color: THEME_COLORS.ACCENT_HOVER,
                          fontSize: '13dp',
                          maxLines: 1,
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
          {
            type: 'Container',
            when: '${payload.home.hasCatalogs}',
            data: '${payload.home.catalogs}',
            items: [
              {
                type: 'Container',
                paddingBottom: '22dp',
                items: [
                  {
                    type: 'Text',
                    text: '${data.title}',
                    color: THEME_COLORS.TEXT_PRIMARY,
                    fontSize: '22dp',
                    fontWeight: '700',
                    paddingBottom: '12dp',
                  },
                  {
                    type: 'Sequence',
                    scrollDirection: 'horizontal',
                    width: '100%',
                    height: '240dp',
                    data: '${data.items}',
                    items: [
                      {
                        type: 'TouchWrapper',
                        paddingRight: '14dp',
                        onPress: [
                          {
                            type: 'SendEvent',
                            arguments: [
                              'OPEN_DETAIL',
                              '${data.type}',
                              '${data.id}',
                            ],
                          },
                        ],
                        item: {
                          type: 'Container',
                          width: '140dp',
                          items: [
                            {
                              type: 'Frame',
                              width: '140dp',
                              height: '198dp',
                              borderRadius: '12dp',
                              backgroundColor: THEME_COLORS.BG_SURFACE,
                              borderWidth: '1dp',
                              borderColor: THEME_COLORS.BORDER_SUBTLE,
                              item: {
                                type: 'Container',
                                width: '100%',
                                height: '100%',
                                items: [
                                  {
                                    type: 'Image',
                                    when: '${data.poster != ""}',
                                    source: '${data.poster}',
                                    width: '100%',
                                    height: '100%',
                                    scale: 'best-fill',
                                  },
                                  {
                                    type: 'Text',
                                    when: '${data.poster == ""}',
                                    text: '${data.name}',
                                    color: THEME_COLORS.TEXT_SECONDARY,
                                    fontSize: '14dp',
                                    textAlign: 'center',
                                    textAlignVertical: 'center',
                                    padding: '8dp',
                                    width: '100%',
                                    height: '100%',
                                  },
                                ],
                              },
                            },
                            {
                              type: 'Text',
                              text: '${data.name}',
                              color: THEME_COLORS.TEXT_PRIMARY,
                              fontSize: '15dp',
                              fontWeight: '600',
                              maxLines: 1,
                              paddingTop: '6dp',
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'Frame',
            when: '${!payload.home.hasContinueWatching && !payload.home.hasCatalogs}',
            backgroundColor: THEME_COLORS.BG_SURFACE,
            borderRadius: '14dp',
            padding: '28dp',
            item: {
              type: 'Container',
              alignItems: 'center',
              items: [
                {
                  type: 'Text',
                  text: 'No se encontraron catálogos disponibles en tus addons.',
                  color: THEME_COLORS.TEXT_PRIMARY,
                  fontSize: '20dp',
                  fontWeight: '600',
                  paddingBottom: '12dp',
                },
                {
                  type: 'Text',
                  text: 'Prueba a buscar un título con la voz ("Alexa, busca One Piece") o pulsa Buscar arriba.',
                  color: THEME_COLORS.TEXT_SECONDARY,
                  fontSize: '16dp',
                },
              ],
            },
          },
        ],
      },
    },
  ]);

  const datasources = {
    home: {
      hasContinueWatching: continueItems.length > 0,
      continueWatching: continueItems.map((c) => ({
        ...c,
        poster: c.poster ?? '',
      })),
      hasCatalogs: data.catalogs.length > 0,
      catalogs: data.catalogs.map((row) => ({
        ...row,
        items: row.items.map((item) => ({
          ...item,
          poster: item.poster ?? '',
        })),
      })),
    },
  };

  return { document, datasources };
}
