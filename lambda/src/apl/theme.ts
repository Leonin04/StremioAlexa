import { APL_VERSION, THEME_COLORS } from '../config/constants';

export type NavTab = 'home' | 'search' | 'none';

export interface TopNavOptions {
  activeTab: NavTab;
  showBack?: boolean;
  maskedEmail?: string;
}

export function createBaseAplDocument(
  mainItems: Array<Record<string, unknown>>,
  extraProps: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: 'APL',
    version: APL_VERSION,
    theme: 'dark',
    import: [
      {
        name: 'alexa-layouts',
        version: '1.7.0',
      },
    ],
    styles: {
      stremioButton: {
        values: [
          {
            backgroundColor: THEME_COLORS.BG_ELEVATED,
            borderRadius: '10dp',
            borderWidth: '1dp',
            borderColor: THEME_COLORS.BORDER_SUBTLE,
          },
          {
            when: '${state.pressed}',
            backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
          },
        ],
      },
      stremioPrimaryButton: {
        values: [
          {
            backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
            borderRadius: '10dp',
          },
          {
            when: '${state.pressed}',
            backgroundColor: THEME_COLORS.ACCENT_HOVER,
          },
        ],
      },
    },
    mainTemplate: {
      parameters: ['payload'],
      items: [
        {
          type: 'Container',
          width: '100vw',
          height: '100vh',
          backgroundColor: THEME_COLORS.BG_DEEP,
          ...extraProps,
          items: mainItems,
        },
      ],
    },
  };
}

function navButton(
  label: string,
  eventArgs: string[],
  isActive = false
): Record<string, unknown> {
  return {
    type: 'TouchWrapper',
    onPress: [
      {
        type: 'SendEvent',
        arguments: eventArgs,
      },
    ],
    item: {
      type: 'Frame',
      height: '40dp',
      paddingLeft: '14dp',
      paddingRight: '14dp',
      backgroundColor: isActive
        ? THEME_COLORS.ACCENT_PRIMARY
        : THEME_COLORS.BG_ELEVATED,
      borderRadius: '20dp',
      borderWidth: '1dp',
      borderColor: isActive
        ? THEME_COLORS.ACCENT_HOVER
        : THEME_COLORS.BORDER_SUBTLE,
      item: {
        type: 'Text',
        text: label,
        color: THEME_COLORS.TEXT_PRIMARY,
        fontSize: '18dp',
        fontWeight: isActive ? '700' : '500',
        textAlignVertical: 'center',
        height: '100%',
      },
    },
  };
}

export function buildTopNavHeader(
  options: TopNavOptions
): Record<string, unknown> {
  const leftItems: Array<Record<string, unknown>> = [];

  if (options.showBack) {
    leftItems.push(navButton('← Atrás', ['NAV_BACK'], false));
  }

  leftItems.push({
    type: 'Container',
    direction: 'row',
    alignItems: 'center',
    paddingLeft: options.showBack ? '10dp' : '0dp',
    items: [
      {
        type: 'Frame',
        width: '32dp',
        height: '32dp',
        borderRadius: '8dp',
        backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
        item: {
          type: 'Text',
          text: '▶',
          color: THEME_COLORS.TEXT_PRIMARY,
          fontSize: '16dp',
          textAlign: 'center',
          textAlignVertical: 'center',
          width: '100%',
          height: '100%',
        },
      },
      {
        type: 'Text',
        text: 'Stremio',
        color: THEME_COLORS.TEXT_PRIMARY,
        fontSize: '22dp',
        fontWeight: '700',
        paddingLeft: '10dp',
      },
    ],
  });

  const rightItems: Array<Record<string, unknown>> = [
    navButton('Inicio', ['NAV_HOME'], options.activeTab === 'home'),
    navButton('Buscar', ['NAV_SEARCH'], options.activeTab === 'search'),
    navButton('↻', ['REFRESH_ADDONS'], false),
    navButton('Salir', ['LOGOUT'], false),
  ];

  if (options.maskedEmail) {
    rightItems.unshift({
      type: 'Text',
      when: '${viewport.pixelWidth >= 1000}',
      text: options.maskedEmail,
      color: THEME_COLORS.TEXT_SECONDARY,
      fontSize: '14dp',
      textAlignVertical: 'center',
      paddingRight: '8dp',
    });
  }

  return {
    type: 'Frame',
    width: '100%',
    height: '64dp',
    backgroundColor: THEME_COLORS.BG_SURFACE,
    borderBottomWidth: '1dp',
    borderColor: THEME_COLORS.BORDER_SUBTLE,
    paddingLeft: '24dp',
    paddingRight: '24dp',
    item: {
      type: 'Container',
      width: '100%',
      height: '100%',
      direction: 'row',
      alignItems: 'center',
      justifyContent: 'spaceBetween',
      items: [
        {
          type: 'Container',
          direction: 'row',
          alignItems: 'center',
          items: leftItems,
        },
        {
          type: 'Container',
          direction: 'row',
          alignItems: 'center',
          spacing: '8dp',
          items: rightItems,
        },
      ],
    },
  };
}
