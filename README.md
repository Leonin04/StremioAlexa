# StremioAlexa — Port personal de Stremio para Echo Show

Skill privada de Alexa (idioma **`es-ES`**, nombre de invocación **`"stremio"`**) escrita en **TypeScript / Node.js 20** con **Alexa Presentation Language (APL 2024.2)** y desplegable mediante **AWS SAM + ASK CLI v2**.

Permite navegar tu cuenta real de **Stremio** y reproducir contenido en dispositivos **Echo Show** usando enlaces HTTPS directos de servicios **Debrid** (*Real-Debrid, TorBox, AllDebrid, Premiumize*, etc.), sin necesidad de mantener un servidor propio encendido ni transcodificador.

---

## ¿Qué hace esta skill?

Una vez vinculada con tu cuenta de Stremio, replica el flujo esencial de la app de Stremio adaptado a pantalla táctil y control por voz en Echo Show:

1. **Inicio de sesión en pantalla (`LoginScreen`):**
   - Teclado táctil (`EditText`) con campo de contraseña enmascarado (`secureInput: true`).
   - Autentica contra `https://api.strem.io/api/login` y guarda **únicamente** tu `authKey` de sesión y correo enmascarado en DynamoDB (la contraseña se descarta al instante y nunca se almacena ni se registra en logs).
2. **Inicio / Board (`HomeScreen`):**
   - Fila **Continuar viendo** con barra de progreso sincronizada con tu cuenta de Stremio.
   - Filas horizontales con los catálogos destacados de tus addons instalados (`addonCollectionGet`).
3. **Buscador (`SearchScreen`):**
   - Búsqueda simultánea en los catálogos de tus addons, tanto **por voz** (*"Alexa, busca One Piece"*) como con **teclado táctil en pantalla**.
4. **Ficha de detalle (`DetailScreen`):**
   - Póster, sinopsis, año, valoración, selector horizontal de temporadas y lista de episodios paginada (**25 episodios por página**, pensado para series largas como *One Piece*).
   - Detecta automáticamente el último episodio en progreso para llevarte directo a su temporada/página.
5. **Selector de streams (`StreamsScreen`):**
   - Consulta en paralelo tus addons de streams y **oculta automáticamente torrents P2P (`infoHash`) sin URL HTTPS** (incompatibles con Echo Show).
   - Clasifica y ordena las fuentes por compatibilidad mediante metadatos:
     - `✓ Compatible` arriba (MP4 / H.264 / AAC / ≤1080p).
     - `⚠ Puede no reproducirse` debajo con el motivo detectado (MKV, HEVC/x265, 4K, AC3/DTS, HLS).
6. **Reproductor APL 2024.2 (`PlayerScreen`):**
   - `Video` nativo a pantalla completa con `screenLock: true` para evitar que el Echo Show apague o cierre la pantalla en películas o episodios largos.
   - **Subtítulos `.srt` nativos** (`textTrack`): recuerda tu último idioma elegido en DynamoDB (por defecto Español) y permite cambiarlos o desactivarlos desde un panel lateral dentro del reproductor o por voz.
   - **Cambio de stream/idioma en caliente:** panel lateral *Streams / Audio* dentro del reproductor para saltar a otra fuente (p. ej. de japonés a castellano) conservando el segundo actual.
   - **Progreso y siguiente episodio:** sincroniza tu avance a DynamoDB y Stremio (`datastorePut`) al pausar, salir o finalizar, e incluye botón **Siguiente ep.** en el reproductor y al terminar el capítulo.

---

## Cómo funciona (Arquitectura)

```text
┌─────────────────────┐        HTTPS (Alexa / APL 2024.2)        ┌──────────────────────────┐
│   Echo Show 8/10    │ ◄──────────────────────────────────────► │    AWS Lambda (Node 20)  │
│  UI + Video Player  │                                          │  ASK SDK v2 + TypeScript │
└──────────┬──────────┘                                          └──────┬───────────┬───────┘
           │                                                            │           │
           │ Stream HTTPS directo                                       │           ▼
           │ (desde tu IP doméstica;                                    │   ┌───────────────┐
           │  Lambda NUNCA toca las URLs Debrid)                        │   │ AWS DynamoDB  │
           ▼                                                            │   │ Perfil + TTL  │
┌─────────────────────┐                                                 │   └───────────────┘
│  CDN / Debrid       │                                                 ▼
│  (Real-Debrid, etc) │                             ┌───────────────────────────────────────┐
└─────────────────────┘                             │ api.strem.io + Addons HTTPS (catalog, │
                                                    │ meta, stream, subtitles)              │
                                                    └───────────────────────────────────────┘
```

