'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import MapView, {
  NavigationControl,
  type MapRef,
  type ViewStateChangeEvent,
} from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, ArcLayer, TextLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type {
  LiteraryPlace,
  MapViewState,
  MapLayerMode,
  AuthorConnection,
} from '@/lib/types';
import { sentimentColor } from '@/lib/data';
import { DEFAULT_MAP_VIEW } from '@/lib/geo';

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);

const BASEMAP_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

interface LiteraryMapProps {
  places: LiteraryPlace[];
  allPlaces?: LiteraryPlace[];
  selectedPlace: LiteraryPlace | null;
  onSelectPlace: (place: LiteraryPlace | null) => void;
  layerMode: MapLayerMode;
  targetViewState?: MapViewState | null;
}

interface CityCluster {
  placeName: string;
  coordinates: [number, number];
  count: number;
  authors: number;
}

interface ScatterStack {
  coordinates: [number, number];
  placeName: string;
  count: number;
  representative: LiteraryPlace;
  avgPolarity: number;
}

function tierMultiplier(place: LiteraryPlace): number {
  return place.qualityTier === 'gold' ? 1.35 : 0.9;
}

function canRenderOnMap(place: LiteraryPlace): boolean {
  if ((place.placeGranularity || 'city') === 'region') return false;
  return (place.qualityTier || 'stub') !== 'stub';
}

