import {
  APL_PLAYER_VIDEO_ID,
  APL_VERSION,
  THEME_COLORS,
} from '../../config/constants';
import type { ClassifiedStream, NormalizedSubtitle } from '../../types/stremio';

export interface PlayerScreenData {
  title: string;
  subtitleText?: string;
  activeStream: ClassifiedStream;
  activeSubtitle: NormalizedSubtitle | null;
  streams: ClassifiedStream[];
  subtitles: NormalizedSubtitle[];
  offsetMs: number;
  durationMs: number;
  hasNextEpisode: boolean;
}

function controlButton(
  label: string,
  commands: Array<Record<string, unknown>>,
  primary = false
): Record<string, unknown> {
  return {
    type: 'TouchWrapper',
    onPress: commands,
    item: {
      type: 'Frame',
      height: '44dp',
      paddingLeft: '14dp',
      paddingRight: '14dp',
      borderRadius: '10dp',
      backgroundColor: primary
        ? THEME_COLORS.ACCENT_PRIMARY
        : THEME_COLORS.BG_ELEVATED,
      borderWidth: '1dp',
      borderColor: primary
        ? THEME_COLORS.ACCENT_HOVER
        : THEME_COLORS.BORDER_SUBTLE,
      item: {
        type: 'Text',
        text: label,
        color: THEME_COLORS.TEXT_PRIMARY,
        fontSize: '16dp',
        fontWeight: '600',
        textAlignVertical: 'center',
        height: '100%',
      },
    },
  };
}

