'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  MapPin,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LiteraryPlace } from '@/lib/types';
import { getUniqueRegions, getUniqueGenres, getEraRanges } from '@/lib/data';

interface SearchPanelProps {
  places: LiteraryPlace[];
  onSelectPlace: (place: LiteraryPlace) => void;
  selectedPlace: LiteraryPlace | null;
  onFilteredPlacesChange: (places: LiteraryPlace[]) => void;
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
        active
          ? 'bg-akhand-accent text-akhand-bg'
          : 'bg-akhand-surface-2 text-akhand-text-secondary hover:bg-akhand-surface-3 hover:text-akhand-text-primary'
      }`}
    >
      {label}
    </button>
  );
}

function sentimentLabel(polarity: number): string {
  if (polarity > 0.3) return 'Luminous';
  if (polarity > 0) return 'Warm';
  if (polarity > -0.3) return 'Shadowed';
  return 'Dark';
}

function sentimentDot(polarity: number): string {
  if (polarity > 0.2) return 'bg-akhand-positive';
  if (polarity < -0.2) return 'bg-akhand-negative';
  return 'bg-akhand-accent';
}

export default function SearchPanel({
  places,
  onSelectPlace,
  selectedPlace,
  onFilteredPlacesChange,
}: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedEras, setSelectedEras] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    regions: true,
    genres: false,
    eras: false,
  });

  const regions = useMemo(getUniqueRegions, []);
  const genres = useMemo(getUniqueGenres, []);
  const eras = useMemo(getEraRanges, []);

  const filteredPlaces = useMemo(() => {
    let result = places;

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.bookTitle.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          p.placeName.toLowerCase().includes(q) ||
          p.passage.toLowerCase().includes(q) ||
          p.sentiment.themes.some((t) => t.replace(/_/g, ' ').includes(q)) ||
          p.sentiment.dominantEmotions.some((e) => e.replace(/_/g, ' ').includes(q))
      );
    }

    if (selectedRegions.length > 0) {
      result = result.filter((p) => selectedRegions.includes(p.region));
    }

    if (selectedGenres.length > 0) {
      result = result.filter((p) =>
        p.genres.some((g) => selectedGenres.includes(g))
      );
    }

    if (selectedEras.length > 0) {
      result = result.filter((p) => {
        const year = p.publishYear;
        return selectedEras.some((era) => {
          switch (era) {
            case 'Pre-1900': return year < 1900;
            case '1900–1950': return year >= 1900 && year < 1950;
            case '1950–1980': return year >= 1950 && year < 1980;
            case '1980–2000': return year >= 1980 && year < 2000;
            case '2000–present': return year >= 2000;
            default: return true;
          }
        });
      });
    }

    onFilteredPlacesChange(result);
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedRegions, selectedGenres, selectedEras, places]);

  const toggleFilter = (
    list: string[],
    setList: (v: string[]) => void,
    value: string
  ) => {
    setList(
      list.includes(value)
        ? list.filter((v2) => v2 !== value)
        : [...list, value]
    );
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeFilterCount =
    selectedRegions.length + selectedGenres.length + selectedEras.length;

  const clearAll = () => {
    setQuery('');
    setSelectedRegions([]);
    setSelectedGenres([]);
    setSelectedEras([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-4 border-b border-akhand-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-akhand-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books, authors, places, themes..."
            className="w-full bg-akhand-surface-2 border border-akhand-border rounded-lg pl-10 pr-10 py-2.5 text-sm text-akhand-text-primary placeholder:text-akhand-text-muted focus:outline-none focus:border-akhand-accent/50 focus:ring-1 focus:ring-akhand-accent/20 transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-akhand-text-muted hover:text-akhand-text-secondary"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'text-akhand-accent'
                : 'text-akhand-text-secondary hover:text-akhand-text-primary'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-akhand-accent text-akhand-bg rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-akhand-text-muted hover:text-akhand-accent transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-akhand-border"
          >
            <div className="p-4 space-y-3">
              {/* Regions */}
              <div>
                <button
                  onClick={() => toggleSection('regions')}
                  className="flex items-center justify-between w-full text-xs font-medium text-akhand-text-secondary mb-2"
                >
                  Region
                  {expandedSections.regions ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                {expandedSections.regions && (
                  <div className="flex flex-wrap gap-1.5">
                    {regions.map((r) => (
                      <FilterChip
                        key={r}
                        label={r}
                        active={selectedRegions.includes(r)}
                        onClick={() =>
                          toggleFilter(selectedRegions, setSelectedRegions, r)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Genres */}
              <div>
                <button
                  onClick={() => toggleSection('genres')}
                  className="flex items-center justify-between w-full text-xs font-medium text-akhand-text-secondary mb-2"
                >
                  Genre
                  {expandedSections.genres ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                {expandedSections.genres && (
                  <div className="flex flex-wrap gap-1.5">
                    {genres.map((g) => (
                      <FilterChip
                        key={g}
                        label={g}
                        active={selectedGenres.includes(g)}
                        onClick={() =>
                          toggleFilter(selectedGenres, setSelectedGenres, g)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Eras */}
              <div>
                <button
                  onClick={() => toggleSection('eras')}
                  className="flex items-center justify-between w-full text-xs font-medium text-akhand-text-secondary mb-2"
                >
                  Era
                  {expandedSections.eras ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                {expandedSections.eras && (
                  <div className="flex flex-wrap gap-1.5">
                    {eras.map((e) => (
                      <FilterChip
                        key={e}
                        label={e}
                        active={selectedEras.includes(e)}
                        onClick={() =>
                          toggleFilter(selectedEras, setSelectedEras, e)
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results count */}
      <div className="px-4 py-2 text-xs text-akhand-text-muted border-b border-akhand-border/50">
        {filteredPlaces.length} literary place{filteredPlaces.length !== 1 && 's'}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto">
        {filteredPlaces.map((place) => (
          <button
            key={place.id}
            onClick={() => onSelectPlace(place)}
            className={`w-full text-left p-4 border-b border-akhand-border/30 transition-all duration-200 hover:bg-akhand-surface-2 ${
              selectedPlace?.id === place.id
                ? 'bg-akhand-accent-dim border-l-2 border-l-akhand-accent'
                : ''
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${sentimentDot(
                  place.sentiment.polarity
                )}`}
              />
              <div className="flex-1 min-w-0">
                <h4 className="font-serif text-sm font-medium text-akhand-text-primary truncate">
                  {place.bookTitle}
                </h4>
                <p className="text-xs text-akhand-text-secondary mt-0.5">
                  {place.author} · {place.publishYear}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3 text-akhand-accent" />
                  <span className="text-xs text-akhand-accent">
                    {place.placeName}
                  </span>
                </div>
                <p className="text-[11px] text-akhand-text-muted mt-1.5 line-clamp-2 font-serif italic leading-relaxed">
                  &ldquo;{place.passage.slice(0, 100)}...&rdquo;
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