export default function LiteraryMap({
  places,
  allPlaces,
  selectedPlace,
  onSelectPlace,
  layerMode,
  targetViewState,
}: LiteraryMapProps) {
  const [viewState, setViewState] = useState<MapViewState>(() => ({ ...DEFAULT_MAP_VIEW }));
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    place: LiteraryPlace;
    count?: number;
  } | null>(null);
  const mapRef = useRef<MapRef>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  useEffect(() => {
    if (targetViewState && mapRef.current) {
      mapRef.current.flyTo({
        center: [targetViewState.longitude, targetViewState.latitude],
        zoom: targetViewState.zoom,
        pitch: targetViewState.pitch,
        bearing: targetViewState.bearing,
        duration: 2500,
      });
      setViewState(targetViewState);
    }
  }, [targetViewState]);

  const mapPlaces = useMemo(() => {
    const nonRegion = places.filter((p) => (p.placeGranularity || 'city') !== 'region');
    const nonStub = nonRegion.filter(canRenderOnMap);
    return nonStub.length > 0 ? nonStub : nonRegion;
  }, [places]);
  const mapAllPlaces = useMemo(() => {
    if (!allPlaces || allPlaces.length === 0) return [];
    const nonRegion = allPlaces.filter((p) => (p.placeGranularity || 'city') !== 'region');
    const nonStub = nonRegion.filter(canRenderOnMap);
    return nonStub.length > 0 ? nonStub : nonRegion;
  }, [allPlaces]);
  const goldPlaces = useMemo(() => mapPlaces.filter((p) => p.qualityTier === 'gold'), [mapPlaces]);

  const cityClusters = useMemo(() => {
    const grouped: Record<string, LiteraryPlace[]> = {};
    mapPlaces.forEach((p) => {
      const key = p.placeName;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });
    return Object.entries(grouped)
      .map(([placeName, entries]): CityCluster => ({
        placeName,
        coordinates: entries[0].coordinates,
        count: entries.length,
        authors: new Set(entries.map((e) => e.author)).size,
      }))
      .filter((c) => c.count >= 2);
  }, [mapPlaces]);

  const scatterStacks = useMemo(() => {
    const grouped = new Map<string, LiteraryPlace[]>();
    for (const place of mapPlaces) {
      const [lon, lat] = place.coordinates;
      const key = `${place.placeName}__${lon.toFixed(6)}__${lat.toFixed(6)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(place);
      } else {
        grouped.set(key, [place]);
      }
    }

    const stacks: ScatterStack[] = [];
    for (const [key, entries] of grouped) {
      const [placeName] = key.split('__');
      const representative = entries
        .slice()
        .sort((a, b) => {
          if ((a.qualityTier || 'stub') === 'gold' && (b.qualityTier || 'stub') !== 'gold') return -1;
          if ((b.qualityTier || 'stub') === 'gold' && (a.qualityTier || 'stub') !== 'gold') return 1;
          return (b.passage?.length || 0) - (a.passage?.length || 0);
        })[0];
      const avgPolarity = entries.reduce((sum, p) => sum + (p.sentiment?.polarity || 0), 0) / entries.length;
      stacks.push({
        coordinates: representative.coordinates,
        placeName,
        count: entries.length,
        representative,
        avgPolarity,
      });
    }
    return stacks;
  }, [mapPlaces]);

  const authorConnections = useMemo(() => {
    const grouped: Record<string, LiteraryPlace[]> = {};
    mapPlaces.forEach((p) => {
      if (!grouped[p.author]) grouped[p.author] = [];
      grouped[p.author].push(p);
    });

    const connections: AuthorConnection[] = [];
    Object.entries(grouped).forEach(([author, authorEntries]) => {
      const unique = authorEntries.filter(
        (p, i, arr) =>
          arr.findIndex(
            (q) =>
              q.coordinates[0] === p.coordinates[0] &&
              q.coordinates[1] === p.coordinates[1]
          ) === i
      );
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          connections.push({
            source: unique[i].coordinates,
            target: unique[j].coordinates,
            sourceCity: unique[i].placeName,
            targetCity: unique[j].placeName,
            author,
            bookCount: authorEntries.length,
          });
        }
      }
    });
    return connections;
  }, [mapPlaces]);

  const handleMove = useCallback((e: ViewStateChangeEvent) => {
    setViewState(e.viewState as MapViewState);
  }, []);

  // Determine if there's an active filter (places is a subset of allPlaces)
  const isFiltered = mapAllPlaces && mapAllPlaces.length > 0 && mapPlaces.length < mapAllPlaces.length;
  const filteredIds = useMemo(() => new Set(mapPlaces.map((p) => p.id)), [mapPlaces]);
  const bgPlaces = useMemo(
    () => (isFiltered ? mapAllPlaces.filter((p) => !filteredIds.has(p.id)) : []),
    [isFiltered, mapAllPlaces, filteredIds]
  );

  const bgScatterStacks = useMemo(() => {
    const grouped = new Map<string, LiteraryPlace[]>();
    for (const place of bgPlaces) {
      const [lon, lat] = place.coordinates;
      const key = `${place.placeName}__${lon.toFixed(6)}__${lat.toFixed(6)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(place);
      } else {
        grouped.set(key, [place]);
      }
    }

    const stacks: ScatterStack[] = [];
    for (const [key, entries] of grouped) {
      const [placeName] = key.split('__');
      const representative = entries[0];
      const avgPolarity = entries.reduce((sum, p) => sum + (p.sentiment?.polarity || 0), 0) / entries.length;
      stacks.push({
        coordinates: representative.coordinates,
        placeName,
        count: entries.length,
        representative,
        avgPolarity,
      });
    }
    return stacks;
  }, [bgPlaces]);

  const layers = useMemo(() => {
    const result: (ScatterplotLayer | HeatmapLayer | ArcLayer | TextLayer)[] = [];

    if (layerMode === 'scatter') {
      // Dim base layer for unmatched places when filtering
      if (isFiltered && bgScatterStacks.length > 0) {
        result.push(
          new ScatterplotLayer({
            id: 'scatter-bg-dim',
            data: bgScatterStacks,
            getPosition: (d: ScatterStack) => d.coordinates,
            getFillColor: [100, 90, 80, 35] as [number, number, number, number],
            getRadius: (d: ScatterStack) => 3200 + Math.sqrt(d.count) * 2200,
            radiusMinPixels: 3,
            radiusMaxPixels: 12,
            pickable: true,
            onClick: ({ object }: { object?: ScatterStack }) => {
              if (object) onSelectPlace(object.representative);
            },
            onHover: ({
              object,
              x,
              y,
            }: {
              object?: ScatterStack;
              x: number;
              y: number;
            }) => {
              setHoverInfo(
                object
                  ? {
                    x,
                    y,
                    place: {
                      ...object.representative,
                      bookTitle: `${object.count} books in ${object.placeName}`,
                      author: `${new Set(bgPlaces.filter((p) => p.placeName === object.placeName).map((p) => p.author)).size} authors`,
                    },
                    count: object.count,
                  }
                  : null
              );
            },
          } as ConstructorParameters<typeof ScatterplotLayer>[0])
        );
      }

      result.push(
        new ScatterplotLayer({
          id: 'literary-scatter',
          data: scatterStacks,
          getPosition: (d: ScatterStack) => d.coordinates,
          getFillColor: (d: ScatterStack) => {
            if (selectedPlace?.id === d.representative.id) {
              return [255, 220, 170, 255] as [number, number, number, number];
            }
            const alpha = d.representative.qualityTier === 'gold' ? 240 : 200;
            return [...sentimentColor(d.avgPolarity), alpha] as [number, number, number, number];
          },
          getRadius: (d: ScatterStack) => {
            const base = 3200 + Math.sqrt(d.count) * 2600;
            if (selectedPlace?.id === d.representative.id) return base * 1.25;
            return base;
          },
          radiusMinPixels: 4,
          radiusMaxPixels: 22,
          pickable: true,
          stroked: true,
          getLineColor: (d: ScatterStack) =>
            selectedPlace?.id === d.representative.id
              ? [255, 255, 255, 255]
              : [40, 40, 40, 100] as [number, number, number, number],
          getLineWidth: (d: ScatterStack) =>
            selectedPlace?.id === d.representative.id ? 2 : 0.5,
          lineWidthMinPixels: 0.5,
          onClick: ({ object }: { object?: ScatterStack }) => {
            if (object) onSelectPlace(object.representative);
          },
          onHover: ({
            object,
            x,
            y,
          }: {
            object?: ScatterStack;
            x: number;
            y: number;
          }) => {
            setHoverInfo(
              object
                ? {
                  x,
                  y,
                  place: {
                    ...object.representative,
                    bookTitle: `${object.count} books in ${object.placeName}`,
                    author: `${new Set(mapPlaces.filter((p) => p.placeName === object.placeName).map((p) => p.author)).size} authors`,
                  },
                  count: object.count,
                }
                : null
            );
          },
          updateTriggers: {
            getFillColor: [selectedPlace?.id],
            getRadius: [selectedPlace?.id],
            getLineColor: [selectedPlace?.id],
            getLineWidth: [selectedPlace?.id],
          },
        } as ConstructorParameters<typeof ScatterplotLayer>[0])
      );

      if (viewState.zoom >= 3.5) {
        result.push(
          new TextLayer({
            id: 'city-labels',
            data: cityClusters.filter((c) => {
              if (viewState.zoom >= 6) return c.count >= 1;
              if (viewState.zoom >= 5) return c.count >= 3;
              return c.count >= 5;
            }),
            getPosition: (d: CityCluster) => d.coordinates,
            getText: (d: CityCluster) => `${d.placeName} (${d.count})`,
            getSize: (d: CityCluster) => {
              const base = Math.min(12 + Math.sqrt(d.count) * 1.5, 20);
              return base;
            },
            getColor: [245, 240, 235, 200],
            getTextAnchor: 'middle' as const,
            getAlignmentBaseline: 'bottom' as const,
            getPixelOffset: [0, -20],
            fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
            fontWeight: 600,
            outlineWidth: 3,
            outlineColor: [5, 5, 5, 220],
            pickable: false,
            billboard: true,
            sizeMinPixels: 10,
            sizeMaxPixels: 22,
          } as ConstructorParameters<typeof TextLayer>[0])
        );
      }
    }

    if (layerMode === 'heatmap') {
      result.push(
        new HeatmapLayer({
          id: 'literary-heatmap',
          data: mapPlaces,
          getPosition: (d: LiteraryPlace) => d.coordinates,
          getWeight: (d: LiteraryPlace) =>
            d.settingType === 'primary' ? 3 : 1,
          radiusPixels: 60,
          intensity: 2,
          threshold: 0.05,
          colorRange: [
            [10, 5, 0, 0],
            [60, 30, 10, 80],
            [140, 80, 30, 140],
            [196, 130, 70, 190],
            [220, 170, 110, 230],
            [255, 230, 190, 255],
          ],
          pickable: false,
        } as ConstructorParameters<typeof HeatmapLayer>[0])
      );
      result.push(
        new ScatterplotLayer({
          id: 'literary-scatter-overlay',
          data: mapPlaces,
          getPosition: (d: LiteraryPlace) => d.coordinates,
          getFillColor: [255, 220, 170, 120],
          getRadius: 4000,
          radiusMinPixels: 2,
          radiusMaxPixels: 6,
          pickable: true,
          onClick: ({ object }: { object?: LiteraryPlace }) => {
            if (object) onSelectPlace(object);
          },
          onHover: ({
            object,
            x,
            y,
          }: {
            object?: LiteraryPlace;
            x: number;
            y: number;
          }) => {
            setHoverInfo(object ? { x, y, place: object } : null);
          },
        } as ConstructorParameters<typeof ScatterplotLayer>[0])
      );
    }

    if (layerMode === 'arcs') {
      result.push(
        new ArcLayer({
          id: 'author-arcs',
          data: authorConnections,
          getSourcePosition: (d: AuthorConnection) => d.source,
          getTargetPosition: (d: AuthorConnection) => d.target,
          getSourceColor: [196, 154, 108, 160],
          getTargetColor: [140, 200, 255, 120],
          getWidth: (d: AuthorConnection) =>
            Math.min(1 + d.bookCount * 0.5, 5),
          widthMinPixels: 1,
          widthMaxPixels: 6,
          greatCircle: true,
          getHeight: 0.4,
          pickable: true,
          onHover: ({
            object,
            x,
            y,
          }: {
            object?: AuthorConnection;
            x: number;
            y: number;
          }) => {
            if (object) {
              setHoverInfo({
                x,
                y,
                place: {
                  id: `arc-${object.author}`,
                  bookTitle: `${object.sourceCity} \u2194 ${object.targetCity}`,
                  author: object.author,
                  placeName: `${object.bookCount} works`,
                  publishYear: 0,
                  coordinates: object.source,
                  placeType: 'real',
                  settingType: 'primary',
                  narrativeEra: '',
                  passage: '',
                  sentiment: { polarity: 0, dominantEmotions: [], themes: [] },
                  language: '',
                  genres: [],
                  region: '',
                },
              });
            } else {
              setHoverInfo(null);
            }
          },
        } as ConstructorParameters<typeof ArcLayer>[0])
      );
      result.push(
        new ScatterplotLayer({
          id: 'arc-endpoints',
          data: cityClusters,
          getPosition: (d: CityCluster) => d.coordinates,
          getFillColor: [196, 154, 108, 220],
          getRadius: (d: CityCluster) => 4000 + Math.sqrt(d.count) * 2000,
          radiusMinPixels: 4,
          radiusMaxPixels: 14,
          pickable: false,
          stroked: true,
          getLineColor: [140, 200, 255, 100],
          getLineWidth: 2,
          lineWidthMinPixels: 1,
        } as ConstructorParameters<typeof ScatterplotLayer>[0])
      );
      if (viewState.zoom >= 3) {
        result.push(
          new TextLayer({
            id: 'arc-labels',
            data: cityClusters.filter((c) => c.count >= 3),
            getPosition: (d: CityCluster) => d.coordinates,
            getText: (d: CityCluster) => d.placeName,
            getSize: 12,
            getColor: [200, 210, 230, 180],
            getTextAnchor: 'middle' as const,
            getAlignmentBaseline: 'bottom' as const,
            getPixelOffset: [0, -16],
            fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
            fontWeight: 500,
            outlineWidth: 3,
            outlineColor: [5, 5, 5, 200],
            pickable: false,
            billboard: true,
            sizeMinPixels: 10,
            sizeMaxPixels: 16,
          } as ConstructorParameters<typeof TextLayer>[0])
        );
      }
    }

    return result;
  }, [mapPlaces, goldPlaces, selectedPlace, layerMode, authorConnections, cityClusters, onSelectPlace, viewState.zoom, isFiltered, bgPlaces, scatterStacks, bgScatterStacks]);

  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const overlay = new MapboxOverlay({ layers, interleaved: false });
    overlayRef.current = overlay;
    map.addControl(overlay as unknown as maplibregl.IControl);
  }, [layers]);

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers });
    }
  }, [layers]);

  const flyTo = useCallback(
    (lng: number, lat: number, zoom = 8) => {
      setViewState((prev) => ({
        ...prev,
        longitude: lng,
        latitude: lat,
        zoom,
        transitionDuration: 1500,
      }));
    },
    []
  );

  useEffect(() => {
    if (selectedPlace) {
      flyTo(selectedPlace.coordinates[0], selectedPlace.coordinates[1], 7);
    }
  }, [selectedPlace, flyTo]);

  return (
    <div className="relative w-full h-full">
      <MapView
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        mapStyle={BASEMAP_DARK}
        onLoad={handleMapLoad}
        attributionControl={true}
        style={{ width: '100%', height: '100%' }}
        cursor={hoverInfo ? 'pointer' : 'grab'}
      >
        <NavigationControl position="bottom-right" showCompass visualizePitch />
      </MapView>

      {hoverInfo && (
        <div
          className="map-tooltip"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <div className="flex items-start gap-3">
            {(hoverInfo.place as LiteraryPlace & { coverUrl?: string }).coverUrl && (
              <img
                src={(hoverInfo.place as LiteraryPlace & { coverUrl?: string }).coverUrl!}
                alt=""
                className="w-8 h-11 rounded object-cover flex-shrink-0"
              />
            )}
            <div>
              <p className="text-sm text-akhand-accent font-medium leading-tight">
                {hoverInfo.place.bookTitle}
              </p>
              <p className="text-xs text-akhand-text-secondary mt-1">
                {hoverInfo.place.author}
              </p>
              {hoverInfo.place.placeName && (
                <p className="text-[10px] text-akhand-text-muted mt-0.5">
                  {hoverInfo.place.placeName}
                  {hoverInfo.place.publishYear ? ` \u00b7 ${hoverInfo.place.publishYear}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
