'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { LiteraryPlace } from '@/lib/types';

interface AuthorTimelineProps {
    author: string;
    allPlaces: LiteraryPlace[];
    onSelectPlace?: (place: LiteraryPlace) => void;
}

interface TimelineStop {
    place: LiteraryPlace;
    year: number;
    city: string;
    sentimentColor: string;
}

function getSentimentHex(polarity: number): string {
    if (polarity > 0.2) return '#4ade80';   // green
    if (polarity < -0.2) return '#ef4444';  // red
    return '#c49a6c';                        // amber/neutral
}

export default function AuthorTimeline({
    author,
    allPlaces,
    onSelectPlace,
}: AuthorTimelineProps) {
    const stops = useMemo((): TimelineStop[] => {
        const authorPlaces = allPlaces
            .filter((p) => p.author === author && p.publishYear)
            .sort((a, b) => (a.publishYear || 0) - (b.publishYear || 0));

        // Deduplicate by city+year
        const seen = new Set<string>();
        const unique: TimelineStop[] = [];
        for (const p of authorPlaces) {
            const key = `${p.placeName}-${p.publishYear}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push({
                place: p,
                year: p.publishYear,
                city: p.placeName,
                sentimentColor: getSentimentHex(p.sentiment.polarity),
            });
        }
        return unique;
    }, [author, allPlaces]);

    const uniqueCities = useMemo(() => new Set(stops.map((s) => s.city)), [stops]);

    // Only show if author has 3+ unique locations
    if (uniqueCities.size < 3) return null;

    const width = 320;
    const padding = 24;
    const dotRadius = 6;
    const lineY = 40;
    const usableWidth = width - padding * 2;
    const step = stops.length > 1 ? usableWidth / (stops.length - 1) : 0;

    return (
        <div className="bg-akhand-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
                <svg className="w-3.5 h-3.5 text-akhand-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-xs font-medium text-akhand-text-secondary">
                    Geographic journey — {stops.length} books, {uniqueCities.size} cities
                </span>
            </div>

            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
                <svg
                    width={Math.max(width, stops.length * 60 + padding * 2)}
                    height={110}
                    className="block"
                >
                    {/* Timeline line */}
                    <line
                        x1={padding}
                        y1={lineY}
                        x2={padding + (stops.length - 1) * Math.max(step, 50)}
                        y2={lineY}
                        stroke="rgba(196,154,108,0.2)"
                        strokeWidth={1.5}
                    />

                    {/* Dots + labels */}
                    {stops.map((stop, i) => {
                        const x = padding + i * Math.max(step, 50);
                        return (
                            <g key={`${stop.city}-${stop.year}-${i}`}>
                                {/* Connecting segment highlight */}
                                {i > 0 && (
                                    <motion.line
                                        x1={padding + (i - 1) * Math.max(step, 50)}
                                        y1={lineY}
                                        x2={x}
                                        y2={lineY}
                                        stroke={stop.sentimentColor}
                                        strokeWidth={2}
                                        strokeOpacity={0.4}
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: 1 }}
                                        transition={{ delay: i * 0.1, duration: 0.3 }}
                                    />
                                )}

                                {/* Dot */}
                                <motion.circle
                                    cx={x}
                                    cy={lineY}
                                    r={dotRadius}
                                    fill={stop.sentimentColor}
                                    stroke="rgba(0,0,0,0.3)"
                                    strokeWidth={1}
                                    className="cursor-pointer"
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: i * 0.08, type: 'spring', damping: 12 }}
                                    onClick={() => onSelectPlace?.(stop.place)}
                                    whileHover={{ scale: 1.4 }}
                                />

                                {/* Year label above */}
                                <motion.text
                                    x={x}
                                    y={lineY - 14}
                                    textAnchor="middle"
                                    className="fill-akhand-text-muted"
                                    style={{ fontSize: '9px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.08 + 0.2 }}
                                >
                                    {stop.year}
                                </motion.text>

                                {/* City label below */}
                                <motion.text
                                    x={x}
                                    y={lineY + 18}
                                    textAnchor="middle"
                                    className="fill-akhand-text-secondary"
                                    style={{ fontSize: '10px', fontWeight: 500, fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.08 + 0.3 }}
                                >
                                    {stop.city.length > 10 ? stop.city.slice(0, 9) + '…' : stop.city}
                                </motion.text>

                                {/* Book title below city */}
                                <motion.text
                                    x={x}
                                    y={lineY + 32}
                                    textAnchor="middle"
                                    className="fill-akhand-text-muted"
                                    style={{ fontSize: '8px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: i * 0.08 + 0.4 }}
                                >
                                    {stop.place.bookTitle.length > 14
                                        ? stop.place.bookTitle.slice(0, 13) + '…'
                                        : stop.place.bookTitle}
                                </motion.text>
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-2 text-[9px] text-akhand-text-muted">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#4ade80]" /> Positive
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#c49a6c]" /> Neutral
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#ef4444]" /> Dark
                </span>
            </div>
        </div>
    );
}
