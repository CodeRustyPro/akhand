'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Map, {
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

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);

const BASEMAP_DARK =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const INITIAL_VIEW: MapViewState = {
  longitude: 78,
  latitude: 22,
  zoom: 4.2,
  pitch: 45,
  bearing: -8,
};

interface LiteraryMapProps {
  places: LiteraryPlace[];
  selectedPlace: LiteraryPlace | null;
  onSelectPlace: (place: LiteraryPlace | null) => void;
  layerMode: MapLayerMode;
}

interface CityCluster {
  placeName: string;
  coordinates: [number, number];
  count: number;
  authors: number;
}

export default function LiteraryMap({
  places,
  selectedPlace,
  onSelectPlace,
  layerMode,
}: LiteraryMapProps) {
  const [viewState, setViewState] = useState<MapViewState>(INITIAL_VIEW);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    place: LiteraryPlace;
  } | null>(null);
  const mapRef = useRef<MapRef>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [time, setTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime((t) => t + 1);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const cityClusters = useMemo(() => {
    const grouped: Record<string, LiteraryPlace[]> = {};
    places.forEach((p) => {
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
  }, [places]);

  const authorConnections = useMemo(() => {
    const grouped: Record<string, LiteraryPlace[]> = {};
    places.forEach((p) => {
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
  }, [places]);

  const handleMove = useCallback((e: ViewStateChangeEvent) => {
    setViewState(e.viewState as MapViewState);
  }, []);

  const bookCountByPlace = useMemo(() => {
    const counts: Record<string, number> = {};
    places.forEach((p) => {
      counts[p.placeName] = (counts[p.placeName] || 0) + 1;
    });
    return counts;
  }, [places]);

  const pulse = Math.sin(time * 0.08) * 0.3 + 0.7;

  const layers = useMemo(() => {
    const result: (ScatterplotLayer | HeatmapLayer | ArcLayer | TextLayer)[] = [];

    if (layerMode === 'scatter') {
      result.push(
        new ScatterplotLayer({
          id: 'scatter-glow',
          data: places,
          getPosition: (d: LiteraryPlace) => d.coordinates,
          getFillColor: (d: LiteraryPlace) => {
            const count = bookCountByPlace[d.placeName] || 1;
            const intensity = Math.min(count / 15, 1);
            return [196, 154, 108, Math.round(30 + intensity * 40)] as [number, number, number, number];
          },
          getRadius: (d: LiteraryPlace) => {
            const count = bookCountByPlace[d.placeName] || 1;
            return 15000 + Math.sqrt(count) * 8000;
          },
          radiusMinPixels: 8,
          radiusMaxPixels: 40,
          pickable: false,
          updateTriggers: {
            getFillColor: [time],
          },
        } as ConstructorParameters<typeof ScatterplotLayer>[0])
      );

      result.push(
        new ScatterplotLayer({
          id: 'literary-scatter',
          data: places,
          getPosition: (d: LiteraryPlace) => d.coordinates,
          getFillColor: (d: LiteraryPlace) => {
            if (selectedPlace?.id === d.id) {
              return [255, 220, 170, Math.round(200 + pulse * 55)] as [number, number, number, number];
            }
            return [...sentimentColor(d.sentiment.polarity), 220] as [number, number, number, number];
          },
          getRadius: (d: LiteraryPlace) => {
            const count = bookCountByPlace[d.placeName] || 1;
            const base = 3000 + Math.sqrt(count) * 2500;
            if (selectedPlace?.id === d.id) return base * 1.8;
            return base;
          },
          radiusMinPixels: 3,
          radiusMaxPixels: 18,
          pickable: true,
          stroked: true,
          getLineColor: (d: LiteraryPlace) =>
            selectedPlace?.id === d.id
              ? [255, 220, 170, 255]
              : [196, 154, 108, 80] as [number, number, number, number],
          getLineWidth: (d: LiteraryPlace) =>
            selectedPlace?.id === d.id ? 3 : 1,
          lineWidthMinPixels: 1,
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
          updateTriggers: {
            getFillColor: [selectedPlace?.id, time],
            getRadius: [selectedPlace?.id],
            getLineColor: [selectedPlace?.id],
            getLineWidth: [selectedPlace?.id],
          },
          transitions: {
            getRadius: 300,
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
          data: places,
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
          data: places,
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
  }, [places, selectedPlace, layerMode, authorConnections, cityClusters, onSelectPlace, viewState.zoom, bookCountByPlace, pulse, time]);

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
      <Map
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
      </Map>

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
