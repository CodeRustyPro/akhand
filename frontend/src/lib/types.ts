export interface LiteraryPlace {
  id: string;
  bookTitle: string;
  author: string;
  publishYear: number;
  placeName: string;
  coordinates: [number, number]; // [longitude, latitude]
  placeType: 'real' | 'fictional_based_on_real' | 'purely_fictional';
  realAnchor?: string;
  settingType: 'primary' | 'secondary' | 'mentioned';
  narrativeEra: string;
  passage: string;
  sentiment: SentimentData;
  language: string;
  genres: string[];
  region: string;
  coverUrl?: string;
  openLibraryKey?: string;
  openLibraryUrl?: string;
  goodreadsUrl?: string;
  wikidataBookId?: string;
  wikidataPlaceId?: string;
}

export interface SentimentData {
  polarity: number; // -1.0 to 1.0
  dominantEmotions: string[];
  themes: string[];
}

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
}

export interface SearchFilters {
  query: string;
  regions: string[];
  genres: string[];
  eras: string[];
  sentimentRange: [number, number];
  settingTypes: string[];
}

export type MapLayerMode = 'scatter' | 'heatmap' | 'arcs';

export interface AuthorConnection {
  source: [number, number];
  target: [number, number];
  sourceCity: string;
  targetCity: string;
  author: string;
  bookCount: number;
}
