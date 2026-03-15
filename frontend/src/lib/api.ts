import type { LiteraryPlace } from './types';
import { literaryPlaces as fallbackData } from './data';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface PlacesResponse {
  total: number;
  offset: number;
  limit: number;
  places: LiteraryPlace[];
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
      return data.places;
    }

    return fallbackData;
  } catch {
    return fallbackData;
  }
}

export function getApiHealthUrl(): string {
  return `${API_BASE}/health`;
}