### Decisiones clave de diseño
- **Sin llamadas de Lambda a enlaces Debrid:** AWS Lambda nunca hace `fetch` ni `HEAD` sobre las URLs de vídeo devueltas por los addons. El Echo Show descarga el vídeo directamente desde tu IP residencial para evitar bloqueos por IP múltiple o IPs de nube en servicios Debrid.
- **Límite de respuesta de Alexa (~8 s):** Las consultas a addons se ejecutan en paralelo (`Promise.allSettled`) con timeout individual de `3.5 s`, presupuesto global de `4.8 s` y caché con TTL en DynamoDB.
- **Estilo visual:** Tema oscuro oficial de Stremio (`#0F0D1B` de fondo, tarjetas `#181529`, acentos morados `#7B5BF5`), optimizado para Echo Show 8/10 (`1280×800`) y adaptable a Echo Show 5 y 15/21.

---

## Estructura del proyecto

```text
StremioAlexa/
├── template.yaml                      # Infraestructura AWS SAM (Lambda ARM64 + DynamoDB + IAM)
├── samconfig.toml                     # Parámetros por defecto para sam build / sam deploy (eu-west-1)
├── ask-resources.json                 # Configuración de despliegue ASK CLI v2
├── skill-package/
│   ├── skill.json                     # Manifiesto de la skill (es-ES, interfaz APL y viewports)
│   └── interactionModels/custom/
│       └── es-ES.json                 # Modelo de voz en español de España (invocación "stremio")
└── lambda/
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.typecheck.json
    ├── vitest.config.ts
    └── src/
        ├── index.ts                   # Entry point de AWS Lambda (SkillBuilders.custom)
        ├── config/constants.ts        # Timeouts, TTLs, paginación y paleta Stremio
        ├── types/                     # Tipos de Stremio y sesión
        ├── security/                  # Validación anti-SSRF, allow-lists y logger con redacción
        ├── services/                  # Cliente api.strem.io, addons, streamAnalyzer, subtítulos, DynamoDB v3
        ├── apl/                       # Pantallas APL 2024.2 y tema visual
        ├── handlers/                  # Handlers de lanzamiento, eventos táctiles APL e intents de voz
        └── __tests__/                 # Suite de tests unitarios e integración (Vitest)
```

---

## Requisitos previos y cuentas necesarias

