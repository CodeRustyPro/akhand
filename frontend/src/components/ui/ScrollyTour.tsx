'use client';

import { useEffect, useState } from 'react';
import scrollama from 'scrollama';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, Navigation } from 'lucide-react';
import type { LiteraryPlace, MapViewState } from '@/lib/types';
import { sentimentColor } from '@/lib/data';

interface TourStop {
    id: string;
    placeId: string;
    title: string;
    author: string;
    text: string;
    viewState: MapViewState;
    sentiment: number;
}

// Hardcoded Mumbai literary tour for the demo
const MUMBAI_TOUR: TourStop[] = [
    {
        id: 'intro',
        placeId: '',
        title: 'A Literary Tour of Mumbai',
        author: 'Introduction',
        text: 'Mumbai is a city of extreme contrasts—where unimaginable wealth sits beside deep poverty. This tour explores how five authors have captured the essence of the city.',
        viewState: { longitude: 72.8777, latitude: 19.076, zoom: 10, pitch: 45, bearing: -15 },
        sentiment: 0,
    },
    {
        id: 'midnight',
        placeId: 'midnights-children-mumbai',
        title: "Midnight's Children",
        author: 'Salman Rushdie',
        text: '"I was born in the city of Bombay... once upon a time. No, that won\'t do, there\'s no getting away from the date: I was born in Doctor Narlikar\'s Nursing Home on August 15th, 1947." Rushdie captures the magical realism of Malabar Hill and the birth of a nation.',
        viewState: { longitude: 72.805, latitude: 18.955, zoom: 14, pitch: 60, bearing: -30 },
        sentiment: +0.6,
    },
    {
        id: 'shantaram',
        placeId: 'shantaram-mumbai',
        title: 'Shantaram',
        author: 'Gregory David Roberts',
        text: 'Leopold Café is where deals are made, passports are forged, and the city\'s underworld breathes. Roberts pulls us into the intoxicating, chaotic heat of Colaba.',
        viewState: { longitude: 72.8327, latitude: 18.9229, zoom: 16, pitch: 50, bearing: 10 },
        sentiment: -0.2,
    },
    {
        id: 'beautiful-forevers',
        placeId: 'behind-beautiful-forevers-mumbai',
        title: 'Behind the Beautiful Forevers',
        author: 'Katherine Boo',
        text: 'In Annawadi, a makeshift settlement in the shadow of luxury hotels near the airport, survival is a daily battle. Boo’s journalism reads like a tragic novel of inequality.',
        viewState: { longitude: 72.874, latitude: 19.097, zoom: 15, pitch: 55, bearing: 45 },
        sentiment: -0.8,
    },
    {
        id: 'sacred-games',
        placeId: 'sacred-games-mumbai',
        title: 'Sacred Games',
        author: 'Vikram Chandra',
        text: 'A sprawling epic of cops and gangsters. The sprawling slums, glittering towers, and political corruption intertwine in this masterclass of Mumbai noir.',
        viewState: { longitude: 72.84, latitude: 19.035, zoom: 13, pitch: 45, bearing: 0 },
        sentiment: -0.4,
    },
];

interface ScrollyTourProps {
    onFlyTo: (viewState: MapViewState) => void;
    onClose: () => void;
}

export default function ScrollyTour({ onFlyTo, onClose }: ScrollyTourProps) {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    useEffect(() => {
        // Initialize scrollama
        const scroller = scrollama();

        scroller
            .setup({
                step: '.scrolly-step',
                offset: 0.5,
            })
            .onStepEnter(({ index, direction }) => {
                setCurrentStepIndex(index);
                const stop = MUMBAI_TOUR[index];
                if (stop) {
                    onFlyTo(stop.viewState);
                }
            });

        // Handle resizing
        window.addEventListener('resize', scroller.resize);

        // Initial fly to the first step
        if (MUMBAI_TOUR[0]) {
            onFlyTo(MUMBAI_TOUR[0].viewState);
        }

        return () => {
            scroller.destroy();
            window.removeEventListener('resize', scroller.resize);
        };
    }, [onFlyTo]);

    return (
        <div className="absolute inset-x-0 top-0 bottom-0 z-30 pointer-events-none overflow-y-auto scrollbar-hide">
            {/* Tour Header overlay */}
            <div className="sticky top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-auto">
                <div className="glass px-4 py-2 rounded-full border border-akhand-accent/30 shadow-lg flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-akhand-accent" />
                    <span className="text-sm font-medium text-akhand-text">Mumbai Literary Tour</span>
                </div>
                <button
                    onClick={onClose}
                    className="glass p-2 rounded-full hover:bg-akhand-surface-2 transition-colors border-white/10"
                    title="Exit Tour"
                >
                    <X className="w-5 h-5 text-akhand-text-secondary" />
                </button>
            </div>

            <div className="mt-[40vh] pb-[60vh] max-w-md mx-auto px-4 md:ml-12 lg:ml-24">
                {MUMBAI_TOUR.map((stop, i) => {
                    const isActive = currentStepIndex === i;
                    const [r, g, b] = sentimentColor(stop.sentiment);

                    return (
                        <motion.div
                            key={stop.id}
                            className={`scrolly-step mb-[60vh] glass rounded-2xl p-6 pointer-events-auto shadow-xl transition-all duration-700 ease-out border-l-4 ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-95'
                                }`}
                            style={{
                                borderLeftColor: `rgb(${r}, ${g}, ${b})`,
                            }}
                            layout
                        >
                            <h3 className="text-2xl font-bold font-serif mb-1 text-white">{stop.title}</h3>
                            <p className="text-akhand-accent text-sm font-medium mb-4 flex items-center gap-2">
                                <BookOpen className="w-4 h-4" />
                                {stop.author}
                            </p>
                            <p className="text-akhand-text-secondary leading-relaxed">
                                {stop.text}
                            </p>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
