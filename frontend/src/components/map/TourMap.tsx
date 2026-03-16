'use client';

import { useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { TourStop } from '@/lib/tours';

interface TourMapProps {
  stops: TourStop[];
  activeIndex: number;
}

export default function TourMap({ stops, activeIndex }: TourMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const createMarker = useCallback(
    (stop: TourStop, index: number, active: boolean) => {
      const el = document.createElement('div');
      el.className = 'tour-marker';
      el.style.cssText = `
        width: ${active ? '16px' : '10px'};
        height: ${active ? '16px' : '10px'};
        border-radius: 50%;
        background: ${active ? '#c49a6c' : 'rgba(196,154,108,0.4)'};
        border: 2px solid ${active ? '#c49a6c' : 'rgba(196,154,108,0.2)'};
        box-shadow: ${active ? '0 0 20px rgba(196,154,108,0.6), 0 0 40px rgba(196,154,108,0.3)' : 'none'};
        transition: all 0.5s ease;
        cursor: pointer;
      `;
      el.dataset.index = String(index);
      return el;
    },
    []
  );

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '&copy; CARTO',
          },
        },
        layers: [
          {
            id: 'carto-dark',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 20,
          },
        ],
      },
      center: stops[0]?.coordinates || [72.85, 19.0],
      zoom: stops[0]?.zoom || 12,
      pitch: 30,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      // Add all stop markers
      stops.forEach((stop, i) => {
        const el = createMarker(stop, i, i === 0);
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(stop.coordinates)
          .addTo(map);
        markersRef.current.push(marker);
      });
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [stops, createMarker]);

  // Fly to active stop
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeIndex < 0 || activeIndex >= stops.length) return;

    const stop = stops[activeIndex];
    map.flyTo({
      center: stop.coordinates,
      zoom: stop.zoom,
      pitch: 30,
      duration: 1500,
      essential: true,
    });

    // Update marker styles
    markersRef.current.forEach((marker, i) => {
      const el = marker.getElement();
      const active = i === activeIndex;
      el.style.width = active ? '16px' : '10px';
      el.style.height = active ? '16px' : '10px';
      el.style.background = active ? '#c49a6c' : 'rgba(196,154,108,0.4)';
      el.style.borderColor = active ? '#c49a6c' : 'rgba(196,154,108,0.2)';
      el.style.boxShadow = active
        ? '0 0 20px rgba(196,154,108,0.6), 0 0 40px rgba(196,154,108,0.3)'
        : 'none';
    });
  }, [activeIndex, stops]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: '100vh' }}
    />
  );
}
