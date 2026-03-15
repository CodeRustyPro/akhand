'use client';

import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  Crosshair,
  Grid3X3,
  GitBranch,
  Sparkles,
  WifiOff,
  Database,
} from 'lucide-react';
import SearchPanel from '@/components/ui/SearchPanel';
import PlaceDetail from '@/components/ui/PlaceDetail';
import { literaryPlaces as fallbackPlaces } from '@/lib/data';
import { fetchLiteraryPlaces } from '@/lib/api';
import type { LiteraryPlace, MapLayerMode } from '@/lib/types';

const LiteraryMap = dynamic(() => import('@/components/map/LiteraryMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-akhand-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-akhand-accent/30 border-t-akhand-accent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-akhand-text-muted mt-3 italic">
          Mapping the literary world...
        </p>
      </div>
    </div>
  ),
});

const layerOptions: { mode: MapLayerMode; icon: typeof Crosshair; label: string }[] = [
  { mode: 'scatter', icon: Crosshair, label: 'Places' },
  { mode: 'heatmap', icon: Grid3X3, label: 'Density' },
  { mode: 'arcs', icon: GitBranch, label: 'Connections' },
];

export default function ExplorePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<LiteraryPlace | null>(null);
  const [layerMode, setLayerMode] = useState<MapLayerMode>('scatter');
  const [allPlaces, setAllPlaces] = useState<LiteraryPlace[]>(fallbackPlaces);
  const [filteredPlaces, setFilteredPlaces] = useState<LiteraryPlace[]>(fallbackPlaces);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [dataSource, setDataSource] = useState<'fallback' | 'api'>('fallback');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      const places = await fetchLiteraryPlaces({ limit: 1000 });
      if (!cancelled) {
        setAllPlaces(places);
        setFilteredPlaces(places);
        setDataSource(places !== fallbackPlaces ? 'api' : 'fallback');
        setLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleSelectPlace = useCallback((place: LiteraryPlace | null) => {
    setSelectedPlace(place);
  }, []);

  const handleFilteredPlacesChange = useCallback((places: LiteraryPlace[]) => {
    setFilteredPlaces(places);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-akhand-bg flex">
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="h-full border-r border-akhand-border bg-akhand-surface flex-shrink-0 overflow-hidden flex flex-col z-20"
          >
            {/* Sidebar header */}
            <div className="flex items-center justify-between p-4 border-b border-akhand-border">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Sparkles className="w-4 h-4 text-akhand-accent" />
                <h1 className="text-lg font-semibold text-akhand-text-primary tracking-tight">
                  Akhand
                </h1>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-akhand-surface-2 transition-colors"
                title="Close sidebar"
              >
                <PanelLeftClose className="w-4 h-4 text-akhand-text-secondary" />
              </button>
            </div>

            <SearchPanel
              places={allPlaces}
              selectedPlace={selectedPlace}
              onSelectPlace={handleSelectPlace}
              onFilteredPlacesChange={handleFilteredPlacesChange}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Map area */}
      <div className="flex-1 relative">
        {/* Sidebar toggle (when closed) */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 z-20 p-2.5 glass rounded-lg hover:bg-akhand-surface-2 transition-colors"
            title="Open sidebar"
          >
            <PanelLeftOpen className="w-4 h-4 text-akhand-text-secondary" />
          </button>
        )}

        {/* Layer controls */}
        <div className="absolute top-4 right-4 z-20">
          <div className="relative">
            <button
              onClick={() => setShowLayerMenu(!showLayerMenu)}
              className="p-2.5 glass rounded-lg hover:bg-akhand-surface-2 transition-colors"
              title="Map layers"
            >
              <Layers className="w-4 h-4 text-akhand-text-secondary" />
            </button>

            <AnimatePresence>
              {showLayerMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 glass rounded-xl p-2 min-w-[160px]"
                >
                  {layerOptions.map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setLayerMode(mode);
                        setShowLayerMenu(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                        layerMode === mode
                          ? 'bg-akhand-accent-dim text-akhand-accent'
                          : 'text-akhand-text-secondary hover:bg-akhand-surface-2 hover:text-akhand-text-primary'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Stats bar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 glass rounded-full px-6 py-2.5 flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            {dataSource === 'api' ? (
              <Database className="w-3 h-3 text-akhand-positive" />
            ) : (
              <WifiOff className="w-3 h-3 text-akhand-text-muted" />
            )}
            <div className="text-center">
              <p className="text-xs font-semibold text-akhand-accent">
                {loading ? '...' : filteredPlaces.length}
              </p>
              <p className="text-[10px] text-akhand-text-muted">places</p>
            </div>
          </div>
          <div className="w-px h-6 bg-akhand-border" />
          <div className="text-center">
            <p className="text-xs font-semibold text-akhand-text-primary">
              {new Set(filteredPlaces.map((p) => p.bookTitle)).size}
            </p>
            <p className="text-[10px] text-akhand-text-muted">books</p>
          </div>
          <div className="w-px h-6 bg-akhand-border" />
          <div className="text-center">
            <p className="text-xs font-semibold text-akhand-text-primary">
              {new Set(filteredPlaces.map((p) => p.author)).size}
            </p>
            <p className="text-[10px] text-akhand-text-muted">authors</p>
          </div>
          <div className="w-px h-6 bg-akhand-border" />
          <div className="text-center">
            <p className="text-xs font-semibold text-akhand-text-primary">
              {new Set(filteredPlaces.map((p) => p.placeName)).size}
            </p>
            <p className="text-[10px] text-akhand-text-muted">cities</p>
          </div>
          {dataSource === 'api' && (
            <>
              <div className="w-px h-6 bg-akhand-border" />
              <div className="text-[9px] text-akhand-positive font-medium">
                LIVE
              </div>
            </>
          )}
        </div>

        {/* Map */}
        <LiteraryMap
          places={filteredPlaces}
          selectedPlace={selectedPlace}
          onSelectPlace={handleSelectPlace}
          layerMode={layerMode}
        />

        {/* Place detail panel */}
        <AnimatePresence>
          {selectedPlace && (
            <PlaceDetail
              place={selectedPlace}
              allPlaces={allPlaces}
              onClose={() => setSelectedPlace(null)}
              onSelectRelated={handleSelectPlace}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
