'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, BookOpen, Calendar, ChevronDown } from 'lucide-react';
import { getTourBySlug } from '@/lib/tours';
import type { Tour } from '@/lib/tours';

const TourMap = dynamic(() => import('@/components/map/TourMap'), { ssr: false });

export default function StoryPageClient({ slug }: { slug: string }) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const stepsRef = useRef<HTMLDivElement[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const found = getTourBySlug(slug);
    if (found) setTour(found);
  }, [slug]);

  // IntersectionObserver for scroll-triggered map transitions
  useEffect(() => {
    if (!tour) return;

    const observers: IntersectionObserver[] = [];

    stepsRef.current.forEach((el, i) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveStep(i);
            }
          });
        },
        { threshold: 0.5 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, [tour]);

  const setStepRef = useCallback((el: HTMLDivElement | null, index: number) => {
    if (el) stepsRef.current[index] = el;
  }, []);

  if (!tour) {
    return (
      <div className="min-h-screen bg-akhand-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-akhand-text-muted text-lg">Tour not found</p>
          <Link
            href="/"
            className="mt-4 inline-flex items-center gap-2 text-akhand-accent hover:text-akhand-accent-hover text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-akhand-bg">
      {/* Fixed nav */}
      <nav className="fixed top-0 w-full z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-akhand-text-secondary hover:text-akhand-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Akhand</span>
          </Link>
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-akhand-accent" />
            <span className="text-xs font-medium text-akhand-text-muted uppercase tracking-wider">
              Literary Tour
            </span>
          </div>
          <Link
            href="/explore"
            className="text-sm text-akhand-accent hover:text-akhand-accent-hover transition-colors"
          >
            Explore Map
          </Link>
        </div>
      </nav>

      {/* Progress dots */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col gap-2">
        {tour.stops.map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full transition-all duration-300"
            style={{
              background: i === activeStep ? '#c49a6c' : 'rgba(196,154,108,0.2)',
              boxShadow: i === activeStep ? '0 0 8px rgba(196,154,108,0.5)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Map (sticky) */}
      <div className="sticky top-0 h-screen w-full z-0">
        <TourMap stops={tour.stops} activeIndex={Math.max(0, activeStep)} />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/60 via-transparent to-transparent" />
      </div>

      {/* Scrolling text layer */}
      <div ref={scrollerRef} className="relative z-10" style={{ marginTop: '-100vh' }}>
        {/* Hero chapter */}
        <div className="min-h-screen flex items-center px-6 md:px-16">
          <motion.div
            className="max-w-lg glass rounded-2xl p-8 md:p-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            <p className="text-xs font-medium text-akhand-accent tracking-[0.2em] uppercase mb-4">
              Scrollytelling
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-bold text-akhand-text-primary leading-tight">
              {tour.title}
            </h1>
            <p className="text-akhand-text-secondary mt-4 leading-relaxed">
              {tour.description}
            </p>
            <div className="flex items-center gap-3 mt-6 text-xs text-akhand-text-muted">
              <span>{tour.stops.length} stops</span>
              <span className="w-px h-3 bg-akhand-border" />
              <span>Scroll to explore</span>
            </div>
            <motion.div
              className="mt-8 flex justify-center"
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <ChevronDown className="w-5 h-5 text-akhand-text-muted" />
            </motion.div>
          </motion.div>
        </div>

        {/* Stop chapters */}
        {tour.stops.map((stop, i) => (
          <div
            key={stop.id}
            ref={(el) => setStepRef(el, i)}
            className="min-h-screen flex items-center px-6 md:px-16 py-20"
          >
            <div className="max-w-lg glass rounded-2xl p-8 md:p-10 space-y-5">
              {/* Chapter number */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-akhand-accent bg-akhand-accent/10 px-2.5 py-1 rounded-full">
                  {i + 1} / {tour.stops.length}
                </span>
              </div>

              {/* Book info */}
              <div>
                <h2 className="font-serif text-xl md:text-2xl font-bold text-akhand-text-primary leading-tight">
                  {stop.bookTitle}
                </h2>
                <div className="flex items-center gap-3 mt-2 text-sm text-akhand-text-secondary">
                  <span>{stop.author}</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {stop.publishYear}
                  </span>
                </div>
              </div>

              {/* Passage */}
              <div className="border-l-2 border-akhand-accent/30 pl-4">
                <p className="font-serif italic text-sm text-akhand-literary leading-relaxed">
                  &ldquo;{stop.passage}&rdquo;
                </p>
              </div>

              {/* Editorial */}
              <p className="text-sm text-akhand-text-secondary leading-relaxed">
                {stop.editorial}
              </p>

              {/* Themes */}
              <div className="flex flex-wrap gap-1.5">
                {stop.themes.map((theme) => (
                  <span
                    key={theme}
                    className="px-2.5 py-1 bg-akhand-surface-2 text-akhand-text-muted rounded-full text-[11px]"
                  >
                    {theme}
                  </span>
                ))}
              </div>

              {/* Location */}
              <div className="flex items-center gap-1.5 text-xs text-akhand-accent">
                <MapPin className="w-3 h-3" />
                <span>
                  {stop.coordinates[1].toFixed(4)}, {stop.coordinates[0].toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        ))}

        {/* Outro */}
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="text-center max-w-lg glass rounded-2xl p-10">
            <h2 className="font-serif text-2xl font-bold text-akhand-text-primary">
              End of tour
            </h2>
            <p className="text-akhand-text-secondary mt-3 text-sm leading-relaxed">
              Mumbai is not one city but many, layered in fiction like geological strata.
              Each novelist discovers a different Bombay — and in doing so, creates another.
            </p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Link
                href="/explore?q=Mumbai"
                className="inline-flex items-center gap-2 px-6 py-3 bg-akhand-accent text-akhand-bg font-medium rounded-full text-sm hover:bg-akhand-accent-hover transition-colors"
              >
                Explore Mumbai on the map
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 border border-akhand-border text-akhand-text-secondary rounded-full text-sm hover:border-akhand-accent hover:text-akhand-accent transition-colors"
              >
                Back home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
