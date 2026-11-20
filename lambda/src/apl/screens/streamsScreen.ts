import { THEME_COLORS } from '../../config/constants';
import type { ClassifiedStream } from '../../types/stremio';
import { buildTopNavHeader, createBaseAplDocument } from '../theme';

export interface StreamsScreenData {
  maskedEmail?: string;
  mediaTitle: string;
  streams: ClassifiedStream[];
}

export function buildStreamsScreen(data: StreamsScreenData): {
  document: Record<string, unknown>;
  datasources: Record<string, unknown>;
} {
  const document = createBaseAplDocument([
    buildTopNavHeader({
      activeTab: 'none',
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
          type: 'Text',
          text: 'Elige una fuente · ${payload.streams.mediaTitle}',
          color: THEME_COLORS.TEXT_PRIMARY,
          fontSize: '22dp',
          fontWeight: '700',
          maxLines: 1,
          paddingBottom: '4dp',
        },
        {
          type: 'Text',
          text: 'Streams HTTPS directos ordenados por compatibilidad con Echo Show (los torrents sin URL Debrid se ocultan).',
          color: THEME_COLORS.TEXT_SECONDARY,
          fontSize: '14dp',
          paddingBottom: '14dp',
        },
        {
          type: 'Sequence',
          when: '${payload.streams.hasStreams}',
          width: '100%',
          grow: 1,
          scrollDirection: 'vertical',
          data: '${payload.streams.items}',
          items: [
            {
              type: 'TouchWrapper',
              paddingBottom: '10dp',
              onPress: [
                {
                  type: 'SendEvent',
                  arguments: ['PLAY_STREAM', '${data.index}'],
                },
              ],
              item: {
                type: 'Frame',
                width: '100%',
                backgroundColor: THEME_COLORS.BG_SURFACE,
                borderRadius: '12dp',
                borderWidth: '1dp',
                borderColor:
                  "${data.isCompatible ? '#22C55E' : '#F59E0B'}",
                padding: '14dp',
                item: {
                  type: 'Container',
                  width: '100%',
                  items: [
                    {
                      type: 'Container',
                      direction: 'row',
                      alignItems: 'center',
                      justifyContent: 'spaceBetween',
                      paddingBottom: '6dp',
                      items: [
                        {
                          type: 'Container',
                          direction: 'row',
                          alignItems: 'center',
                          items: [
                            {
                              type: 'Frame',
                              borderRadius: '6dp',
                              paddingLeft: '8dp',
                              paddingRight: '8dp',
                              paddingTop: '3dp',
                              paddingBottom: '3dp',
                              backgroundColor:
                                "${data.isCompatible ? '#1A22C55E' : '#1AF59E0B'}",
                              item: {
                                type: 'Text',
                                text: '${data.badgeText}',
                                color:
                                  "${data.isCompatible ? '#22C55E' : '#F59E0B'}",
                                fontSize: '13dp',
                                fontWeight: '700',
                              },
                            },
                            {
                              type: 'Text',
                              text: '${data.addonName}',
                              color: THEME_COLORS.ACCENT_HOVER,
                              fontSize: '14dp',
                              fontWeight: '600',
                              paddingLeft: '10dp',
                            },
                          ],
                        },
                        {
                          type: 'Text',
                          text: '${data.metaLine}',
                          color: THEME_COLORS.TEXT_SECONDARY,
                          fontSize: '14dp',
                        },
                      ],
                    },
                    {
                      type: 'Text',
                      text: '${data.displayTitle}',
                      color: THEME_COLORS.TEXT_PRIMARY,
                      fontSize: '16dp',
                      maxLines: 2,
                    },
                  ],
                },
              },
            },
          ],
        },
        {
          type: 'Frame',
          when: '${!payload.streams.hasStreams}',
          backgroundColor: THEME_COLORS.BG_SURFACE,
          borderRadius: '14dp',
          padding: '28dp',
          item: {
            type: 'Container',
            items: [
              {
                type: 'Text',
                text: 'No se encontraron streams HTTPS directos.',
                color: THEME_COLORS.TEXT_PRIMARY,
                fontSize: '20dp',
                fontWeight: '700',
                paddingBottom: '8dp',
              },
              {
                type: 'Text',
                text: 'Echo Show no puede reproducir torrents P2P (infoHash) directamente. Comprueba que tu addon tiene configurado tu servicio Debrid (Real-Debrid / TorBox).',
                color: THEME_COLORS.TEXT_SECONDARY,
                fontSize: '16dp',
              },
            ],
          },
        },
      ],
    },
  ]);

  const items = data.streams.map((s) => ({
    index: s.index,
    addonName: s.addonName,
    displayTitle: s.displayTitle,
    metaLine: s.metaLine,
    isCompatible: s.compatibility === 'compatible',
    badgeText: s.warningReason
      ? `${s.statusBadge} (${s.warningReason})`
      : s.statusBadge,
  }));

  const datasources = {
    streams: {
      mediaTitle: data.mediaTitle,
      hasStreams: items.length > 0,
      items,
    },
  };

  return { document, datasources };
}
