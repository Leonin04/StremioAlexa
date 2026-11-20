import type { MediaType } from './stremio';

export type ScreenName =
  | 'login'
  | 'home'
  | 'search'
  | 'detail'
  | 'streams'
  | 'player';

export interface NavStackEntry {
  screen: ScreenName;
  mediaType?: MediaType;
  mediaId?: string;
  videoId?: string;
  season?: number;
  episodePage?: number;
  query?: string;
}

export interface ActiveMediaSummary {
  type: MediaType;
  id: string;
  name: string;
  poster?: string;
}

/**
 * Persistent user profile stored in DynamoDB under PK=USER#<userId>, SK=PROFILE.
 * Passwords are NEVER persisted here or anywhere else.
 */
export interface UserProfile {
  authKey?: string;
  maskedEmail?: string;
  subtitleLang: string;
  updatedAt: string;
}

/**
 * Lightweight session attributes persisted across turns in the Alexa session.
 * Never store authKey, passwords, or large stream/catalog arrays here.
 */
export interface SessionState {
  currentScreen?: ScreenName;
  navStack?: NavStackEntry[];
  lastQuery?: string;
  activeMedia?: ActiveMediaSummary;
  activeVideoId?: string;
  activeVideoTitle?: string;
  activeSeason?: number;
  episodePage?: number;
  activeStreamIndex?: number;
  activeSubtitleId?: string;
  playbackOffsetMs?: number;
  playbackDurationMs?: number;
}
