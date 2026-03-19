'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Sparkles, Tag } from 'lucide-react';
import type { LiteraryPlace } from '@/lib/types';

interface SimilarBook {
    title: string;
    author: string;
    score: number;
    shared_themes: string[];
}

interface SimilarBooksProps {
    currentBookTitle: string;
    currentAuthor: string;
    allPlaces: LiteraryPlace[];
    onSelectPlace?: (place: LiteraryPlace) => void;
}

export default function SimilarBooks({
    currentBookTitle,
    currentAuthor,
    allPlaces,
    onSelectPlace,
}: SimilarBooksProps) {
    const [similarBooks, setSimilarBooks] = useState<SimilarBook[]>([]);
    const [loading, setLoading] = useState(true);

    // Use the exact same key format as compute_similar.py
    const bookKey = `${currentBookTitle}||${currentAuthor}`;

    useEffect(() => {
        async function loadSimilar() {
            try {
                setLoading(true);
                const res = await fetch('/data/similar_books.json');
                if (!res.ok) throw new Error('Failed to load metadata');
                const data = await res.json();

                if (data[bookKey] && data[bookKey].length > 0) {
                    setSimilarBooks(data[bookKey]);
                } else {
                    setSimilarBooks([]);
                }
            } catch (e) {
                console.error("Failed to load similar books data", e);
                setSimilarBooks([]);
            } finally {
                setLoading(false);
            }
        }

        loadSimilar();
    }, [bookKey]);

    if (loading || similarBooks.length === 0) return null;

    return (
        <div className="bg-akhand-surface rounded-xl p-4 border border-akhand-border/50 overflow-hidden">
            <div className="flex items-center gap-1.5 mb-3">
                <Sparkles className="w-4 h-4 text-akhand-accent" />
                <h3 className="text-sm font-semibold text-white">Similar Reads</h3>
                <span className="text-[10px] text-akhand-text-muted ml-auto bg-akhand-surface-2 px-2 py-0.5 rounded-md">
                    AI Semantic Match
                </span>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {similarBooks.map((book, i) => {
                    // Find the corresponding place in our loaded memory to make it clickable
                    const placeMatch = allPlaces.find(
                        p => p.bookTitle === book.title && p.author === book.author
                    );

                    return (
                        <motion.div
                            key={`${book.title}-${i}`}
                            className={`flex-shrink-0 w-56 bg-akhand-bg border border-akhand-border rounded-lg p-3 snap-start relative ${placeMatch ? 'cursor-pointer hover:border-akhand-accent/50 transition-colors' : ''
                                }`}
                            onClick={() => {
                                if (placeMatch && onSelectPlace) {
                                    onSelectPlace(placeMatch);
                                }
                            }}
                            whileHover={placeMatch ? { y: -2 } : {}}
                        >
                            <div className="flex flex-col h-full justify-between gap-3">
                                <div>
                                    <h4 className="font-serif font-bold text-white text-sm line-clamp-2 leading-tight">
                                        {book.title}
                                    </h4>
                                    <div className="flex items-center gap-1 mt-1 text-akhand-accent text-xs">
                                        <BookOpen className="w-3 h-3" />
                                        <span className="truncate">{book.author}</span>
                                    </div>
                                </div>

                                {book.shared_themes.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-auto">
                                        {book.shared_themes.map((theme, ti) => (
                                            <span
                                                key={ti}
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-akhand-surface-2 text-akhand-text-secondary border border-white/5 truncate max-w-full"
                                            >
                                                <Tag className="w-2.5 h-2.5" />
                                                <span className="truncate">{theme.replace(/_/g, ' ')}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Visual similarity indicator */}
                                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-akhand-surface flex items-center justify-center border border-akhand-border" title={`${Math.round(book.score * 100)}% Match`}>
                                    <span className="text-[9px] font-bold text-akhand-accent">{Math.round(book.score * 100)}</span>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
