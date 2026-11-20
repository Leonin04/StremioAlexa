import type { MediaType } from '../types/stremio';

export const STREMIO_API_BASE = 'https://api.strem.io/api';
export const STREMIO_API_TIMEOUT_MS = 5000;
export const ADDON_TIMEOUT_MS = 3500;
export const GLOBAL_ADDON_BUDGET_MS = 4800;

export const CACHE_TTLS = {
  ADDONS: 900,
  BOARD: 300,
  META: 600,
  STREAMS: 180,
  SUBTITLES: 300,
} as const;

export const EPISODES_PER_PAGE = 25;
export const MAX_STREAMS_DISPLAY = 20;
export const MAX_SUBTITLES_DISPLAY = 20;
export const MAX_CATALOG_ROWS = 4;
export const MAX_CATALOG_ITEMS = 12;
export const MAX_NAV_STACK = 8;

export const DEFAULT_SUBTITLE_LANG = 'spa';

export const ALLOWED_MEDIA_TYPES: readonly MediaType[] = [
  'movie',
  'series',
  'channel',
  'tv',
  'anime',
] as const;

export const THEME_COLORS = {
  BG_DEEP: '#0F0D1B',
  BG_SURFACE: '#181529',
  BG_ELEVATED: '#231F3D',
  BG_OVERLAY: '#D90F0D1B',
  BG_HUD_BAR: '#CC0F0D1B',
  ACCENT_PRIMARY: '#7B5BF5',
  ACCENT_HOVER: '#9D82FF',
  STATUS_COMPATIBLE: '#22C55E',
  STATUS_COMPATIBLE_BG: '#1A22C55E',
  STATUS_WARNING: '#F59E0B',
  STATUS_WARNING_BG: '#1AF59E0B',
  STATUS_ERROR: '#EF4444',
  STATUS_ERROR_BG: '#26EF4444',
  TEXT_PRIMARY: '#F4F3F8',
  TEXT_SECONDARY: '#A6A2C2',
  BORDER_SUBTLE: '#312C4E',
} as const;

export const APL_VERSION = '2024.2';
export const APL_MAIN_TOKEN = 'stremio-main-view';
export const APL_PLAYER_VIDEO_ID = 'stremioVideoPlayer';
