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
  Star,
  Info,
  Sparkles,
} from 'lucide-react';
import type { LiteraryPlace } from '@/lib/types';
import { useMemo, useState, useEffect } from 'react';
import {
  fetchGoogleBookInfo,
  fetchWikipediaSummary,
  type GoogleBookInfo,
  type WikipediaSummary,
} from '@/lib/external';
import { computeCityDna } from '@/lib/cityDna';
import RadarChart from './RadarChart';

interface PlaceDetailProps {
  place: LiteraryPlace;
  allPlaces: LiteraryPlace[];
  onClose: () => void;
  onSelectRelated?: (place: LiteraryPlace) => void;
  onViewAuthor?: (author: string) => void;
  onFilterGenre?: (genre: string) => void;
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
  onViewAuthor,
  onFilterGenre,
}: PlaceDetailProps) {
  const [gbInfo, setGbInfo] = useState<GoogleBookInfo | null>(null);
  const [wikiInfo, setWikiInfo] = useState<WikipediaSummary | null>(null);
  const [gbLoading, setGbLoading] = useState(false);
  const [wikiLoading, setWikiLoading] = useState(false);

  useEffect(() => {
    setGbInfo(null);
    setWikiInfo(null);
    setGbLoading(true);
    setWikiLoading(true);
    fetchGoogleBookInfo(place.bookTitle, place.author).then((info) => {
      setGbInfo(info);
      setGbLoading(false);
    });
    fetchWikipediaSummary(place.placeName).then((info) => {
      setWikiInfo(info);
      setWikiLoading(false);
    });
  }, [place.id, place.bookTitle, place.author, place.placeName]);

  const similarBooks = useMemo(() => {
    const placeGenres = new Set(place.genres);
    const placeThemes = new Set(place.sentiment.themes);

    return allPlaces
      .filter((p) => p.id !== place.id)
      .map((p) => {
        let score = 0;
        const reasons: string[] = [];

        if (p.placeName === place.placeName) {
          score += 3;
          reasons.push('Same city');
        }
        if (p.region === place.region && p.placeName !== place.placeName) score += 1;

        const sharedGenres = p.genres.filter((g) => placeGenres.has(g));
        score += sharedGenres.length * 2;
        if (sharedGenres.length > 0) {
          reasons.push(`Shared: ${sharedGenres.slice(0, 2).join(', ')}`);
        }

        const sharedThemes = p.sentiment.themes.filter((t) => placeThemes.has(t));
        score += sharedThemes.length * 2;
        if (sharedThemes.length > 0 && reasons.length < 2) {
          reasons.push(`Themes: ${sharedThemes.slice(0, 2).map((t) => t.replace(/_/g, ' ')).join(', ')}`);
        }

        const yearDiff = Math.abs((p.publishYear || 0) - (place.publishYear || 0));
        if (yearDiff < 20) {
          score += 1;
          if (reasons.length < 2) reasons.push('Similar era');
        }

        if (p.language === place.language && place.language !== 'English') {
          score += 2;
          if (reasons.length < 2) reasons.push(`Both in ${p.language}`);
        }

        return { place: p, score, reasons };
      })
      .filter((s) => s.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [place, allPlaces]);

  const cityStats = useMemo(() => {
    const cityPlaces = allPlaces.filter((p) => p.placeName === place.placeName);
    const authors = new Set(cityPlaces.map((p) => p.author));
    const langs = new Set(cityPlaces.map((p) => p.language).filter(Boolean));
    const decades = new Map<string, number>();
    cityPlaces.forEach((p) => {
      if (p.publishYear) {
        const decade = `${Math.floor(p.publishYear / 10) * 10}s`;
        decades.set(decade, (decades.get(decade) || 0) + 1);
      }
    });
    return {
      total: cityPlaces.length,
      authors: authors.size,
      languages: langs.size,
      topDecades: [...decades.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([d]) => d),
    };
  }, [place.placeName, allPlaces]);

  const cityDna = useMemo(
    () => computeCityDna(place.placeName, allPlaces),
    [place.placeName, allPlaces]
  );

  const readUrl = place.openLibraryUrl || place.goodreadsUrl;
  const readLabel = place.openLibraryUrl ? 'Open Library' : 'Google Books';

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
        {/* Cover + Title */}
        <div className="flex gap-4">
          {place.coverUrl && (
            <div className="flex-shrink-0">
              <img
                src={place.coverUrl}
                alt={place.bookTitle}
                className="w-20 h-auto rounded-lg shadow-md object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-akhand-text-primary leading-tight">
              {place.bookTitle}
            </h2>
            <button
              onClick={() => onViewAuthor?.(place.author)}
              className="text-sm text-akhand-text-secondary mt-1 hover:text-akhand-accent transition-colors text-left"
            >
              by {place.author}
            </button>
            <div className="flex items-center gap-3 mt-2">
              {readUrl && (
                <a
                  href={readUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-akhand-accent hover:text-akhand-accent-hover transition-colors"
                >
                  {readLabel}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {gbInfo?.previewLink && (
                <a
                  href={gbInfo.previewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-akhand-text-secondary hover:text-akhand-accent transition-colors"
                >
                  Preview
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {gbInfo?.rating && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3 h-3 ${
                        s <= Math.round(gbInfo.rating!)
                          ? 'text-yellow-500 fill-yellow-500'
                          : 'text-akhand-border'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-akhand-text-muted">
                  {gbInfo.rating.toFixed(1)}
                  {gbInfo.ratingsCount ? ` (${gbInfo.ratingsCount})` : ''}
                </span>
              </div>
            )}
          </div>
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
                <button
                  key={genre}
                  onClick={() => onFilterGenre?.(genre)}
                  className="px-2.5 py-1 border border-akhand-border rounded-full text-[11px] text-akhand-text-muted hover:border-akhand-accent hover:text-akhand-accent transition-colors cursor-pointer"
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* City profile */}
        {cityStats.total > 1 && (
          <div className="bg-akhand-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <MapPin className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-xs font-medium text-akhand-text-secondary">
                {place.placeName} in fiction
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-lg font-semibold text-akhand-accent">{cityStats.total}</p>
                <p className="text-[10px] text-akhand-text-muted">books</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-akhand-text-primary">{cityStats.authors}</p>
                <p className="text-[10px] text-akhand-text-muted">authors</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-akhand-text-primary">{cityStats.languages}</p>
                <p className="text-[10px] text-akhand-text-muted">languages</p>
              </div>
            </div>
            {cityStats.topDecades.length > 0 && (
              <p className="text-[10px] text-akhand-text-muted mt-3 text-center">
                Most active: {cityStats.topDecades.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* City Literary DNA */}
        {cityDna && (
          <div className="bg-akhand-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-xs font-medium text-akhand-text-secondary">
                {place.placeName} Literary DNA
              </span>
            </div>
            <p className="text-[10px] text-akhand-text-muted mb-3">
              Theme fingerprint across {cityDna.totalBooks} books ({cityDna.totalThemes} unique themes)
            </p>
            <RadarChart axes={cityDna.axes} size={240} />
          </div>
        )}

        {/* Wikipedia context */}
        {wikiInfo && (
          <div className="bg-akhand-surface rounded-xl p-4 border border-akhand-border/50">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-xs font-medium text-akhand-text-secondary">
                About {place.placeName}
              </span>
            </div>
            <p className="text-xs text-akhand-text-secondary leading-relaxed">
              {wikiInfo.extract.length > 250
                ? wikiInfo.extract.slice(0, 250) + '...'
                : wikiInfo.extract}
            </p>
            <a
              href={wikiInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-akhand-accent mt-2 hover:text-akhand-accent-hover"
            >
              Wikipedia <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}

        {/* Similar books — horizontal scroll */}
        {similarBooks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-akhand-accent" />
              <span className="text-xs font-medium text-akhand-text-secondary">
                Similar books
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 -mx-5 px-5">
              {similarBooks.map((item) => (
                <button
                  key={item.place.id}
                  onClick={() => onSelectRelated?.(item.place)}
                  className="flex-shrink-0 w-[140px] snap-start bg-akhand-surface-2 rounded-xl p-3 cursor-pointer hover:bg-akhand-surface-3 transition-colors text-left"
                >
                  {item.place.coverUrl && (
                    <img
                      src={item.place.coverUrl}
                      alt=""
                      className="w-full h-[140px] rounded-lg object-cover mb-2"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  )}
                  <p className="text-[11px] font-medium text-akhand-text-primary leading-tight line-clamp-2">
                    {item.place.bookTitle}
                  </p>
                  <p className="text-[10px] text-akhand-text-muted mt-0.5 truncate">
                    {item.place.author}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.reasons.slice(0, 2).map((reason) => (
                      <span
                        key={reason}
                        className="px-1.5 py-0.5 bg-akhand-accent/10 text-akhand-accent rounded text-[9px] leading-tight"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
