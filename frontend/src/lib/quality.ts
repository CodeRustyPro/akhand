import type { LiteraryPlace, QualityTier } from './types';

function hasText(value: unknown): boolean {
  return Boolean(String(value || '').trim());
}

export function deriveQualityTier(place: Partial<LiteraryPlace>): QualityTier {
  const raw = String(place.qualityTier || '').toLowerCase();
  if (raw === 'gold' || raw === 'silver' || raw === 'stub') {
    return raw;
  }

  const themes = place.sentiment?.themes || [];
  const hasThemes = themes.length > 0;
  const hasPassage = hasText(place.passage);
  const granularity = (place.placeGranularity || 'city') as 'city' | 'region';

  if (hasPassage && hasThemes && granularity !== 'region') return 'gold';
  if (hasPassage || hasThemes) return 'silver';
  return 'stub';
}

export function normalizePlaceMetadata(place: LiteraryPlace): LiteraryPlace {
  const placeGranularity = (place.placeGranularity || 'city') as 'city' | 'region';
  return {
    ...place,
    placeGranularity,
    qualityTier: deriveQualityTier({ ...place, placeGranularity }),
  };
}

export function normalizePlacesMetadata(places: LiteraryPlace[]): LiteraryPlace[] {
  return places.map(normalizePlaceMetadata);
}
