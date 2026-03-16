import type { LiteraryPlace } from './types';

export interface CityDnaAxis {
  label: string;
  value: number; // 0-1 normalized
  count: number; // raw count
}

export interface CityDna {
  city: string;
  axes: CityDnaAxis[];
  totalBooks: number;
  totalThemes: number;
}

function cleanThemeName(raw: string): string {
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function computeCityDna(
  city: string,
  allPlaces: LiteraryPlace[],
  maxAxes = 8
): CityDna | null {
  const cityPlaces = allPlaces.filter((p) => p.placeName === city);
  if (cityPlaces.length < 3) return null;

  const themeCounts = new Map<string, number>();
  cityPlaces.forEach((p) => {
    p.sentiment.themes.forEach((t) => {
      themeCounts.set(t, (themeCounts.get(t) || 0) + 1);
    });
  });

  if (themeCounts.size < 3) return null;

  const sorted = [...themeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxAxes);

  const maxCount = sorted[0][1];

  const axes: CityDnaAxis[] = sorted.map(([theme, count]) => ({
    label: cleanThemeName(theme),
    value: count / maxCount,
    count,
  }));

  return {
    city,
    axes,
    totalBooks: cityPlaces.length,
    totalThemes: themeCounts.size,
  };
}