### 1. Cuentas necesarias
1. **Cuenta de Amazon Developer (gratis, sin tarjeta):**
   - Imprescindible para ejecutar la skill en modo desarrollo en tus propios dispositivos Echo Show.
   - Regístrate en [Amazon Developer Console](https://developer.amazon.com/alexa/console/ask) **usando el mismo correo de Amazon que tienes vinculado en tu Echo Show**.
2. **Cuenta de AWS (capa gratuita):**
   - Necesaria para alojar la función AWS Lambda y la tabla de DynamoDB (para uso personal entra holgadamente en la capa gratuita permanente de AWS).
   - Crea un usuario IAM con permisos de despliegue (CloudFormation, Lambda, DynamoDB, IAM y S3) y genera un par *Access Key ID* / *Secret Access Key*.

### 2. Herramientas en tu equipo
- **Node.js 20+** y `npm`
- **AWS CLI v2** (`aws --version`)
- **AWS SAM CLI** (`sam --version`)
- **ASK CLI v2** (`npm install -g ask-cli` → `ask --version`)

---

## Configuración y despliegue paso a paso

### Paso 1: Instalar dependencias, compilar y pasar los tests

```bash
cd lambda
npm install
npm run typecheck
npm run build
npm test
cd ..
```

> **Nota para WSL2 (Windows):** Si `npm install` o `sam build` se queda lento o colgado por resolución IPv6/caché en WSL2, ejecuta:
> `NODE_OPTIONS=--dns-result-order=ipv4first npm install --no-audit --no-fund`

### Paso 2: Autenticar AWS CLI y ASK CLI

```bash
# 1. Configura tu Access Key, Secret Key y región recomendada para es-ES (eu-west-1)
aws configure

# 2. Inicia sesión en tu cuenta de Amazon Developer (usa --no-browser si estás en WSL/SSH)
ask configure
```

### Paso 3: Desplegar Lambda y DynamoDB con AWS SAM

```bash
NODE_OPTIONS=--dns-result-order=ipv4first sam build
sam deploy --guided
```

Durante `--guided`:
- Región recomendada: **`eu-west-1`** (Irlanda, menor latencia para habilidades en `es-ES`).
- Parámetro **`AlexaSkillId`**: déjalo vacío en este primer despliegue (se rellenará en el Paso 5).
- Al terminar, copia el valor de **`LambdaFunctionArn`** que aparece en la sección `Outputs`.

### Paso 4: Configurar el endpoint y subir la skill a Alexa

1. Abre [`skill-package/skill.json`](skill-package/skill.json) y sustituye el ARN de ejemplo en `manifest.apis.custom.endpoint.uri` por tu **`LambdaFunctionArn`** real.
2. Despliega la skill en modo desarrollo en tu cuenta de Amazon Developer:

```bash
ask deploy
```

3. Anota el **`Skill ID`** (`amzn1.ask.skill....`) generado en `.ask/ask-states.json`.

### Paso 5: (Recomendado) Bloquear la Lambda solo a tu Skill ID

Ejecuta de nuevo `sam deploy` indicando tu `AlexaSkillId` para que AWS Lambda rechace invocaciones ajenas a tu skill privada:

```bash
sam deploy --parameter-overrides AlexaSkillId=amzn1.ask.skill.TU_SKILL_ID
```

### Paso 6: Activar subtítulos en tu Echo Show (imprescindible)

El componente `Video` de APL solo renderiza las pistas `.srt` (`textTrack`) si los subtítulos están activados en el sistema del Echo Show:

1. En tu Echo Show di **"Ve a configuración"** (o desliza desde arriba → **Configuración**).
2. Ve a **Accesibilidad** → **Subtítulos** (*Closed Captioning*).
3. Activa **Subtítulos**.

---

## Uso y comandos de voz (`es-ES`)

- **Abrir:** *"Alexa, abre stremio"*
- **Buscar:** *"busca One Piece"*, *"pon Inception"* o usa el teclado táctil en **Buscar**.
- **Series y episodios:** *"temporada 2"*, *"pon el episodio 45"*, *"temporada 1 capítulo 12"*, *"siguiente episodio"*.
- **Control del reproductor:** *"pausa"*, *"continúa"*, *"adelanta 30 segundos"*, *"retrocede 2 minutos"*, *"empieza desde el principio"*.
- **Subtítulos y fuentes:** *"pon subtítulos en español"*, *"pon subtítulos en inglés"*, *"quita los subtítulos"*, *"cambia de stream"*.
- **Navegación y sesión:** *"ve al inicio"*, *"atrás"*, *"actualiza addons"*, *"cerrar sesión"*.

---

## Seguridad y buenas prácticas para GitHub

### Medidas incluidas en el código
- **Cero secretos en el repositorio:** No hay claves, tokens ni credenciales hardcodeadas.
- **Gestión segura de credenciales de Stremio:** La contraseña escrita en el `EditText` del Echo Show solo se envía por TLS a `api.strem.io` para obtener el `authKey` y se descarta inmediatamente; nunca se guarda en DynamoDB, atributos de sesión ni `datasources` de APL.
- **Redacción automática de logs:** Todo el logging pasa por [`lambda/src/security/logger.ts`](lambda/src/security/logger.ts), que redacta recursivamente cualquier clave `password`, `authKey`, `token`, `secret`, `authorization`, `cookie` o `email`.
- **Protección SSRF y validación de entradas:** [`lambda/src/security/validation.ts`](lambda/src/security/validation.ts) exige `https://` en URLs de addons y subtítulos, bloquea direcciones privadas/loopback/link-local/metadata (`127.0.0.0/8`, `10.0.0.0/8`, `169.254.169.254`, `::1`, etc.) y valida tipos/IDs por allow-list.
- **Aislamiento y mínimo privilegio en AWS:** Los registros de DynamoDB están cifrados en reposo (SSE) y particionados por `USER#<alexaUserId>`; el rol IAM de Lambda solo tiene acceso `GetItem`/`PutItem`/`UpdateItem`/`DeleteItem` sobre su propia tabla.

### Si haces un fork o despliegas tu copia
- El `.gitignore` ya excluye `.aws-sam/`, `.ask/`, `.aws/`, `.env*`, `node_modules/`, `dist/`, `*.pem`, `*.key` y `credentials`.
- Antes de hacer `git push` tras desplegar, **no subas** tu ARN real en `skill-package/skill.json` ni el archivo `.ask/ask-states.json` si quieres mantener tu AWS Account ID y Skill ID en privado.

---

## Limitaciones conocidas (sin servidor de transcodificación)

- **Torrents P2P (`infoHash`) sin Debrid:** Se ocultan automáticamente porque Echo Show no tiene cliente BitTorrent; necesitas configurar un proveedor Debrid en tus addons de Stremio.
- **Formatos y códecs:** Echo Show reproduce con fiabilidad **MP4 (H.264 + AAC)** hasta `1080p`. Contenedores o códecs como **MKV, HEVC/H.265, 4K, DTS o AC3** se muestran con aviso (`⚠ Puede no reproducirse`) y su reproducción depende del firmware de cada modelo.
- **Pistas de audio internas:** El componente `Video` de APL no permite conmutar pistas de audio incrustadas dentro de un mismo archivo dual-audio; usa el botón **Streams / Audio** dentro del reproductor para cambiar a otro stream en el idioma deseado manteniendo el segundo actual.
