import type { MapViewState } from '@/lib/types';

export type LngLat = [number, number];

const MIN_COORDINATE_SPAN = 0.02;
const PREVIEW_SIZE_PX = 60;

export const DEFAULT_MAP_VIEW: MapViewState = {
  longitude: 78,
  latitude: 22,
  zoom: 4.2,
  pitch: 45,
  bearing: -8,
};

export const DEFAULT_TOUR_CENTER: LngLat = [72.8777, 19.076];
export const DEFAULT_TOUR_ZOOM = 12;

export interface CoordinateBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export function getCoordinateBounds(
  coordinates: LngLat[],
  paddingRatio = 0.15
): CoordinateBounds {
  if (coordinates.length === 0) {
    return {
      minLng: DEFAULT_TOUR_CENTER[0] - 0.15,
      maxLng: DEFAULT_TOUR_CENTER[0] + 0.15,
      minLat: DEFAULT_TOUR_CENTER[1] - 0.1,
      maxLat: DEFAULT_TOUR_CENTER[1] + 0.1,
    };
  }

  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const lngSpan = Math.max(maxLng - minLng, MIN_COORDINATE_SPAN);
  const latSpan = Math.max(maxLat - minLat, MIN_COORDINATE_SPAN);
  const lngPadding = lngSpan * paddingRatio;
  const latPadding = latSpan * paddingRatio;

  return {
    minLng: minLng - lngPadding,
    maxLng: maxLng + lngPadding,
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
  };
}

export function projectCoordinateToPreview(
  coordinate: LngLat,
  bounds: CoordinateBounds,
  sizePx = PREVIEW_SIZE_PX
): LngLat {
  const lngRange = Math.max(bounds.maxLng - bounds.minLng, MIN_COORDINATE_SPAN);
  const latRange = Math.max(bounds.maxLat - bounds.minLat, MIN_COORDINATE_SPAN);

  const x = ((coordinate[0] - bounds.minLng) / lngRange) * sizePx - sizePx / 2;
  const y = ((bounds.maxLat - coordinate[1]) / latRange) * sizePx - sizePx / 2;

  return [x, y];
}

export function buildTourPreviewProjector(
  stops: Array<{ coordinates: LngLat }>,
  sizePx = PREVIEW_SIZE_PX
): (coordinate: LngLat) => LngLat {
  const bounds = getCoordinateBounds(stops.map((stop) => stop.coordinates));
  return (coordinate: LngLat) => projectCoordinateToPreview(coordinate, bounds, sizePx);
}
