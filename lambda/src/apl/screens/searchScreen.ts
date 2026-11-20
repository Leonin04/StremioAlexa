import { THEME_COLORS } from '../../config/constants';
import type { MetaPreview } from '../../types/stremio';
import { buildTopNavHeader, createBaseAplDocument } from '../theme';

export interface SearchScreenData {
  maskedEmail?: string;
  query: string;
  results: MetaPreview[];
  searched: boolean;
}

export function buildSearchScreen(data: SearchScreenData): {
  document: Record<string, unknown>;
  datasources: Record<string, unknown>;
} {
  const document = createBaseAplDocument([
    buildTopNavHeader({
      activeTab: 'search',
      showBack: true,
      maskedEmail: data.maskedEmail,
    }),
    {
      type: 'Container',
      width: '100%',
      grow: 1,
      paddingTop: '18dp',
      paddingLeft: '24dp',
      paddingRight: '24dp',
      paddingBottom: '20dp',
      items: [
        {
          type: 'Container',
          direction: 'row',
          width: '100%',
          alignItems: 'center',
          paddingBottom: '18dp',
          items: [
            {
              type: 'Frame',
              grow: 1,
              height: '50dp',
              backgroundColor: THEME_COLORS.BG_SURFACE,
              borderRadius: '12dp',
              borderWidth: '1dp',
              borderColor: THEME_COLORS.BORDER_SUBTLE,
              paddingLeft: '14dp',
              paddingRight: '14dp',
              marginRight: '12dp',
              item: {
                type: 'EditText',
                id: 'searchInput',
                width: '100%',
                height: '100%',
                text: '${payload.search.query}',
                hint: 'Buscar películas o series (o di: Alexa, busca...)',
                hintColor: THEME_COLORS.TEXT_SECONDARY,
                color: THEME_COLORS.TEXT_PRIMARY,
                fontSize: '18dp',
                submitKeyType: 'search',
                onSubmit: [
                  {
                    type: 'SendEvent',
                    arguments: ['SEARCH_SUBMIT', '${event.source.text}'],
                  },
                ],
              },
            },
            {
              type: 'TouchWrapper',
              onPress: [
                {
                  type: 'SendEvent',
                  arguments: ['SEARCH_SUBMIT'],
                  components: ['searchInput'],
                },
              ],
              item: {
                type: 'Frame',
                height: '50dp',
                paddingLeft: '22dp',
                paddingRight: '22dp',
                borderRadius: '12dp',
                backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
                item: {
                  type: 'Text',
                  text: 'Buscar',
                  color: THEME_COLORS.TEXT_PRIMARY,
                  fontSize: '18dp',
                  fontWeight: '700',
                  textAlignVertical: 'center',
                  height: '100%',
                },
              },
            },
          ],
        },
        {
          type: 'Text',
          when: '${payload.search.searched && payload.search.hasResults}',
          text: 'Resultados para "${payload.search.query}"',
          color: THEME_COLORS.TEXT_SECONDARY,
          fontSize: '16dp',
          paddingBottom: '12dp',
        },
        {
          type: 'GridSequence',
          when: '${payload.search.hasResults}',
          width: '100%',
          grow: 1,
          scrollDirection: 'vertical',
          childWidth: '160dp',
          childHeight: '255dp',
          data: '${payload.search.results}',
          items: [
            {
              type: 'TouchWrapper',
              padding: '6dp',
              onPress: [
                {
                  type: 'SendEvent',
                  arguments: ['OPEN_DETAIL', '${data.type}', '${data.id}'],
                },
              ],
              item: {
                type: 'Container',
                width: '100%',
                items: [
                  {
                    type: 'Frame',
                    width: '146dp',
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
                  {
                    type: 'Text',
                    text: '${data.metaSubtitle}',
                    color: THEME_COLORS.TEXT_SECONDARY,
                    fontSize: '13dp',
                    maxLines: 1,
                  },
                ],
              },
            },
          ],
        },
        {
          type: 'Frame',
          when: '${payload.search.searched && !payload.search.hasResults}',
          backgroundColor: THEME_COLORS.BG_SURFACE,
          borderRadius: '14dp',
          padding: '24dp',
          item: {
            type: 'Text',
            text: 'No hubo resultados para "${payload.search.query}". Prueba con otro título o en inglés.',
            color: THEME_COLORS.TEXT_SECONDARY,
            fontSize: '18dp',
            textAlign: 'center',
          },
        },
      ],
    },
  ]);

  const mappedResults = data.results.map((item) => ({
    ...item,
    poster: item.poster ?? '',
    metaSubtitle: [
      item.type === 'movie'
        ? 'Película'
        : item.type === 'series'
          ? 'Serie'
          : item.type,
      item.releaseInfo,
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  const datasources = {
    search: {
      query: data.query,
      searched: data.searched,
      hasResults: mappedResults.length > 0,
      results: mappedResults,
    },
  };

  return { document, datasources };
}
