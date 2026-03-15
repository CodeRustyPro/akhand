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
import { ScatterplotLayer, ArcLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type {
  LiteraryPlace,
  MapViewState,
  MapLayerMode,
  AuthorConnection,
} from '@/lib/types';
import { sentimentColor, generateAuthorConnections } from '@/lib/data';

// Register PMTiles protocol for zero-cost self-hosted vector tiles.
// To use PMTiles: host a .pmtiles file on Cloudflare R2 or S3 (free egress),
// then point BASEMAP_STYLE to a style.json referencing pmtiles:// sources.
// For development, CARTO's free dark basemap works without any hosting.
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);

// Default: CARTO dark matter (free, no API key)
// Production: self-hosted PMTiles on Cloudflare R2 for zero tile-serving cost
const BASEMAP_DARK =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const INITIAL_VIEW: MapViewState = {
  longitude: 68,
  latitude: 25,
  zoom: 3.2,
  pitch: 0,
  bearing: 0,
};

interface LiteraryMapProps {
  places: LiteraryPlace[];
  selectedPlace: LiteraryPlace | null;
  onSelectPlace: (place: LiteraryPlace | null) => void;
  layerMode: MapLayerMode;
}

function DeckGLOverlay({
  layers,
}: {
  layers: (ScatterplotLayer | HeatmapLayer | ArcLayer)[];
}) {
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    return () => {
      if (overlayRef.current && mapRef.current) {
        try {
          mapRef.current.removeControl(overlayRef.current as unknown as maplibregl.IControl);
        } catch {
          // already removed
        }
      }
    };
  }, []);

  const onMapLoad = useCallback(
    (e: maplibregl.MapLibreEvent) => {
      const map = e.target;
      mapRef.current = map;
      const overlay = new MapboxOverlay({ layers });
      overlayRef.current = overlay;
      map.addControl(overlay as unknown as maplibregl.IControl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (overlayRef.current) {
      overlayRef.current.setProps({ layers });
    }
  }, [layers]);

  return { onMapLoad };
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

  const authorConnections = useMemo(() => generateAuthorConnections(), []);

  const handleMove = useCallback((e: ViewStateChangeEvent) => {
    setViewState(e.viewState as MapViewState);
  }, []);

  const layers = useMemo(() => {
    const result: (ScatterplotLayer | HeatmapLayer | ArcLayer)[] = [];

    if (layerMode === 'scatter') {
      result.push(
        new ScatterplotLayer({
          id: 'literary-scatter',
          data: places,
          getPosition: (d: LiteraryPlace) => d.coordinates,
          getFillColor: (d: LiteraryPlace) => {
            if (selectedPlace?.id === d.id) return [196, 154, 108, 255];
            return [...sentimentColor(d.sentiment.polarity), 200] as [number, number, number, number];
          },
          getRadius: (d: LiteraryPlace) =>
            selectedPlace?.id === d.id
              ? 12000
              : d.settingType === 'primary'
                ? 8000
                : 5000,
          radiusMinPixels: 4,
          radiusMaxPixels: 20,
          pickable: true,
          stroked: true,
          getLineColor: [196, 154, 108, 100],
          getLineWidth: 1,
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
            getFillColor: selectedPlace?.id,
            getRadius: selectedPlace?.id,
          },
          transitions: {
            getRadius: 300,
            getFillColor: 300,
          },
        } as ConstructorParameters<typeof ScatterplotLayer>[0])
      );
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
          intensity: 1.5,
          threshold: 0.1,
          colorRange: [
            [26, 26, 26, 0],
            [100, 70, 40, 80],
            [160, 110, 60, 140],
            [196, 154, 108, 180],
            [220, 180, 130, 220],
            [245, 220, 180, 255],
          ],
          pickable: false,
        } as ConstructorParameters<typeof HeatmapLayer>[0])
      );
      result.push(
        new ScatterplotLayer({
          id: 'literary-scatter-overlay',
          data: places,
          getPosition: (d: LiteraryPlace) => d.coordinates,
          getFillColor: [196, 154, 108, 150],
          getRadius: 4000,
          radiusMinPixels: 3,
          radiusMaxPixels: 8,
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
          getSourceColor: [196, 154, 108, 180],
          getTargetColor: [232, 213, 192, 120],
          getWidth: 2,
          widthMinPixels: 1,
          widthMaxPixels: 4,
          greatCircle: true,
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
                  bookTitle: `${object.sourceCity} → ${object.targetCity}`,
                  author: object.author,
                  placeName: '',
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
          data: places,
          getPosition: (d: LiteraryPlace) => d.coordinates,
          getFillColor: [196, 154, 108, 200],
          getRadius: 6000,
          radiusMinPixels: 4,
          radiusMaxPixels: 12,
          pickable: true,
          stroked: true,
          getLineColor: [232, 213, 192, 150],
          getLineWidth: 2,
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
        } as ConstructorParameters<typeof ScatterplotLayer>[0])
      );
    }

    return result;
  }, [places, selectedPlace, layerMode, authorConnections, onSelectPlace]);

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
        transitionDuration: 1200,
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
        <NavigationControl position="bottom-right" showCompass={false} />
      </Map>

      {hoverInfo && (
        <div
          className="map-tooltip"
          style={{ left: hoverInfo.x, top: hoverInfo.y }}
        >
          <p className="font-serif text-sm text-akhand-accent font-medium">
            {hoverInfo.place.bookTitle}
          </p>
          <p className="text-xs text-akhand-text-secondary mt-1">
            {hoverInfo.place.author}
            {hoverInfo.place.placeName && ` · ${hoverInfo.place.placeName}`}
          </p>
          {hoverInfo.place.narrativeEra && (
            <p className="text-[10px] text-akhand-text-muted mt-0.5">
              {hoverInfo.place.narrativeEra}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
