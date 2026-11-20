import { THEME_COLORS } from '../../config/constants';
import { createBaseAplDocument } from '../theme';

export interface LoginScreenData {
  errorMessage?: string;
}

export function buildLoginScreen(data: LoginScreenData = {}): {
  document: Record<string, unknown>;
  datasources: Record<string, unknown>;
} {
  const document = createBaseAplDocument([
    {
      type: 'Container',
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: '32dp',
      paddingRight: '32dp',
      items: [
        {
          type: 'Frame',
          width: '620dp',
          maxWidth: '92vw',
          backgroundColor: THEME_COLORS.BG_SURFACE,
          borderRadius: '18dp',
          borderWidth: '1dp',
          borderColor: THEME_COLORS.BORDER_SUBTLE,
          paddingTop: '28dp',
          paddingBottom: '28dp',
          paddingLeft: '32dp',
          paddingRight: '32dp',
          item: {
            type: 'Container',
            width: '100%',
            items: [
              {
                type: 'Container',
                direction: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingBottom: '8dp',
                items: [
                  {
                    type: 'Frame',
                    width: '40dp',
                    height: '40dp',
                    borderRadius: '10dp',
                    backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
                    item: {
                      type: 'Text',
                      text: '▶',
                      color: THEME_COLORS.TEXT_PRIMARY,
                      fontSize: '20dp',
                      textAlign: 'center',
                      textAlignVertical: 'center',
                      width: '100%',
                      height: '100%',
                    },
                  },
                  {
                    type: 'Text',
                    text: 'Stremio para Echo Show',
                    color: THEME_COLORS.TEXT_PRIMARY,
                    fontSize: '28dp',
                    fontWeight: '700',
                    paddingLeft: '12dp',
                  },
                ],
              },
              {
                type: 'Text',
                text: 'Inicia sesión con tu cuenta de Stremio. Solo guardaremos tu token de sesión.',
                color: THEME_COLORS.TEXT_SECONDARY,
                fontSize: '16dp',
                textAlign: 'center',
                paddingBottom: '16dp',
              },
              {
                type: 'Frame',
                when: '${payload.login.hasError}',
                backgroundColor: THEME_COLORS.STATUS_ERROR_BG,
                borderRadius: '10dp',
                borderWidth: '1dp',
                borderColor: THEME_COLORS.STATUS_ERROR,
                padding: '10dp',
                marginBottom: '12dp',
                item: {
                  type: 'Text',
                  text: '${payload.login.errorMessage}',
                  color: THEME_COLORS.TEXT_PRIMARY,
                  fontSize: '15dp',
                  textAlign: 'center',
                },
              },
              {
                type: 'Frame',
                backgroundColor: THEME_COLORS.BG_ELEVATED,
                borderRadius: '10dp',
                borderWidth: '1dp',
                borderColor: THEME_COLORS.BORDER_SUBTLE,
                paddingLeft: '14dp',
                paddingRight: '14dp',
                marginBottom: '12dp',
                item: {
                  type: 'EditText',
                  id: 'emailInput',
                  width: '100%',
                  height: '48dp',
                  keyboardType: 'emailAddress',
                  hint: 'Correo electrónico de Stremio',
                  hintColor: THEME_COLORS.TEXT_SECONDARY,
                  color: THEME_COLORS.TEXT_PRIMARY,
                  fontSize: '18dp',
                  submitKeyType: 'next',
                },
              },
              {
                type: 'Frame',
                backgroundColor: THEME_COLORS.BG_ELEVATED,
                borderRadius: '10dp',
                borderWidth: '1dp',
                borderColor: THEME_COLORS.BORDER_SUBTLE,
                paddingLeft: '14dp',
                paddingRight: '14dp',
                marginBottom: '18dp',
                item: {
                  type: 'EditText',
                  id: 'passwordInput',
                  width: '100%',
                  height: '48dp',
                  keyboardType: 'normal',
                  secureInput: true,
                  hint: 'Contraseña',
                  hintColor: THEME_COLORS.TEXT_SECONDARY,
                  color: THEME_COLORS.TEXT_PRIMARY,
                  fontSize: '18dp',
                  submitKeyType: 'done',
                  onSubmit: [
                    {
                      type: 'SendEvent',
                      arguments: ['LOGIN_SUBMIT'],
                      components: ['emailInput', 'passwordInput'],
                    },
                  ],
                },
              },
              {
                type: 'TouchWrapper',
                width: '100%',
                onPress: [
                  {
                    type: 'SendEvent',
                    arguments: ['LOGIN_SUBMIT'],
                    components: ['emailInput', 'passwordInput'],
                  },
                ],
                item: {
                  type: 'Frame',
                  width: '100%',
                  height: '52dp',
                  borderRadius: '12dp',
                  backgroundColor: THEME_COLORS.ACCENT_PRIMARY,
                  item: {
                    type: 'Text',
                    text: 'Iniciar sesión en Stremio',
                    color: THEME_COLORS.TEXT_PRIMARY,
                    fontSize: '20dp',
                    fontWeight: '700',
                    textAlign: 'center',
                    textAlignVertical: 'center',
                    width: '100%',
                    height: '100%',
                  },
                },
              },
            ],
          },
        },
      ],
    },
  ]);

  const datasources = {
    login: {
      hasError: Boolean(data.errorMessage),
      errorMessage: data.errorMessage ?? '',
    },
  };

  return { document, datasources };
}
