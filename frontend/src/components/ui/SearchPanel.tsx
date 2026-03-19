'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { List } from 'react-window';
import type { LiteraryPlace } from '@/lib/types';

interface SearchPanelProps {
  places: LiteraryPlace[];
  onSelectPlace: (place: LiteraryPlace) => void;
  selectedPlace: LiteraryPlace | null;
  onFilteredPlacesChange: (places: LiteraryPlace[]) => void;
  authorFilter?: string | null;
  onClearAuthorFilter?: () => void;
  genreFilter?: string | null;
  onClearGenreFilter?: () => void;
  initialQuery?: string;
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
      className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${active
        ? 'bg-akhand-accent text-akhand-bg'
        : 'bg-akhand-surface-2 text-akhand-text-secondary hover:bg-akhand-surface-3 hover:text-akhand-text-primary'
        }`}
    >
      {label}
    </button>
  );
}

function sentimentDot(polarity: number): string {
  if (polarity > 0.2) return 'bg-akhand-positive';
  if (polarity < -0.2) return 'bg-akhand-negative';
  return 'bg-akhand-accent';
}

const ERA_RANGES = [
  'Pre-1900',
  '1900\u20131950',
  '1950\u20131980',
  '1980\u20132000',
  '2000\u2013present',
];

const METROS = new Set([
  'Mumbai', 'Delhi', 'Kolkata', 'Chennai', 'Bangalore',
  'Hyderabad', 'London', 'New York', 'Paris', 'Tokyo',
  'Karachi', 'Lahore', 'Dhaka', 'Moscow',
]);

interface SearchRowProps {
  filteredPlaces: LiteraryPlace[];
  selectedPlace: LiteraryPlace | null;
  onSelectPlace: (place: LiteraryPlace) => void;
}

function SearchResultRow({
  index,
  style,
  filteredPlaces,
  selectedPlace,
  onSelectPlace,
}: {
  index: number;
  style: React.CSSProperties;
} & SearchRowProps) {
  const place = filteredPlaces[index];
  if (!place) return null;

  return (
    <div style={style}>
      <button
        onClick={() => onSelectPlace(place)}
        className={`w-full text-left px-4 py-3 border-b border-akhand-border/30 transition-all duration-200 hover:bg-akhand-surface-2 h-full ${selectedPlace?.id === place.id
          ? 'bg-akhand-accent-dim border-l-2 border-l-akhand-accent'
          : ''
          }`}
      >
        <div className="flex items-start gap-3">
          {place.coverUrl ? (
            <img
              src={place.coverUrl}
              alt=""
              className="w-10 h-14 rounded object-cover flex-shrink-0 bg-akhand-surface-3"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${sentimentDot(
                place.sentiment.polarity
              )}`}
            />
          )}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-akhand-text-primary truncate">
              {place.bookTitle}
            </h4>
            <p className="text-xs text-akhand-text-secondary mt-0.5">
              {place.author}
              {place.publishYear ? ` · ${place.publishYear}` : ''}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="w-3 h-3 text-akhand-accent" />
              <span className="text-xs text-akhand-accent">
                {place.placeName}
              </span>
              {place.language && place.language !== 'English' && (
                <span className="text-[10px] text-akhand-text-muted ml-1">
                  · {place.language}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

export default function SearchPanel({
  places,
  onSelectPlace,
  selectedPlace,
  onFilteredPlacesChange,
  authorFilter,
  onClearAuthorFilter,
  genreFilter,
  onClearGenreFilter,
  initialQuery,
}: SearchPanelProps) {
  const [query, setQuery] = useState(
    initialQuery && !initialQuery.startsWith('_') ? initialQuery : ''
  );
  const [specialFilter, setSpecialFilter] = useState(
    initialQuery?.startsWith('_') ? initialQuery : null
  );
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedEras, setSelectedEras] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    regions: true,
    languages: false,
    genres: false,
    eras: false,
  });

  const regions = useMemo(
    () => [...new Set(places.map((p) => p.region))].sort(),
    [places]
  );

  const genres = useMemo(() => {
    const g = new Set<string>();
    places.forEach((p) => p.genres.forEach((genre) => g.add(genre)));
    return [...g].sort();
  }, [places]);

  const languages = useMemo(() => {
    const counts: Record<string, number> = {};
    places.forEach((p) => {
      const lang = p.language || 'Unknown';
      counts[lang] = (counts[lang] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => ({ lang, count }));
  }, [places]);

  const filteredPlaces = useMemo(() => {
    let result = places;

    if (authorFilter) {
      result = result.filter((p) => p.author === authorFilter);
    }

    if (genreFilter) {
      result = result.filter((p) => p.genres.includes(genreFilter));
    }

    if (specialFilter) {
      if (specialFilter === '_lang:non-english') {
        result = result.filter(
          (p) => p.language !== 'English' && p.language !== 'Unknown' && Boolean(p.language)
        );
      } else if (specialFilter === '_list:mumbai-noir') {
        result = result.filter(
          (p) =>
            p.placeName === 'Mumbai' &&
            (p.genres.includes('crime') ||
              p.genres.includes('mystery') ||
              p.genres.includes('thriller') ||
              p.sentiment.themes.some(t => t.includes('corruption')))
        );
      } else if (specialFilter === '_list:small-towns') {
        result = result.filter(
          (p) => p.region === 'South Asia' && !METROS.has(p.placeName)
        );
      } else if (specialFilter.startsWith('_genre:')) {
        const genre = specialFilter.slice(7);
        result = result.filter((p) => p.genres.includes(genre));
      }
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (p) =>
          p.bookTitle.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          p.placeName.toLowerCase().includes(q) ||
          (p.passage && p.passage.toLowerCase().includes(q)) ||
          p.sentiment.themes.some((t) =>
            t.replace(/_/g, ' ').includes(q)
          ) ||
          p.sentiment.dominantEmotions.some((e) =>
            e.replace(/_/g, ' ').includes(q)
          )
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

    if (selectedLanguages.length > 0) {
      result = result.filter((p) =>
        selectedLanguages.includes(p.language || 'Unknown')
      );
    }

    if (selectedEras.length > 0) {
      result = result.filter((p) => {
        const year = p.publishYear;
        return selectedEras.some((era) => {
          switch (era) {
            case 'Pre-1900':
              return year < 1900;
            case '1900\u20131950':
              return year >= 1900 && year < 1950;
            case '1950\u20131980':
              return year >= 1950 && year < 1980;
            case '1980\u20132000':
              return year >= 1980 && year < 2000;
            case '2000\u2013present':
              return year >= 2000;
            default:
              return true;
          }
        });
      });
    }

    const tierRank: Record<string, number> = { gold: 0, silver: 1, stub: 2 };
    result = [...result].sort((a, b) => {
      const ra = tierRank[a.qualityTier || 'stub'] ?? 3;
      const rb = tierRank[b.qualityTier || 'stub'] ?? 3;
      if (ra !== rb) return ra - rb;
      return (b.publishYear || 0) - (a.publishYear || 0);
    });

    return result;
  }, [query, selectedRegions, selectedGenres, selectedLanguages, selectedEras, authorFilter, genreFilter, specialFilter, places]);

  useEffect(() => {
    onFilteredPlacesChange(filteredPlaces);
  }, [filteredPlaces, onFilteredPlacesChange]);

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
    selectedRegions.length + selectedGenres.length + selectedLanguages.length + selectedEras.length;

  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  useEffect(() => {
    if (!listContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(listContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const clearAll = () => {
    setQuery('');
    setSelectedRegions([]);
    setSelectedGenres([]);
    setSelectedLanguages([]);
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
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${showFilters || activeFilterCount > 0
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
                          toggleFilter(
                            selectedRegions,
                            setSelectedRegions,
                            r
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Languages */}
              <div>
                <button
                  onClick={() => toggleSection('languages')}
                  className="flex items-center justify-between w-full text-xs font-medium text-akhand-text-secondary mb-2"
                >
                  Language
                  {expandedSections.languages ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
                {expandedSections.languages && (
                  <div className="flex flex-wrap gap-1.5">
                    {languages.map(({ lang, count }) => (
                      <FilterChip
                        key={lang}
                        label={`${lang} (${count})`}
                        active={selectedLanguages.includes(lang)}
                        onClick={() =>
                          toggleFilter(
                            selectedLanguages,
                            setSelectedLanguages,
                            lang
                          )
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
                          toggleFilter(
                            selectedGenres,
                            setSelectedGenres,
                            g
                          )
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
                    {ERA_RANGES.map((e) => (
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

      {/* Special filter banner */}
      {specialFilter && (
        <div className="px-4 py-2.5 bg-akhand-accent-dim border-b border-akhand-border flex items-center justify-between">
          <div className="text-xs">
            <span className="text-akhand-text-muted">List: </span>
            <span className="font-medium text-akhand-accent">
              {specialFilter === '_lang:non-english'
                ? 'Fiction in Translation'
                : specialFilter === '_list:mumbai-noir'
                  ? 'Mumbai Noir'
                  : specialFilter === '_list:small-towns'
                    ? 'Small Town Stories'
                    : specialFilter.startsWith('_genre:')
                      ? specialFilter.slice(7)
                      : specialFilter}
            </span>
          </div>
          <button
            onClick={() => setSpecialFilter(null)}
            className="text-akhand-text-muted hover:text-akhand-text-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Genre filter banner */}
      {genreFilter && (
        <div className="px-4 py-2.5 bg-akhand-accent-dim border-b border-akhand-border flex items-center justify-between">
          <div className="text-xs">
            <span className="text-akhand-text-muted">Genre: </span>
            <span className="font-medium text-akhand-accent">{genreFilter}</span>
          </div>
          <button
            onClick={onClearGenreFilter}
            className="text-akhand-text-muted hover:text-akhand-text-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Author filter banner */}
      {authorFilter && (
        <div className="px-4 py-2.5 bg-akhand-accent-dim border-b border-akhand-border flex items-center justify-between">
          <div className="text-xs">
            <span className="text-akhand-text-muted">Author: </span>
            <span className="font-medium text-akhand-accent">{authorFilter}</span>
          </div>
          <button
            onClick={onClearAuthorFilter}
            className="text-akhand-text-muted hover:text-akhand-text-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Results count */}
      <div className="px-4 py-2 text-xs text-akhand-text-muted border-b border-akhand-border/50">
        {filteredPlaces.length} literary place
        {filteredPlaces.length !== 1 && 's'}
      </div>

      {/* Virtualized results list */}
      <div className="flex-1 overflow-hidden" ref={listContainerRef}>
        <List<SearchRowProps>
          defaultHeight={listHeight}
          rowCount={filteredPlaces.length}
          rowHeight={88}
          overscanCount={5}
          style={{ width: '100%' }}
          rowComponent={SearchResultRow}
          rowProps={{ filteredPlaces, selectedPlace, onSelectPlace }}
        />
      </div>
    </div>
  );
}