export function buildPlayerScreen(data: PlayerScreenData): {
  document: Record<string, unknown>;
  datasources: Record<string, unknown>;
} {
  const sourceItem: Record<string, unknown> = {
    url: data.activeStream.url,
    offset: Math.max(0, Math.round(data.offsetMs)),
  };

  if (data.activeSubtitle) {
    sourceItem.textTrack = [
      {
        type: 'caption',
        url: data.activeSubtitle.url,
        language: data.activeSubtitle.langCode,
        description: data.activeSubtitle.langLabel,
      },
    ];
  }

  const document: Record<string, unknown> = {
    type: 'APL',
    version: APL_VERSION,
    theme: 'dark',
    mainTemplate: {
      parameters: ['payload'],
      items: [
        {
          type: 'Container',
          width: '100vw',
          height: '100vh',
          backgroundColor: '#000000',
          bind: [
            {
              name: 'currentTimeMs',
              type: 'number',
              value: '${payload.player.offsetMs}',
            },
            {
              name: 'durationMs',
              type: 'number',
              value: '${payload.player.durationMs}',
            },
            { name: 'isPlaying', type: 'boolean', value: true },
            { name: 'showControls', type: 'boolean', value: true },
            { name: 'showSubtitlesDrawer', type: 'boolean', value: false },
            { name: 'showStreamsDrawer', type: 'boolean', value: false },
            { name: 'showEndedOverlay', type: 'boolean', value: false },
          ],
          items: [
            {
              type: 'Video',
              id: APL_PLAYER_VIDEO_ID,
              width: '100vw',
              height: '100vh',
              autoplay: true,
              screenLock: true,
              audioTrack: 'foreground',
              scale: 'best-fit',
              source: '${payload.player.source}',
              onTrackUpdate: [
                {
                  type: 'SetValue',
                  property: 'durationMs',
                  value: '${event.target.duration}',
                },
              ],
              onTimeUpdate: [
                {
                  type: 'SetValue',
                  property: 'currentTimeMs',
                  value: '${event.target.currentTime}',
                },
                {
                  type: 'SetValue',
                  property: 'durationMs',
                  value: '${event.target.duration}',
                },
              ],
              onPlay: [
                { type: 'SetValue', property: 'isPlaying', value: true },
                { type: 'SetValue', property: 'showEndedOverlay', value: false },
              ],
              onPause: [
                { type: 'SetValue', property: 'isPlaying', value: false },
                {
                  type: 'SendEvent',
                  arguments: [
                    'SAVE_PROGRESS',
                    '${currentTimeMs}',
                    '${durationMs}',
                  ],
                },
              ],
              onEnd: [
                { type: 'SetValue', property: 'isPlaying', value: false },
                { type: 'SetValue', property: 'showControls', value: true },
                { type: 'SetValue', property: 'showEndedOverlay', value: true },
                {
                  type: 'SendEvent',
                  arguments: [
                    'VIDEO_ENDED',
                    '${currentTimeMs}',
                    '${durationMs}',
                  ],
                },
              ],
            },
            {
              type: 'TouchWrapper',
              position: 'absolute',
              width: '100vw',
              height: '100vh',
              onPress: [
                {
                  type: 'SetValue',
                  property: 'showControls',
                  value: '${!showControls}',
                },
                {
                  type: 'SetValue',
                  property: 'showSubtitlesDrawer',
                  value: false,
                },
                {
                  type: 'SetValue',
                  property: 'showStreamsDrawer',
                  value: false,
                },
              ],
              item: {
                type: 'Container',
                width: '100%',
                height: '100%',
              },
            },
            {
              type: 'Container',
              when: '${showControls}',
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100vw',
              padding: '16dp',
              backgroundColor: THEME_COLORS.BG_HUD_BAR,
              direction: 'row',
              alignItems: 'center',
              justifyContent: 'spaceBetween',
              items: [
                {
                  type: 'Container',
                  direction: 'row',
                  alignItems: 'center',
                  grow: 1,
                  shrink: 1,
                  items: [
                    controlButton('← Atrás', [
                      {
                        type: 'SendEvent',
                        arguments: [
                          'PLAYER_BACK',
                          '${currentTimeMs}',
                          '${durationMs}',
                        ],
                      },
                    ]),
                    {
                      type: 'Container',
                      paddingLeft: '14dp',
                      grow: 1,
                      shrink: 1,
                      items: [
                        {
                          type: 'Text',
                          text: '${payload.player.title}',
                          color: THEME_COLORS.TEXT_PRIMARY,
                          fontSize: '20dp',
                          fontWeight: '700',
                          maxLines: 1,
                        },
                        {
                          type: 'Text',
                          text: '${payload.player.statusLine}',
                          color: THEME_COLORS.ACCENT_HOVER,
                          fontSize: '13dp',
                          maxLines: 1,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'Container',
              when: '${showControls}',
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100vw',
              padding: '16dp',
              backgroundColor: THEME_COLORS.BG_HUD_BAR,
              direction: 'row',
              alignItems: 'center',
              justifyContent: 'spaceBetween',
              items: [
                {
                  type: 'Container',
                  direction: 'row',
                  alignItems: 'center',
                  spacing: '8dp',
                  items: [
                    controlButton('↺ -15s', [
                      {
                        type: 'ControlMedia',
                        componentId: APL_PLAYER_VIDEO_ID,
                        command: 'seek',
                        value: -15000,
                      },
                    ]),
                    controlButton(
                      "${isPlaying ? '⏸ Pausa' : '▶ Reproducir'}",
                      [
                        {
                          type: 'ControlMedia',
                          componentId: APL_PLAYER_VIDEO_ID,
                          command: "${isPlaying ? 'pause' : 'play'}",
                        },
                      ],
                      true
                    ),
                    controlButton('+30s ↻', [
                      {
                        type: 'ControlMedia',
                        componentId: APL_PLAYER_VIDEO_ID,
                        command: 'seek',
                        value: 30000,
                      },
                    ]),
                  ],
                },
                {
                  type: 'Container',
                  direction: 'row',
                  alignItems: 'center',
                  spacing: '8dp',
                  items: [
                    controlButton('Subtítulos', [
                      {
                        type: 'SetValue',
                        property: 'showSubtitlesDrawer',
                        value: '${!showSubtitlesDrawer}',
                      },
                      {
                        type: 'SetValue',
                        property: 'showStreamsDrawer',
                        value: false,
                      },
                    ]),
                    controlButton('Streams / Audio', [
                      {
                        type: 'SetValue',
                        property: 'showStreamsDrawer',
                        value: '${!showStreamsDrawer}',
                      },
                      {
                        type: 'SetValue',
                        property: 'showSubtitlesDrawer',
                        value: false,
                      },
                    ]),
                    {
                      ...controlButton(
                        'Siguiente ep. ⏭',
                        [
                          {
                            type: 'SendEvent',
                            arguments: [
                              'NEXT_EPISODE',
                              '${currentTimeMs}',
                              '${durationMs}',
                            ],
                          },
                        ],
                        true
                      ),
                      when: '${payload.player.hasNextEpisode}',
                    },
                  ],
                },
              ],
            },
            {
              type: 'Frame',
              when: '${showSubtitlesDrawer}',
              position: 'absolute',
              top: '76dp',
              bottom: '80dp',
              right: '16dp',
              width: '360dp',
              maxWidth: '80vw',
              backgroundColor: THEME_COLORS.BG_SURFACE,
              borderRadius: '14dp',
              borderWidth: '1dp',
              borderColor: THEME_COLORS.BORDER_SUBTLE,
              padding: '16dp',
              item: {
                type: 'Container',
                width: '100%',
                height: '100%',
                items: [
                  {
                    type: 'Text',
                    text: 'Subtítulos (.srt)',
                    color: THEME_COLORS.TEXT_PRIMARY,
                    fontSize: '18dp',
                    fontWeight: '700',
                    paddingBottom: '4dp',
                  },
                  {
                    type: 'Text',
                    text: 'Requiere activar Subtítulos en Accesibilidad del Echo Show',
                    color: THEME_COLORS.TEXT_SECONDARY,
                    fontSize: '12dp',
                    paddingBottom: '10dp',
                  },
                  {
                    type: 'TouchWrapper',
                    paddingBottom: '8dp',
                    onPress: [
                      {
                        type: 'SendEvent',
                        arguments: [
                          'SELECT_SUBTITLE',
                          'off',
                          '${currentTimeMs}',
                          '${durationMs}',
                        ],
                      },
                    ],
                    item: {
                      type: 'Frame',
                      width: '100%',
                      padding: '10dp',
                      borderRadius: '10dp',
                      backgroundColor:
                        "${payload.player.activeSubtitleId == 'off' ? '#7B5BF5' : '#231F3D'}",
                      item: {
                        type: 'Text',
                        text: 'Desactivar subtítulos',
                        color: THEME_COLORS.TEXT_PRIMARY,
                        fontSize: '15dp',
                        fontWeight: '600',
                      },
                    },
                  },
                  {
                    type: 'Sequence',
                    width: '100%',
                    grow: 1,
                    scrollDirection: 'vertical',
                    data: '${payload.player.subtitles}',
                    items: [
                      {
                        type: 'TouchWrapper',
                        paddingBottom: '6dp',
                        onPress: [
                          {
                            type: 'SendEvent',
                            arguments: [
                              'SELECT_SUBTITLE',
                              '${data.id}',
                              '${currentTimeMs}',
                              '${durationMs}',
                            ],
                          },
                        ],
                        item: {
                          type: 'Frame',
                          width: '100%',
                          padding: '10dp',
                          borderRadius: '10dp',
                          backgroundColor:
                            "${data.isActive ? '#7B5BF5' : '#231F3D'}",
                          item: {
                            type: 'Text',
                            text: '${data.label}',
                            color: THEME_COLORS.TEXT_PRIMARY,
                            fontSize: '15dp',
                            maxLines: 1,
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
            {
              type: 'Frame',
              when: '${showStreamsDrawer}',
              position: 'absolute',
              top: '76dp',
              bottom: '80dp',
              right: '16dp',
              width: '410dp',
              maxWidth: '86vw',
              backgroundColor: THEME_COLORS.BG_SURFACE,
              borderRadius: '14dp',
              borderWidth: '1dp',
              borderColor: THEME_COLORS.BORDER_SUBTLE,
              padding: '16dp',
              item: {
                type: 'Container',
                width: '100%',
                height: '100%',
                items: [
                  {
                    type: 'Text',
                    text: 'Cambiar stream / idioma',
                    color: THEME_COLORS.TEXT_PRIMARY,
                    fontSize: '18dp',
                    fontWeight: '700',
                    paddingBottom: '4dp',
                  },
                  {
                    type: 'Text',
                    text: 'Mantiene el segundo actual al cambiar de fuente.',
                    color: THEME_COLORS.TEXT_SECONDARY,
                    fontSize: '12dp',
                    paddingBottom: '10dp',
                  },
                  {
                    type: 'Sequence',
                    width: '100%',
                    grow: 1,
                    scrollDirection: 'vertical',
                    data: '${payload.player.streams}',
                    items: [
                      {
                        type: 'TouchWrapper',
                        paddingBottom: '8dp',
                        onPress: [
                          {
                            type: 'SendEvent',
                            arguments: [
                              'SWITCH_STREAM',
                              '${data.index}',
                              '${currentTimeMs}',
                              '${durationMs}',
                            ],
                          },
                        ],
                        item: {
                          type: 'Frame',
                          width: '100%',
                          padding: '10dp',
                          borderRadius: '10dp',
                          backgroundColor:
                            "${data.isActive ? '#7B5BF5' : '#231F3D'}",
                          item: {
                            type: 'Container',
                            items: [
                              {
                                type: 'Text',
                                text: '${data.header}',
                                color: THEME_COLORS.TEXT_PRIMARY,
                                fontSize: '14dp',
                                fontWeight: '700',
                                maxLines: 1,
                              },
                              {
                                type: 'Text',
                                text: '${data.displayTitle}',
                                color: THEME_COLORS.TEXT_SECONDARY,
                                fontSize: '13dp',
                                maxLines: 1,
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            },
            {
              type: 'Container',
              when: '${showEndedOverlay}',
              position: 'absolute',
              width: '100vw',
              height: '100vh',
              backgroundColor: THEME_COLORS.BG_OVERLAY,
              alignItems: 'center',
              justifyContent: 'center',
              items: [
                {
                  type: 'Frame',
                  backgroundColor: THEME_COLORS.BG_SURFACE,
                  borderRadius: '16dp',
                  borderWidth: '1dp',
                  borderColor: THEME_COLORS.BORDER_SUBTLE,
                  padding: '28dp',
                  item: {
                    type: 'Container',
                    alignItems: 'center',
                    items: [
                      {
                        type: 'Text',
                        text: 'Reproducción finalizada',
                        color: THEME_COLORS.TEXT_PRIMARY,
                        fontSize: '24dp',
                        fontWeight: '700',
                        paddingBottom: '18dp',
                      },
                      {
                        type: 'Container',
                        direction: 'row',
                        spacing: '12dp',
                        items: [
                          {
                            ...controlButton(
                              '▶ Siguiente episodio',
                              [
                                {
                                  type: 'SendEvent',
                                  arguments: [
                                    'NEXT_EPISODE',
                                    '${currentTimeMs}',
                                    '${durationMs}',
                                  ],
                                },
                              ],
                              true
                            ),
                            when: '${payload.player.hasNextEpisode}',
                          },
                          controlButton('Volver a la ficha', [
                            {
                              type: 'SendEvent',
                              arguments: [
                                'PLAYER_BACK',
                                '${currentTimeMs}',
                                '${durationMs}',
                              ],
                            },
                          ]),
                        ],
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
  };

  const subtitleLabel = data.activeSubtitle
    ? `Sub: ${data.activeSubtitle.langLabel}`
    : 'Sin subtítulos';

  const datasources = {
    player: {
      title: data.title,
      statusLine: `${data.activeStream.metaLine} · ${subtitleLabel}`,
      offsetMs: Math.max(0, Math.round(data.offsetMs)),
      durationMs: Math.max(0, Math.round(data.durationMs)),
      source: [sourceItem],
      hasNextEpisode: data.hasNextEpisode,
      activeSubtitleId: data.activeSubtitle?.id ?? 'off',
      subtitles: data.subtitles.map((sub, idx) => ({
        id: sub.id,
        label: `${idx + 1}. ${sub.langLabel} (${sub.providerName})`,
        isActive: data.activeSubtitle?.id === sub.id,
      })),
      streams: data.streams.map((stream) => ({
        index: stream.index,
        header: `${stream.statusBadge} · ${stream.metaLine}`,
        displayTitle: stream.displayTitle,
        isActive: stream.index === data.activeStream.index,
      })),
    },
  };

  return { document, datasources };
}
