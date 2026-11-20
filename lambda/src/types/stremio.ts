export type MediaType = 'movie' | 'series' | 'channel' | 'tv' | 'anime';

export interface StremioLoginResult {
  authKey: string;
  user: {
    _id?: string;
    email?: string;
    fullname?: string;
  };
}

export interface AddonExtraDescriptor {
  name: string;
  isRequired?: boolean;
  options?: string[];
  optionsLimit?: number;
}

export interface AddonCatalogDescriptor {
  type: string;
  id: string;
  name?: string;
  extra?: AddonExtraDescriptor[];
  extraSupported?: string[];
  extraRequired?: string[];
}

export type AddonResourceDescriptor =
  | string
  | {
      name: string;
      types?: string[];
      idPrefixes?: string[];
    };

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description?: string;
  logo?: string;
  types?: string[];
  idPrefixes?: string[];
  resources?: AddonResourceDescriptor[];
  catalogs?: AddonCatalogDescriptor[];
}

export interface AddonDescriptor {
  transportUrl: string;
  transportName?: string;
  manifest: AddonManifest;
  flags?: {
    official?: boolean;
    protected?: boolean;
  };
}

export interface MetaPreview {
  id: string;
  type: MediaType;
  name: string;
  poster?: string;
  background?: string;
  releaseInfo?: string;
  imdbRating?: string;
  description?: string;
}

export interface MetaVideoEpisode {
  id: string;
  title?: string;
  name?: string;
  season?: number;
  episode?: number;
  released?: string;
  thumbnail?: string;
  overview?: string;
}

export interface MetaDetail extends MetaPreview {
  genres?: string[];
  runtime?: string;
  cast?: string[];
  director?: string[];
  videos?: MetaVideoEpisode[];
}

export interface StremioStreamBehaviorHints {
  filename?: string;
  notWebReady?: boolean;
  videoSize?: number;
  bingeGroup?: string;
}

export interface StremioStream {
  name?: string;
  title?: string;
  description?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: StremioStreamBehaviorHints;
}

export type StreamCompatibility = 'compatible' | 'warning';

export interface ClassifiedStream {
  index: number;
  addonName: string;
  url: string;
  displayTitle: string;
  metaLine: string;
  compatibility: StreamCompatibility;
  statusBadge: string;
  warningReason?: string;
  resolution?: string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  sizeLabel?: string;
  languageTags: string[];
  score: number;
  rawTitle: string;
}

export interface StremioSubtitle {
  id?: string;
  url: string;
  lang: string;
}

export interface NormalizedSubtitle {
  id: string;
  url: string;
  langCode: string;
  langLabel: string;
  providerName: string;
  isSrt: boolean;
}

export interface StremioLibraryState {
  lastWatched?: string;
  timeWatched?: number;
  timeOffset?: number;
  overallTimeWatched?: number;
  timesWatched?: number;
  flaggedWatched?: number;
  duration?: number;
  video_id?: string;
  watched?: string;
  noNotif?: boolean;
}

export interface StremioLibraryItem {
  _id: string;
  name?: string;
  type?: string;
  poster?: string;
  posterShape?: string;
  removed?: boolean;
  temp?: boolean;
  _ctime?: string;
  _mtime?: string;
  state?: StremioLibraryState;
}

export interface ContinueWatchingItem {
  id: string;
  type: MediaType;
  name: string;
  poster?: string;
  videoId: string;
  season?: number;
  episode?: number;
  timeOffsetMs: number;
  durationMs: number;
  progressPercent: number;
  lastWatched: string;
}

export interface CatalogRow {
  id: string;
  title: string;
  addonName: string;
  type: MediaType;
  items: MetaPreview[];
}
