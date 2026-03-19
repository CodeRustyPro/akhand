'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Route, Clock, ChevronRight, X, Footprints, Play } from 'lucide-react';
import type { LiteraryPlace } from '@/lib/types';

interface TourResult {
    id: string;
    bookTitle: string;
    author: string;
    placeName: string;
    distance_meters: number;
    coverUrl?: string;
    coordinates?: number[]; // [lng, lat]
}

interface WalkingTourProps {
    nearbyPlaces: TourResult[];
    userLocation: { lat: number; lng: number };
    onClose: () => void;
    onSelectPlace?: (placeId: string) => void;
}

// Haversine distance in meters
function haversine(lon1: number, lat1: number, lon2: number, lat2: number) {
    const R = 6371000;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format meters nicely
function formatDist(m: number) {
    if (m < 1000) return `${Math.round(m)}m`;
    return `${(m / 1000).toFixed(1)}km`;
}

export default function WalkingTour({ nearbyPlaces, userLocation, onClose, onSelectPlace }: WalkingTourProps) {
    const [tourGenerated, setTourGenerated] = useState(false);

    // Generate a Greedy Nearest-Neighbor Tour
    const tourPath = useMemo(() => {
        if (!nearbyPlaces || nearbyPlaces.length < 2) return [];

        // Filter to those with coordinates and within 5km of user (walking distance)
        const validPlaces = nearbyPlaces.filter(p =>
            p.coordinates && p.coordinates.length === 2 && p.distance_meters <= 5000
        );

        if (validPlaces.length < 2) return [];

        // Sort initially by distance from user to start the tour at the closest point
        let unvisited = [...validPlaces].sort((a, b) => a.distance_meters - b.distance_meters);

        // Max 8 stops for a walking tour
        unvisited = unvisited.slice(0, 8);

        const ordered: (TourResult & { legDistance: number; totalDistance: number })[] = [];

        // Start with the closest point
        let current = unvisited.shift()!;
        ordered.push({ ...current, legDistance: current.distance_meters, totalDistance: current.distance_meters });

        let totalDist = current.distance_meters;

        // Greedy nearest neighbor
        while (unvisited.length > 0) {
            const currentCoords = current.coordinates!;

            let nearestIdx = 0;
            let minDistance = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                const candidateCoords = unvisited[i].coordinates!;
                const dist = haversine(
                    currentCoords[0], currentCoords[1],
                    candidateCoords[0], candidateCoords[1]
                );
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestIdx = i;
                }
            }

            const next = unvisited.splice(nearestIdx, 1)[0];
            totalDist += minDistance;
            ordered.push({
                ...next,
                legDistance: minDistance,
                totalDistance: totalDist
            });
            current = next;
        }

        return ordered;
    }, [nearbyPlaces]);

    // If we can't generate a tour
    if (!tourPath || tourPath.length < 2) {
        return (
            <div className="bg-akhand-surface rounded-xl p-6 text-center border border-akhand-border flex flex-col items-center">
                <Footprints className="w-8 h-8 text-akhand-text-muted mb-3" />
                <h4 className="text-sm font-semibold text-white">Not enough nearby locations</h4>
                <p className="text-xs text-akhand-text-secondary mt-1 max-w-[200px]">
                    We need at least 2 books within a 5km walking radius to generate a tour.
                </p>
                <button
                    onClick={onClose}
                    className="mt-4 px-4 py-2 bg-akhand-surface-2 hover:bg-white/10 text-white rounded-lg text-xs font-medium transition-colors"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const totalDistance = tourPath[tourPath.length - 1].totalDistance;
    // 80m per min walking + 8 mins reading per stop
    const walkMinutes = totalDistance / 80;
    const readingMinutes = tourPath.length * 8;
    const totalMinutes = Math.round(walkMinutes + readingMinutes);

    if (!tourGenerated) {
        return (
            <div className="bg-akhand-surface rounded-xl p-6 border border-akhand-border flex flex-col items-center justify-center min-h-[300px]">
                <div className="relative mb-6">
                    <Footprints className="w-12 h-12 text-akhand-accent animate-pulse" />
                    <Route className="w-6 h-6 text-white absolute -bottom-2 -right-2 bg-akhand-surface rounded-full p-1 border border-akhand-border" />
                </div>
                <h3 className="text-lg font-bold text-white font-serif mb-2">Create Walking Tour</h3>
                <p className="text-sm text-akhand-text-secondary text-center max-w-[250px] mb-6 leading-relaxed">
                    We found {tourPath.length} literary locations within walking distance. Let's map out a route for you to explore them physically.
                </p>

                <div className="flex gap-4 mb-8">
                    <div className="text-center">
                        <span className="block text-lg font-bold text-akhand-accent">{tourPath.length}</span>
                        <span className="text-[10px] text-akhand-text-muted uppercase tracking-wider">Stops</span>
                    </div>
                    <div className="w-px bg-akhand-border" />
                    <div className="text-center">
                        <span className="block text-lg font-bold text-akhand-accent">{formatDist(totalDistance)}</span>
                        <span className="text-[10px] text-akhand-text-muted uppercase tracking-wider">Distance</span>
                    </div>
                    <div className="w-px bg-akhand-border" />
                    <div className="text-center">
                        <span className="block text-lg font-bold text-akhand-accent">~{totalMinutes}</span>
                        <span className="text-[10px] text-akhand-text-muted uppercase tracking-wider">Minutes</span>
                    </div>
                </div>

                <div className="flex gap-3 w-full">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-akhand-surface-2 hover:bg-white/5 text-white rounded-xl text-sm font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => setTourGenerated(true)}
                        className="flex-1 py-3 bg-akhand-accent hover:bg-white text-akhand-bg space-x-2 rounded-xl text-sm font-medium shadow-lg shadow-akhand-accent/20 transition-all flex items-center justify-center"
                    >
                        <span>Start Route</span>
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-akhand-surface border border-akhand-border rounded-xl overflow-hidden flex flex-col h-[500px]"
        >
            <div className="p-4 border-b border-akhand-border bg-akhand-surface-2/50 flex items-center justify-between sticky top-0 z-10">
                <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Route className="w-4 h-4 text-akhand-accent" />
                        Literary Walk
                    </h3>
                    <p className="text-xs text-akhand-text-secondary flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3" />
                        ~{totalMinutes} mins • {tourPath.length} stops • {formatDist(totalDistance)}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X className="w-4 h-4 text-akhand-text-secondary" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-0 relative">
                {/* Continuous connection line */}
                <div className="absolute left-8 top-8 bottom-12 w-0.5 bg-akhand-border z-0" />

                {tourPath.map((stop, index) => {
                    const isFirst = index === 0;

                    return (
                        <motion.div
                            key={stop.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className="relative z-10 flex gap-4 pb-6 group"
                        >
                            {/* Timeline marker */}
                            <div className="flex flex-col items-center mt-1">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ring-4 ring-akhand-surface transition-colors ${isFirst
                                        ? 'bg-akhand-accent text-akhand-bg'
                                        : 'bg-akhand-surface-2 text-white group-hover:bg-akhand-accent/20 group-hover:text-akhand-accent'
                                    }`}>
                                    {isFirst ? <Footprints className="w-3.5 h-3.5" /> : index + 1}
                                </div>
                            </div>

                            {/* Stop Card */}
                            <div
                                className={`flex-1 p-3 rounded-xl border bg-akhand-surface transition-colors ${onSelectPlace ? 'cursor-pointer hover:border-akhand-accent/50 hover:bg-akhand-surface-2' : 'border-akhand-border'
                                    }`}
                                onClick={() => onSelectPlace && onSelectPlace(stop.id)}
                            >
                                {!isFirst && stop.legDistance > 0 && (
                                    <div className="absolute -top-3 left-14 text-[9px] font-medium text-akhand-accent bg-akhand-surface px-1.5 py-0.5 rounded border border-akhand-accent/30 flex items-center gap-1 z-20">
                                        +{formatDist(stop.legDistance)} walk
                                    </div>
                                )}

                                <h4 className="text-sm font-bold text-white mb-1 line-clamp-1">{stop.bookTitle}</h4>
                                <p className="text-[10px] text-akhand-accent mb-2">{stop.author}</p>
                                <p className="text-xs text-akhand-text-secondary flex items-start gap-1">
                                    <span className="mt-0.5 opacity-60">📍</span>
                                    <span className="line-clamp-2">{stop.placeName}</span>
                                </p>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </motion.div>
    );
}
