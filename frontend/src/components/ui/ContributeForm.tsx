'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Book, MapPin, Type, Check, Loader2, Search, ArrowRight, ArrowLeft } from 'lucide-react';
import { THEMES } from '@/lib/data';

interface ContributeFormProps {
    onClose: () => void;
}

const STEPS = [
    { id: 'book', title: 'Book Info', icon: Book },
    { id: 'location', title: 'Location', icon: MapPin },
    { id: 'passage', title: 'Passage & Themes', icon: Type },
];

export default function ContributeForm({ onClose }: ContributeFormProps) {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form Data
    const [bookTitle, setBookTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [publishYear, setPublishYear] = useState('');

    const [placeName, setPlaceName] = useState('');
    const [lat, setLat] = useState<number | null>(null);
    const [lng, setLng] = useState<number | null>(null);

    const [passage, setPassage] = useState('');
    const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

    // Search results
    const [bookResults, setBookResults] = useState<any[]>([]);
    const [geoResults, setGeoResults] = useState<any[]>([]);
    const [isSearchingBook, setIsSearchingBook] = useState(false);
    const [isSearchingGeo, setIsSearchingGeo] = useState(false);

    // 1. Open Library API Search
    const handleBookSearch = async (query: string) => {
        setBookTitle(query);
        if (query.length < 3) return setBookResults([]);

        setIsSearchingBook(true);
        try {
            const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            setBookResults(data.docs || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingBook(false);
        }
    };

    const selectBook = (doc: any) => {
        setBookTitle(doc.title);
        setAuthor(doc.author_name?.[0] || '');
        setPublishYear(doc.first_publish_year?.toString() || '');
        setBookResults([]);
    };

    // 2. Nominatim Geocoding API Search
    const handleGeoSearch = async (query: string) => {
        setPlaceName(query);
        if (query.length < 3) return setGeoResults([]);

        setIsSearchingGeo(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
            const data = await res.json();
            setGeoResults(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingGeo(false);
        }
    };

    const selectGeo = (place: any) => {
        setPlaceName(place.display_name.split(',')[0]);
        setLat(parseFloat(place.lat));
        setLng(parseFloat(place.lon));
        setGeoResults([]);
    };

    const toggleTheme = (theme: string) => {
        setSelectedThemes(prev =>
            prev.includes(theme)
                ? prev.filter(t => t !== theme)
                : prev.length < 5 ? [...prev, theme] : prev
        );
    };

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    const handleSubmit = async () => {
        if (!bookTitle || !author || !placeName || !lat || !lng || !passage) {
            setError("Please fill out all required fields.");
            return;
        }

        setLoading(true);
        setError(null);

        const payload = {
            book_title: bookTitle,
            author: author,
            publish_year: parseInt(publishYear) || null,
            place_name: placeName,
            coordinates: [lng, lat],
            passage: passage,
            themes: selectedThemes,
            language: "English" // Defaulting to English for community submissions for now
        };

        try {
            const res = await fetch(`${API_BASE}/api/contribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to submit contribution");

            setSuccess(true);
        } catch (err: any) {
            setError(err.message || "An error occurred");
        } finally {
            setLoading(false);
        }
    };

    const renderStep = () => {
        switch (step) {
            case 0:
                return (
                    <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                        <div>
                            <label className="block text-xs font-semibold text-akhand-text-secondary mb-1.5 uppercase tracking-wider">Book Title *</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={bookTitle}
                                    onChange={(e) => handleBookSearch(e.target.value)}
                                    placeholder="e.g. The God of Small Things"
                                    className="w-full bg-akhand-bg border border-akhand-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-akhand-accent transition-colors block"
                                />
                                {isSearchingBook && <Loader2 className="absolute right-3 top-3 w-4 h-4 text-akhand-text-muted animate-spin" />}
                            </div>

                            {bookResults.length > 0 && (
                                <div className="absolute z-10 w-[calc(100%-3rem)] mt-1 bg-akhand-surface border border-akhand-border rounded-xl shadow-xl overflow-hidden text-sm max-h-48 overflow-y-auto">
                                    {bookResults.map((r, i) => (
                                        <button
                                            key={i}
                                            onClick={() => selectBook(r)}
                                            className="w-full text-left px-4 py-2 hover:bg-akhand-surface-2 transition-colors border-b border-akhand-border/50 last:border-0"
                                        >
                                            <div className="font-medium text-white">{r.title}</div>
                                            <div className="text-xs text-akhand-text-muted">{r.author_name?.[0]} ({r.first_publish_year})</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-2">
                                <label className="block text-xs font-semibold text-akhand-text-secondary mb-1.5 uppercase tracking-wider">Author *</label>
                                <input
                                    type="text"
                                    value={author}
                                    onChange={(e) => setAuthor(e.target.value)}
                                    placeholder="Arundhati Roy"
                                    className="w-full bg-akhand-bg border border-akhand-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-akhand-accent transition-colors line-clamp-1"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-akhand-text-secondary mb-1.5 uppercase tracking-wider">Year</label>
                                <input
                                    type="text"
                                    value={publishYear}
                                    onChange={(e) => setPublishYear(e.target.value)}
                                    placeholder="1997"
                                    className="w-full bg-akhand-bg border border-akhand-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-akhand-accent transition-colors"
                                />
                            </div>
                        </div>
                    </div>
                );
            case 1:
                return (
                    <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
                        <div>
                            <label className="block text-xs font-semibold text-akhand-text-secondary mb-1.5 uppercase tracking-wider">Location Mentioned *</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={placeName}
                                    onChange={(e) => handleGeoSearch(e.target.value)}
                                    placeholder="e.g. Ayemenem, Kerala"
                                    className="w-full bg-akhand-bg border border-akhand-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-akhand-accent transition-colors block"
                                />
                                {isSearchingGeo && <Loader2 className="absolute right-3 top-3 w-4 h-4 text-akhand-text-muted animate-spin" />}
                            </div>

                            {geoResults.length > 0 && (
                                <div className="absolute z-10 w-[calc(100%-3rem)] mt-1 bg-akhand-surface border border-akhand-border rounded-xl shadow-xl overflow-hidden text-sm max-h-48 overflow-y-auto">
                                    {geoResults.map((r, i) => (
                                        <button
                                            key={i}
                                            onClick={() => selectGeo(r)}
                                            className="w-full text-left px-4 py-2 hover:bg-akhand-surface-2 transition-colors border-b border-akhand-border/50 last:border-0"
                                        >
                                            <div className="font-medium text-white">{r.display_name.split(',')[0]}</div>
                                            <div className="text-xs text-akhand-text-muted">{r.display_name}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {lat && lng && (
                            <div className="bg-akhand-bg/50 border border-akhand-accent/20 rounded-xl p-4 flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium text-white flex items-center gap-2">
                                        <MapPin className="w-3.5 h-3.5 text-akhand-accent" />
                                        Geocoded Location
                                    </div>
                                    <div className="text-[10px] text-akhand-text-muted mt-1 font-mono">
                                        {lat.toFixed(4)}, {lng.toFixed(4)}
                                    </div>
                                </div>
                                <div className="w-8 h-8 bg-akhand-accent/20 rounded-full flex items-center justify-center text-akhand-accent">
                                    <Check className="w-4 h-4" />
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 2:
                return (
                    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 flex flex-col h-full">
                        <div>
                            <label className="block text-xs font-semibold text-akhand-text-secondary mb-1.5 uppercase tracking-wider">Literary Passage *</label>
                            <textarea
                                value={passage}
                                onChange={(e) => setPassage(e.target.value)}
                                placeholder="Paste the excerpt describing this location..."
                                rows={5}
                                className="w-full bg-akhand-bg border border-akhand-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-akhand-accent transition-colors resize-none"
                            />
                        </div>

                        <div className="flex-1">
                            <label className="block text-xs font-semibold text-akhand-text-secondary mb-1.5 uppercase tracking-wider">
                                Themes <span className="text-akhand-text-muted lowercase normal-case">(max 5)</span>
                            </label>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 scrollbar-hide pb-2">
                                {THEMES.map((theme: string) => {
                                    const isSelected = selectedThemes.includes(theme);
                                    return (
                                        <button
                                            key={theme}
                                            onClick={() => toggleTheme(theme)}
                                            className={`text-[10px] px-2.5 py-1.5 rounded-full border transition-all ${isSelected
                                                ? 'bg-akhand-accent text-akhand-bg border-akhand-accent font-bold'
                                                : 'bg-akhand-bg text-akhand-text-secondary border-akhand-border hover:border-akhand-text-muted'
                                                }`}
                                        >
                                            {theme.replace(/_/g, ' ')}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {error && <div className="text-xs text-akhand-negative px-1">{error}</div>}
                    </div>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-lg bg-akhand-surface border border-akhand-border rounded-2xl shadow-2xl relative flex flex-col h-[600px] overflow-hidden"
            >
                {/* Header */}
                <div className="p-5 border-b border-akhand-border flex justify-between items-center bg-akhand-surface z-10">
                    <h2 className="text-lg font-serif font-bold text-white tracking-wide">Contribute to Akhand</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-akhand-text-muted hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {success ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-16 h-16 bg-akhand-positive/10 rounded-full flex items-center justify-center mb-6">
                            <Check className="w-8 h-8 text-akhand-positive" />
                        </div>
                        <h3 className="text-2xl font-serif font-bold text-white mb-2">Thank you!</h3>
                        <p className="text-akhand-text-secondary text-sm max-w-[280px]">
                            Your contribution has been submitted. It will appear on the map once verified by our team.
                        </p>
                        <button
                            onClick={onClose}
                            className="mt-8 px-8 py-3 bg-akhand-surface-2 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-colors"
                        >
                            Close Window
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Stepper */}
                        <div className="px-6 py-4 flex items-center justify-between border-b border-akhand-border/50">
                            {STEPS.map((s, i) => (
                                <div key={s.id} className="flex flex-col items-center gap-1.5 relative w-1/3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors z-10 border-2 ${i < step ? 'bg-akhand-accent border-akhand-accent text-akhand-bg' :
                                        i === step ? 'bg-akhand-surface border-akhand-accent text-akhand-accent' :
                                            'bg-akhand-bg border-akhand-border text-akhand-text-muted'
                                        }`}>
                                        {i < step ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                                    </div>
                                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${i <= step ? 'text-akhand-text-primary' : 'text-akhand-text-muted'
                                        }`}>{s.title}</span>

                                    {i < STEPS.length - 1 && (
                                        <div className={`absolute top-4 left-[calc(50%+1rem)] right-[calc(-50%+1rem)] h-0.5 -translate-y-1/2 ${i < step ? 'bg-akhand-accent' : 'bg-akhand-border'
                                            }`} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Form Content */}
                        <div className="flex-1 p-6 overflow-y-auto">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={step}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.2 }}
                                    className="h-full"
                                >
                                    {renderStep()}
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* Footer / Navigation */}
                        <div className="p-5 border-t border-akhand-border bg-akhand-surface-2/30 flex justify-between items-center z-10">
                            <button
                                onClick={() => setStep(s => Math.max(0, s - 1))}
                                disabled={step === 0 || loading}
                                className="px-5 py-2.5 text-sm font-medium text-akhand-text-secondary hover:text-white disabled:opacity-30 transition-colors flex items-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back
                            </button>

                            {step < STEPS.length - 1 ? (
                                <button
                                    onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                                    disabled={
                                        (step === 0 && (!bookTitle || !author)) ||
                                        (step === 1 && (!placeName || !lat || !lng))
                                    }
                                    className="px-6 py-2.5 bg-akhand-accent hover:bg-akhand-accent-hover text-akhand-bg rounded-xl text-sm font-bold disabled:opacity-50 disabled:hover:bg-akhand-accent transition-colors flex items-center gap-2"
                                >
                                    Continue <ArrowRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading || !passage}
                                    className="px-8 py-2.5 bg-akhand-positive hover:bg-[#6edc8e] text-akhand-bg rounded-xl text-sm font-bold disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg shadow-akhand-positive/20"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Submit Entry
                                </button>
                            )}
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    );
}
