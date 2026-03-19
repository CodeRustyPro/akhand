import type { LiteraryPlace } from './types';
import { literaryPlaces as fallbackData } from './data';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const BASE_PATH = '/akhand';

function encodeDetailId(id: string): string {
  // Match backend base64url-safe filename encoding for static detail files.
  const bytes = new TextEncoder().encode(id);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

interface PlacesResponse {
  total: number;
  offset: number;
  limit: number;
  places: unknown[];
}

/** Slim index entry from prebuild_index.py */
export interface SlimPlace {
  id: string;
  bookTitle: string;
  author: string;
  placeName: string;
  coordinates: [number, number];
  region: string;
  sp: number; // sentiment polarity
  qt?: string; // quality tier
  pg?: string; // place granularity
  publishYear: number;
  coverUrl: string;
  language: string;
  g?: string[]; // top genres
  t?: string[]; // top themes
  qualityTier?: string;
  quality_tier?: string;
  placeGranularity?: string;
  place_granularity?: string;
}

function normalizePlaceGranularity(raw: unknown): 'city' | 'region' {
  const v = String(raw || '').toLowerCase();
  return v === 'region' ? 'region' : 'city';
}

function normalizeQualityTier(place: {
  qualityTier?: unknown;
  quality_tier?: unknown;
  sentiment?: { themes?: unknown[] };
  themes?: unknown[];
  passage?: unknown;
  placeGranularity?: unknown;
  place_granularity?: unknown;
}): 'gold' | 'silver' | 'stub' {
  const raw = String(place.qualityTier || place.quality_tier || '').toLowerCase();
  if (raw === 'gold' || raw === 'silver' || raw === 'stub') {
    return raw;
  }
  const themes = Array.isArray(place.sentiment?.themes)
    ? place.sentiment?.themes
    : Array.isArray(place.themes)
      ? place.themes
      : [];
  const hasThemes = themes.length > 0;
  const hasPassage = Boolean(String(place.passage || '').trim());
  const granularity = normalizePlaceGranularity(place.placeGranularity || place.place_granularity);
  if (hasPassage && hasThemes && granularity !== 'region') return 'gold';
  if (hasPassage || hasThemes) return 'silver';
  return 'stub';
}

function normalizeApiPlace(raw: unknown): LiteraryPlace {
  const p = (raw || {}) as Record<string, unknown>;
  const sentimentRaw = (p.sentiment || {}) as Record<string, unknown>;
  const themes = Array.isArray(sentimentRaw.themes)
    ? (sentimentRaw.themes as string[])
    : Array.isArray(p.themes)
      ? (p.themes as string[])
      : [];
  const dominantEmotions = Array.isArray(sentimentRaw.dominantEmotions)
    ? (sentimentRaw.dominantEmotions as string[])
    : Array.isArray(sentimentRaw.dominant_emotions)
      ? (sentimentRaw.dominant_emotions as string[])
      : Array.isArray(p.dominant_emotions)
        ? (p.dominant_emotions as string[])
        : [];
  const granularity = normalizePlaceGranularity(p.placeGranularity || p.place_granularity);

  return {
    id: String(p.id || ''),
    bookTitle: String(p.bookTitle || p.book_title || ''),
    author: String(p.author || ''),
    publishYear: Number(p.publishYear || p.publish_year || 0),
    placeName: String(p.placeName || p.place_name || ''),
    coordinates: (Array.isArray(p.coordinates) && p.coordinates.length === 2
      ? [Number(p.coordinates[0]), Number(p.coordinates[1])]
      : [0, 0]) as [number, number],
    placeType: String(p.placeType || p.place_type || 'real') as LiteraryPlace['placeType'],
    realAnchor: (p.realAnchor || p.real_anchor || undefined) as string | undefined,
    settingType: String(p.settingType || p.setting_type || 'primary') as LiteraryPlace['settingType'],
    narrativeEra: String(p.narrativeEra || p.narrative_era || ''),
    passage: String(p.passage || ''),
    sentiment: {
      polarity: Number(sentimentRaw.polarity || p.sentiment_polarity || 0),
      dominantEmotions,
      themes,
    },
    qualityTier: normalizeQualityTier({
      qualityTier: p.qualityTier,
      quality_tier: p.quality_tier,
      sentiment: { themes },
      themes,
      passage: p.passage,
      placeGranularity: p.placeGranularity,
      place_granularity: p.place_granularity,
    }),
    placeGranularity: granularity,
    passageType: String(p.passageType || p.passage_type || 'none') as LiteraryPlace['passageType'],
    passageSource: String(p.passageSource || p.passage_source || 'unknown') as LiteraryPlace['passageSource'],
    enrichmentMethod: String(p.enrichmentMethod || p.enrichment_method || 'none') as LiteraryPlace['enrichmentMethod'],
    language: String(p.language || 'English'),
    genres: Array.isArray(p.genres) ? (p.genres as string[]) : [],
    region: String(p.region || ''),
    coverUrl: (p.coverUrl || p.cover_url || undefined) as string | undefined,
    openLibraryKey: (p.openLibraryKey || p.open_library_key || undefined) as string | undefined,
    openLibraryUrl: (p.openLibraryUrl || p.open_library_url || undefined) as string | undefined,
    goodreadsUrl: (p.goodreadsUrl || p.goodreads_url || undefined) as string | undefined,
    wikidataBookId: (p.wikidataBookId || p.wikidata_book_id || undefined) as string | undefined,
    wikidataPlaceId: (p.wikidataPlaceId || p.wikidata_place_id || undefined) as string | undefined,
  };
}

/** Convert a slim index entry to a minimal LiteraryPlace for map rendering. */
export function slimToLiteraryPlace(s: SlimPlace): LiteraryPlace {
  const qt = s.qt || s.qualityTier || s.quality_tier;
  const pg = s.pg || s.placeGranularity || s.place_granularity;
  return {
    id: s.id,
    bookTitle: s.bookTitle,
    author: s.author,
    publishYear: s.publishYear,
    placeName: s.placeName,
    coordinates: s.coordinates,
    placeType: 'real',
    settingType: 'primary',
    narrativeEra: '',
    passage: '',
    sentiment: { polarity: s.sp, dominantEmotions: [], themes: s.t || [] },
    qualityTier: normalizeQualityTier({ qualityTier: qt, sentiment: { themes: s.t || [] }, passage: '', placeGranularity: pg }),
    placeGranularity: normalizePlaceGranularity(pg),
    language: s.language,
    genres: s.g || [],
    region: s.region,
    coverUrl: s.coverUrl || undefined,
  };
}

/**
 * Fetch the slim static index generated by prebuild_index.py.
 * Returns null if the file doesn't exist (dev mode without prebuild).
 */
export async function fetchSlimIndex(): Promise<SlimPlace[] | null> {
  try {
    const res = await fetch(`${BASE_PATH}/data/index.json`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data: SlimPlace[] = await res.json();
    return data && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch full detail for a single place (loaded on click).
 * Falls back to finding the place in allPlaces if the static file doesn't exist.
 */
export async function fetchPlaceDetail(
  id: string,
  allPlaces?: LiteraryPlace[],
): Promise<LiteraryPlace | null> {
  const base64Id = encodeDetailId(id);
  try {
    const res = await fetch(`${BASE_PATH}/data/details/${base64Id}.json`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fall through
  }

  // Backward compatibility for percent-encoded filenames.
  try {
    const encodedId = encodeURIComponent(id).replace(/[!'()*]/g, (ch) =>
      `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    const encodedRes = await fetch(`${BASE_PATH}/data/details/${encodedId}.json`, {
      signal: AbortSignal.timeout(3000),
    });
    if (encodedRes.ok) {
      return await encodedRes.json();
    }
  } catch {
    // fall through
  }

  // Backward compatibility for existing prebuilds that used raw IDs as filenames.
  try {
    const legacyRes = await fetch(`${BASE_PATH}/data/details/${id}.json`, {
      signal: AbortSignal.timeout(3000),
    });
    if (legacyRes.ok) {
      return await legacyRes.json();
    }
  } catch {
    // fall through
  }

  // Try API endpoint
  try {
    const res = await fetch(`${API_BASE}/api/places/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fall through
  }

  // Local fallback
  if (allPlaces) {
    return allPlaces.find((p) => p.id === id) || null;
  }

  return null;
}

export async function fetchLiteraryPlaces(params?: {
  q?: string;
  region?: string;
  city?: string;
  author?: string;
  genre?: string;
  limit?: number;
}): Promise<LiteraryPlace[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set('q', params.q);
    if (params?.region) searchParams.set('region', params.region);
    if (params?.city) searchParams.set('city', params.city);
    if (params?.author) searchParams.set('author', params.author);
    if (params?.genre) searchParams.set('genre', params.genre);
    if (params?.limit) searchParams.set('limit', String(params.limit));

    const url = `${API_BASE}/api/places?${searchParams}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data: PlacesResponse = await res.json();
    if (data.places && data.places.length > 0) {
      return data.places.map(normalizeApiPlace);
    }

    return fallbackData;
  } catch {
    return fallbackData;
  }
}

export function getApiHealthUrl(): string {
  return `${API_BASE}/health`;
}
