'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { LiteraryPlace } from '@/lib/types';
import { computeCityDna, type CityDna, type CityDnaAxis } from '@/lib/cityDna';

interface CompareCityDnaProps {
    currentCity: string;
    allPlaces: LiteraryPlace[];
}

function DualRadarChart({
    cityA,
    cityB,
    dnaA,
    dnaB,
    size = 240,
}: {
    cityA: string;
    cityB: string;
    dnaA: CityDna;
    dnaB: CityDna;
    size?: number;
}) {
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 36;
    const rings = [0.25, 0.5, 0.75, 1.0];

    // Merge all unique theme labels from both cities
    const allLabels = useMemo(() => {
        const labels = new Set<string>();
        dnaA.axes.forEach((a) => labels.add(a.label));
        dnaB.axes.forEach((a) => labels.add(a.label));
        return Array.from(labels).slice(0, 10);
    }, [dnaA, dnaB]);

    const n = allLabels.length;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;

    function polarToXY(angle: number, r: number): [number, number] {
        return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    }

    function getAxisValue(axes: CityDnaAxis[], label: string): number {
        const axis = axes.find((a) => a.label === label);
        return axis ? axis.value : 0;
    }

    // Grid rings
    const gridRings = rings.map((scale) => {
        const points = Array.from({ length: n }, (_, i) => {
            const angle = startAngle + i * angleStep;
            return polarToXY(angle, radius * scale);
        });
        return points.map(([x, y]) => `${x},${y}`).join(' ');
    });

    // Axis lines
    const axisLines = Array.from({ length: n }, (_, i) => {
        const angle = startAngle + i * angleStep;
        return polarToXY(angle, radius);
    });

    // Data polygons
    const polyA = allLabels
        .map((label, i) => {
            const angle = startAngle + i * angleStep;
            const r = Math.max(0.08, getAxisValue(dnaA.axes, label)) * radius;
            return polarToXY(angle, r);
        })
        .map(([x, y]) => `${x},${y}`)
        .join(' ');

    const polyB = allLabels
        .map((label, i) => {
            const angle = startAngle + i * angleStep;
            const r = Math.max(0.08, getAxisValue(dnaB.axes, label)) * radius;
            return polarToXY(angle, r);
        })
        .map(([x, y]) => `${x},${y}`)
        .join(' ');

    // Labels
    const labels = allLabels.map((label, i) => {
        const angle = startAngle + i * angleStep;
        const labelR = radius + 18;
        const [x, y] = polarToXY(angle, labelR);
        let anchor: 'middle' | 'start' | 'end' = 'middle';
        if (Math.cos(angle) > 0.3) anchor = 'start';
        else if (Math.cos(angle) < -0.3) anchor = 'end';
        return { x, y, text: label, anchor };
    });

    return (
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="mx-auto">
            {/* Grid rings */}
            {gridRings.map((points, i) => (
                <polygon
                    key={i}
                    points={points}
                    fill="none"
                    stroke="rgba(196,154,108,0.1)"
                    strokeWidth={i === rings.length - 1 ? 0.8 : 0.5}
                />
            ))}

            {/* Axis lines */}
            {axisLines.map(([x, y], i) => (
                <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(196,154,108,0.08)" strokeWidth={0.5} />
            ))}

            {/* City A polygon (amber) */}
            <motion.polygon
                points={polyA}
                fill="rgba(196,154,108,0.15)"
                stroke="rgba(196,154,108,0.7)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
            />

            {/* City B polygon (teal) */}
            <motion.polygon
                points={polyB}
                fill="rgba(94,234,212,0.12)"
                stroke="rgba(94,234,212,0.6)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeDasharray="4 3"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
            />

            {/* Labels */}
            {labels.map((label, i) => (
                <text
                    key={i}
                    x={label.x}
                    y={label.y}
                    textAnchor={label.anchor}
                    dominantBaseline="central"
                    className="fill-akhand-text-muted"
                    style={{ fontSize: '8px', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                    {label.text}
                </text>
            ))}
        </svg>
    );
}

export default function CompareCityDna({ currentCity, allPlaces }: CompareCityDnaProps) {
    const [compareCity, setCompareCity] = useState<string | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const currentDna = useMemo(
        () => computeCityDna(currentCity, allPlaces),
        [currentCity, allPlaces]
    );

    const availableCities = useMemo(() => {
        const counts: Record<string, number> = {};
        allPlaces.forEach((p) => {
            counts[p.placeName] = (counts[p.placeName] || 0) + 1;
        });
        return Object.entries(counts)
            .filter(([name, count]) => count >= 3 && name !== currentCity)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }));
    }, [allPlaces, currentCity]);

    const compareDna = useMemo(
        () => (compareCity ? computeCityDna(compareCity, allPlaces) : null),
        [compareCity, allPlaces]
    );

    if (!currentDna || availableCities.length === 0) return null;

    return (
        <div className="bg-akhand-surface-2 rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-3">
                <svg className="w-3.5 h-3.5 text-akhand-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                </svg>
                <span className="text-xs font-medium text-akhand-text-secondary">
                    Compare Literary DNA
                </span>
            </div>

            {/* City selector */}
            <div className="relative mb-3">
                <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-akhand-surface rounded-lg border border-akhand-border text-xs text-akhand-text-primary hover:border-akhand-accent transition-colors"
                >
                    <span>{compareCity || 'Select a city to compare...'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-akhand-text-muted transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                    {dropdownOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute top-full left-0 right-0 mt-1 bg-akhand-surface border border-akhand-border rounded-lg shadow-xl z-10 max-h-40 overflow-y-auto"
                        >
                            {availableCities.map(({ name, count }) => (
                                <button
                                    key={name}
                                    onClick={() => {
                                        setCompareCity(name);
                                        setDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-akhand-surface-2 transition-colors ${compareCity === name ? 'text-akhand-accent bg-akhand-accent-dim' : 'text-akhand-text-primary'
                                        }`}
                                >
                                    <span>{name}</span>
                                    <span className="text-akhand-text-muted">{count} books</span>
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Radar chart */}
            {compareDna ? (
                <>
                    <DualRadarChart
                        cityA={currentCity}
                        cityB={compareCity!}
                        dnaA={currentDna}
                        dnaB={compareDna}
                        size={240}
                    />

                    {/* Legend */}
                    <div className="flex items-center justify-center gap-4 mt-2 text-[10px]">
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-0.5 bg-[#c49a6c] rounded" />
                            <span className="text-akhand-text-secondary">{currentCity}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-0.5 bg-[#5eead4] rounded" style={{ borderStyle: 'dashed' }} />
                            <span className="text-akhand-text-secondary">{compareCity}</span>
                        </span>
                    </div>

                    {/* Stats comparison */}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="bg-akhand-surface rounded-lg p-2 text-center">
                            <p className="text-sm font-semibold text-akhand-accent">{currentDna.totalBooks}</p>
                            <p className="text-[9px] text-akhand-text-muted">books in {currentCity}</p>
                        </div>
                        <div className="bg-akhand-surface rounded-lg p-2 text-center">
                            <p className="text-sm font-semibold text-[#5eead4]">{compareDna.totalBooks}</p>
                            <p className="text-[9px] text-akhand-text-muted">books in {compareCity}</p>
                        </div>
                    </div>
                </>
            ) : (
                <p className="text-[11px] text-akhand-text-muted text-center py-6">
                    Select a city above to overlay its literary DNA
                </p>
            )}
        </div>
    );
}
