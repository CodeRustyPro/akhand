'use client';

import { motion } from 'framer-motion';
import {
  X,
  MapPin,
  BookOpen,
  Calendar,
  Globe2,
  Heart,
  Tag,
  ExternalLink,
  Languages,
} from 'lucide-react';
import type { LiteraryPlace } from '@/lib/types';
import { useMemo } from 'react';

interface PlaceDetailProps {
  place: LiteraryPlace;
  allPlaces: LiteraryPlace[];
  onClose: () => void;
  onSelectRelated?: (place: LiteraryPlace) => void;
}

function SentimentBar({ polarity }: { polarity: number }) {
  const normalized = (polarity + 1) / 2;
  const percentage = Math.round(normalized * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-akhand-text-muted">Sentiment</span>
        <span
          className={`font-medium ${
            polarity > 0.2
              ? 'text-akhand-positive'
              : polarity < -0.2
                ? 'text-akhand-negative'
                : 'text-akhand-accent'
          }`}
        >
          {polarity > 0 ? '+' : ''}
          {polarity.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 bg-akhand-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            background:
              polarity > 0.2
                ? 'linear-gradient(90deg, #4ade80, #22c55e)'
                : polarity < -0.2
                  ? 'linear-gradient(90deg, #ef4444, #f87171)'
                  : 'linear-gradient(90deg, #c49a6c, #d4aa7c)',
          }}
        />
      </div>
    </div>
  );
}

function hasPassage(place: LiteraryPlace): boolean {
  return Boolean(place.passage && place.passage.trim().length > 5);
}

function hasEmotions(place: LiteraryPlace): boolean {
  return place.sentiment.dominantEmotions.length > 0;
}

function hasThemes(place: LiteraryPlace): boolean {
  return place.sentiment.themes.length > 0;
}

export default function PlaceDetail({
  place,
  allPlaces,
  onClose,
  onSelectRelated,
}: PlaceDetailProps) {
  const relatedPlaces = useMemo(() => {
    return allPlaces.filter(
      (p) =>
        p.id !== place.id &&
        (p.placeName === place.placeName ||
          p.author === place.author ||
          p.bookTitle === place.bookTitle)
    );
  }, [place, allPlaces]);

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute right-0 top-0 h-full w-[400px] glass-light z-30 overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 glass p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-akhand-accent" />
          <span className="text-xs font-medium text-akhand-text-secondary uppercase tracking-wider">
            Literary Place
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-akhand-surface-2 transition-colors"
        >
          <X className="w-4 h-4 text-akhand-text-secondary" />
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* Title section */}
        <div>
          <h2 className="text-lg font-semibold text-akhand-text-primary leading-tight">
            {place.bookTitle}
          </h2>
          <p className="text-sm text-akhand-text-secondary mt-1">
            by {place.author}
          </p>
        </div>

        {/* Place info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-akhand-surface-2 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-[10px] text-akhand-text-muted uppercase tracking-wider">
                Place
              </span>
            </div>
            <p className="text-sm font-medium text-akhand-text-primary">
              {place.placeName}
            </p>
            {place.placeType === 'fictional_based_on_real' && place.realAnchor && (
              <p className="text-[10px] text-akhand-accent mt-0.5">
                Based on: {place.realAnchor}
              </p>
            )}
          </div>

          <div className="bg-akhand-surface-2 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Calendar className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-[10px] text-akhand-text-muted uppercase tracking-wider">
                Published
              </span>
            </div>
            <p className="text-sm font-medium text-akhand-text-primary">
              {place.publishYear || 'Unknown'}
            </p>
            {place.narrativeEra && (
              <p className="text-[10px] text-akhand-text-muted mt-0.5">
                Era: {place.narrativeEra}
              </p>
            )}
          </div>

          <div className="bg-akhand-surface-2 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Globe2 className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-[10px] text-akhand-text-muted uppercase tracking-wider">
                Region
              </span>
            </div>
            <p className="text-sm font-medium text-akhand-text-primary">
              {place.region}
            </p>
          </div>

          <div className="bg-akhand-surface-2 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Languages className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-[10px] text-akhand-text-muted uppercase tracking-wider">
                Language
              </span>
            </div>
            <p className="text-sm font-medium text-akhand-text-primary">
              {place.language || 'Unknown'}
            </p>
          </div>
        </div>

        {/* Passage (only if non-empty) */}
        {hasPassage(place) && (
          <div className="bg-akhand-surface rounded-xl p-5 border border-akhand-border/50">
            <p className="italic text-sm text-akhand-literary leading-relaxed">
              &ldquo;{place.passage}&rdquo;
            </p>
            <p className="text-[10px] text-akhand-text-muted mt-3 text-right">
              — {place.bookTitle}
            </p>
          </div>
        )}

        {/* Sentiment (only if polarity is set to a meaningful value) */}
        {place.sentiment.polarity !== 0 && (
          <SentimentBar polarity={place.sentiment.polarity} />
        )}

        {/* Emotions (only if non-empty) */}
        {hasEmotions(place) && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Heart className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-xs font-medium text-akhand-text-secondary">
                Emotions
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {place.sentiment.dominantEmotions.map((emotion) => (
                <span
                  key={emotion}
                  className="px-2.5 py-1 bg-akhand-accent-dim text-akhand-accent rounded-full text-[11px] font-medium"
                >
                  {emotion.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Themes (only if non-empty) */}
        {hasThemes(place) && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-xs font-medium text-akhand-text-secondary">
                Themes
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {place.sentiment.themes.map((theme) => (
                <span
                  key={theme}
                  className="px-2.5 py-1 bg-akhand-surface-2 text-akhand-text-secondary rounded-full text-[11px]"
                >
                  {theme.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Genres (only if non-empty) */}
        {place.genres.length > 0 && (
          <div>
            <span className="text-xs font-medium text-akhand-text-secondary">
              Genres
            </span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {place.genres.map((genre) => (
                <span
                  key={genre}
                  className="px-2.5 py-1 border border-akhand-border rounded-full text-[11px] text-akhand-text-muted"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-2 pt-2 border-t border-akhand-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-akhand-text-muted">Setting type</span>
            <span className="text-akhand-text-secondary capitalize">
              {place.settingType}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-akhand-text-muted">Place type</span>
            <span className="text-akhand-text-secondary">
              {place.placeType.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-akhand-text-muted">Coordinates</span>
            <span className="text-akhand-text-secondary font-mono text-[10px]">
              {place.coordinates[1].toFixed(4)},{' '}
              {place.coordinates[0].toFixed(4)}
            </span>
          </div>
          {place.wikidataPlaceId && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-akhand-text-muted">Wikidata</span>
              <a
                href={`https://www.wikidata.org/wiki/${place.wikidataPlaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-akhand-accent hover:text-akhand-accent-hover flex items-center gap-1"
              >
                {place.wikidataPlaceId}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        {/* Related */}
        {relatedPlaces.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-akhand-text-secondary mb-3">
              Related
            </h3>
            <div className="space-y-2">
              {relatedPlaces.slice(0, 5).map((rp) => (
                <button
                  key={rp.id}
                  onClick={() => onSelectRelated?.(rp)}
                  className="w-full text-left bg-akhand-surface-2 rounded-lg p-3 cursor-pointer hover:bg-akhand-surface-3 transition-colors"
                >
                  <p className="text-xs font-medium text-akhand-text-primary">
                    {rp.bookTitle}
                  </p>
                  <p className="text-[10px] text-akhand-text-muted mt-0.5">
                    {rp.author} · {rp.placeName}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
