'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Navigation, Loader2, BookOpen, Route, X, AlertCircle } from 'lucide-react';
import type { LiteraryPlace } from '@/lib/types';
import WalkingTour from './WalkingTour';

interface NearbyResult {
    id: string;
    book_title?: string;
    bookTitle?: string;
    author: string;
    place_name?: string;
    placeName?: string;
    distance_meters: number;
    cover_url?: string;
    coverUrl?: string;
    publish_year?: number;
    publishYear?: number;
    passage?: string;
    themes?: string[];
    genres?: string[];
    coordinates?: number[];
}

interface BooksNearMeProps {
    onSelectPlace?: (place: LiteraryPlace) => void;
    allPlaces?: LiteraryPlace[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function formatDistance(meters: number): string {
    if (meters < 1000) return `${Math.round(meters)}m`;
    if (meters < 10000) return `${(meters / 1000).toFixed(1)}km`;
    return `${Math.round(meters / 1000)}km`;
}

export default function BooksNearMe({ onSelectPlace, allPlaces }: BooksNearMeProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<NearbyResult[]>([]);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [isFallback, setIsFallback] = useState(false);
    const [showTour, setShowTour] = useState(false);

    const fetchNearby = useCallback(async (lat: number, lng: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `${API_BASE}/api/nearby?lat=${lat}&lng=${lng}&radius=50000&limit=15`,
                { signal: AbortSignal.timeout(10000) }
            );
            if (!res.ok) throw new Error(`API error: ${res.status}`);
            const data = await res.json();
            setResults(data.results || []);
            setIsFallback(data.fallback || false);
        } catch (err) {
            // Client-side fallback using Haversine
            if (allPlaces && allPlaces.length > 0) {
                const haversine = (lon1: number, lat1: number, lon2: number, lat2: number) => {
                    const R = 6371000;
                    const p1 = (lat1 * Math.PI) / 180;
                    const p2 = (lat2 * Math.PI) / 180;
                    const dp = ((lat2 - lat1) * Math.PI) / 180;
                    const dl = ((lon2 - lon1) * Math.PI) / 180;
                    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
                    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                };

                const nearby = allPlaces
                    .map((p) => ({
                        ...p,
                        bookTitle: p.bookTitle,
                        placeName: p.placeName,
                        distance_meters: haversine(lng, lat, p.coordinates[0], p.coordinates[1]),
                    }))
                    .sort((a, b) => a.distance_meters - b.distance_meters)
                    .slice(0, 15);

                setResults(nearby as unknown as NearbyResult[]);
                setIsFallback(true);
            } else {
                setError('Unable to find nearby books. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [allPlaces]);

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser');
            return;
        }

        setLoading(true);
        setError(null);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
                setUserLocation(loc);
                fetchNearby(loc.lat, loc.lng);
            },
            (posError) => {
                setLoading(false);
                if (posError.code === posError.PERMISSION_DENIED) {
                    setError('Location permission denied. Enable location access in your browser settings.');
                } else if (posError.code === posError.TIMEOUT) {
                    setError('Location request timed out. Please try again.');
                } else {
                    setError('Unable to determine your location.');
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }, [fetchNearby]);

    const handleOpen = useCallback(() => {
        setIsOpen(true);
        if (!userLocation) {
            requestLocation();
        }
    }, [userLocation, requestLocation]);

    const getTitle = (r: NearbyResult) => r.book_title || r.bookTitle || '';
    const getPlace = (r: NearbyResult) => r.place_name || r.placeName || '';
    const getCover = (r: NearbyResult) => r.cover_url || r.coverUrl || '';
    const getYear = (r: NearbyResult) => r.publish_year || r.publishYear || 0;

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={handleOpen}
                className="flex items-center gap-2 px-3 py-2 bg-akhand-accent/10 hover:bg-akhand-accent/20 text-akhand-accent rounded-lg text-xs font-medium transition-colors"
            >
                <Navigation className="w-3.5 h-3.5" />
                Books Near Me
            </button>

            {/* Modal overlay */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 z-40"
                            onClick={() => setIsOpen(false)}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[420px] max-h-[80vh] bg-akhand-surface border border-akhand-border rounded-2xl z-50 overflow-hidden flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-akhand-border">
                                <div className="flex items-center gap-2">
                                    <Navigation className="w-4 h-4 text-akhand-accent" />
                                    <h3 className="text-sm font-semibold text-akhand-text-primary">
                                        {showTour ? 'Literary Tour' : 'Books Near Me'}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1.5 rounded-lg hover:bg-akhand-surface-2 transition-colors"
                                >
                                    <X className="w-4 h-4 text-akhand-text-secondary" />
                                </button>
                            </div>

                            {/* Content */}
                            {showTour && userLocation ? (
                                <WalkingTour
                                    nearbyPlaces={results as any}
                                    userLocation={userLocation}
                                    onClose={() => setShowTour(false)}
                                    onSelectPlace={(id) => {
                                        if (onSelectPlace && allPlaces) {
                                            const match = allPlaces.find(p => p.id === id);
                                            if (match) {
                                                onSelectPlace(match);
                                                setIsOpen(false);
                                            }
                                        }
                                    }}
                                />
                            ) : (
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                                    {loading && (
                                        <div className="flex flex-col items-center justify-center py-12 flex-1">
                                            <Loader2 className="w-6 h-6 text-akhand-accent animate-spin" />
                                            <p className="text-xs text-akhand-text-muted mt-3">
                                                {userLocation ? 'Finding books near you...' : 'Getting your location...'}
                                            </p>
                                        </div>
                                    )}

                                    {error && (
                                        <div className="flex flex-col items-center justify-center py-8">
                                            <AlertCircle className="w-6 h-6 text-akhand-negative mb-2" />
                                            <p className="text-xs text-akhand-text-secondary text-center max-w-[280px]">{error}</p>
                                            <button
                                                onClick={requestLocation}
                                                className="mt-3 px-4 py-2 bg-akhand-accent/10 text-akhand-accent rounded-lg text-xs font-medium hover:bg-akhand-accent/20 transition-colors"
                                            >
                                                Try Again
                                            </button>
                                        </div>
                                    )}

                                    {!loading && !error && results.length > 0 && (
                                        <>
                                            {isFallback && (
                                                <p className="text-[10px] text-akhand-text-muted mb-3 text-center">
                                                    Showing nearest books (none within 50km)
                                                </p>
                                            )}

                                            <div className="space-y-2">
                                                {results.map((r, i) => (
                                                    <motion.button
                                                        key={r.id || i}
                                                        initial={{ opacity: 0, x: -12 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        onClick={() => {
                                                            if (onSelectPlace && allPlaces) {
                                                                const match = allPlaces.find(
                                                                    (p) => p.id === r.id || p.bookTitle === getTitle(r)
                                                                );
                                                                if (match) {
                                                                    onSelectPlace(match);
                                                                    setIsOpen(false);
                                                                }
                                                            }
                                                        }}
                                                        className="w-full flex items-start gap-3 p-3 bg-akhand-surface-2 rounded-xl hover:bg-akhand-surface-2/80 transition-colors text-left"
                                                    >
                                                        {/* Cover */}
                                                        {getCover(r) && (
                                                            <img
                                                                src={getCover(r)}
                                                                alt=""
                                                                className="w-10 h-14 rounded object-cover flex-shrink-0"
                                                                onError={(e) => {
                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                        )}

                                                        {/* Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium text-akhand-text-primary leading-tight line-clamp-2">
                                                                {getTitle(r)}
                                                            </p>
                                                            <p className="text-[10px] text-akhand-text-muted mt-0.5">{r.author}</p>
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                <span className="flex items-center gap-0.5 text-[10px] text-akhand-accent">
                                                                    <MapPin className="w-2.5 h-2.5" />
                                                                    {getPlace(r)}
                                                                </span>
                                                                {getYear(r) > 0 && (
                                                                    <span className="text-[10px] text-akhand-text-muted">{getYear(r)}</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Distance */}
                                                        <div className="flex-shrink-0 text-right">
                                                            <span className="text-xs font-semibold text-akhand-accent">
                                                                {formatDistance(r.distance_meters)}
                                                            </span>
                                                        </div>
                                                    </motion.button>
                                                ))}

                                                {/* Walking Tour Trigger */}
                                                {results.length >= 2 && !isFallback && (
                                                    <motion.button
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        onClick={() => setShowTour(true)}
                                                        className="w-full mt-4 py-3 bg-akhand-accent/20 border border-akhand-accent/30 text-akhand-accent rounded-xl text-sm font-medium hover:bg-akhand-accent/30 hover:border-akhand-accent/50 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <Route className="w-4 h-4" />
                                                        Generate Walking Tour
                                                    </motion.button>
                                                )}
                                            </div>
                                        </>
                                    )}

                                    {!loading && !error && results.length === 0 && userLocation && (
                                        <div className="flex flex-col items-center justify-center py-12">
                                            <BookOpen className="w-6 h-6 text-akhand-text-muted mb-2" />
                                            <p className="text-xs text-akhand-text-muted">No books found near your location</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Footer */}
                            {!showTour && userLocation && results.length > 0 && (
                                <div className="p-3 border-t border-akhand-border flex items-center justify-between">
                                    <span className="text-[10px] text-akhand-text-muted">
                                        📍 {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
                                    </span>
                                    <button
                                        onClick={requestLocation}
                                        className="text-[10px] text-akhand-accent hover:text-akhand-accent-hover transition-colors"
                                    >
                                        Refresh
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
