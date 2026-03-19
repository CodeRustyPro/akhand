'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  MapPin,
  Search,
  Globe2,
  Layers,
  Brain,
  ArrowRight,
  GitBranch,
  Compass,
  Quote,
  ArrowUpRight,
  ChevronDown,
  BookOpen,
} from 'lucide-react';
import { literaryPlaces } from '@/lib/data';
import { fetchLiteraryPlaces } from '@/lib/api';
import type { LiteraryPlace } from '@/lib/types';
import { tours } from '@/lib/tours';
import { buildTourPreviewProjector } from '@/lib/geo';
import { normalizePlacesMetadata } from '@/lib/quality';

/* ── Animations ─────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

/* ── Data helpers ───────────────────────────────────── */

const features = [
  {
    icon: Search,
    title: 'Full-Text Search',
    desc: 'Search across 930+ works by title, author, city, theme, or passage. Filter by region, genre, language, and era.',
  },
  {
    icon: Layers,
    title: 'Multi-Layer Maps',
    desc: 'Scatter plots, heatmaps, and connection arcs. Switch modes to reveal different patterns in literary geography.',
  },
  {
    icon: GitBranch,
    title: 'Author Networks',
    desc: 'Trace arc connections between cities an author inhabits across their body of work.',
  },
  {
    icon: Brain,
    title: 'NLP Pipeline',
    desc: 'spaCy NER, GLiNER zero-shot, Gemini-powered extraction. From raw text to geocoded literary metadata.',
  },
  {
    icon: Globe2,
    title: 'Historical Aliases',
    desc: 'Bombay resolves alongside Mumbai. Calcutta with Kolkata. No literary reference is lost to renaming.',
  },
  {
    icon: Compass,
    title: 'Sentiment Geography',
    desc: 'How do authors emotionally render cities? Sentiment and emotions extracted per passage, color-coded on the map.',
  },
];

const FEATURED_IDS = [
  'midnight-bombay',
  'god-small-things',
  'ulysses-dublin',
  'crime-punishment-stpetersburg',
  'hundred-years-macondo',
  'toba-tek-singh',
];

function pickFeatured(places: LiteraryPlace[]): LiteraryPlace[] {
  const pool = places.filter((p) => p.qualityTier === 'gold');
  const found = FEATURED_IDS
    .map((id) => pool.find((p) => p.id === id) || places.find((p) => p.id === id))
    .filter(Boolean) as LiteraryPlace[];
  if (found.length >= 4) return found.slice(0, 6);
  return pool.filter((p) => p.passage && p.passage.length > 40).slice(0, 6);
}

interface ReadingList {
  title: string;
  description: string;
  query: string;
  icon: string;
  filter: (p: LiteraryPlace) => boolean;
}

const READING_LISTS: ReadingList[] = [
  {
    title: 'Partition Fiction',
    description: 'Novels reckoning with the 1947 partition',
    query: 'partition',
    icon: '𑗕',
    filter: (p) =>
      p.sentiment.themes.some(t => t.includes('partition')) ||
      p.bookTitle.toLowerCase().includes('partition') ||
      p.bookTitle.toLowerCase().includes('train to pakistan') ||
      p.bookTitle.toLowerCase().includes('tamas') ||
      p.bookTitle.toLowerCase().includes('ice-candy-man'),
  },
  {
    title: 'Mumbai Noir',
    description: 'Crime and the underbelly of the city that never sleeps',
    query: '_list:mumbai-noir',
    icon: '🌃',
    filter: (p) =>
      p.placeName === 'Mumbai' &&
      (p.genres.includes('crime') ||
        p.genres.includes('mystery') ||
        p.genres.includes('thriller') ||
        p.sentiment.themes.some(t => t.includes('corruption'))),
  },
  {
    title: 'Fiction in Translation',
    description: 'Works in Hindi, Bengali, Tamil, Urdu, and more',
    query: '_lang:non-english',
    icon: '🔤',
    filter: (p) =>
      p.language !== 'English' && p.language !== 'Unknown' && Boolean(p.language),
  },
  {
    title: 'Small Town Stories',
    description: 'Beyond the metros — villages, hill stations, coastal towns',
    query: '_list:small-towns',
    icon: '🏘',
    filter: (p) => {
      const metros = new Set([
        'Mumbai', 'Delhi', 'Kolkata', 'Chennai', 'Bangalore',
        'Hyderabad', 'London', 'New York', 'Paris', 'Tokyo',
        'Karachi', 'Lahore', 'Dhaka', 'Moscow',
      ]);
      return p.region === 'South Asia' && !metros.has(p.placeName);
    },
  },
  {
    title: 'Historical Fiction',
    description: 'Novels set in or about a bygone era',
    query: '_genre:historical fiction',
    icon: '⏳',
    filter: (p) => p.genres.includes('historical fiction'),
  },
  {
    title: 'Coming of Age',
    description: 'Stories of childhood, adolescence, and growing up',
    query: 'childhood',
    icon: '🌱',
    filter: (p) =>
      p.sentiment.themes.some(t => t.includes('childhood')) ||
      p.genres.includes("children's") ||
      p.genres.includes('young adult'),
  },
];

/* ── Main Page ──────────────────────────────────────── */

export default function HomePage() {
  const basePlaces = normalizePlacesMetadata(literaryPlaces);
  const [stats, setStats] = useState({
    places: basePlaces.length,
    goldPlaces: basePlaces.filter((p) => p.qualityTier === 'gold').length,
    books: new Set(basePlaces.map((p) => p.bookTitle)).size,
    authors: new Set(basePlaces.map((p) => p.author)).size,
    cities: new Set(basePlaces.map((p) => p.placeName)).size,
  });
  const [featured, setFeatured] = useState<LiteraryPlace[]>(
    pickFeatured(basePlaces)
  );
  const [allPlaces, setAllPlaces] = useState<LiteraryPlace[]>(basePlaces);

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.8, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.98, 0.95]);

  useEffect(() => {
    fetchLiteraryPlaces({ limit: 2000 }).then((places) => {
      const normalized = normalizePlacesMetadata(places);
      if (normalized.length > basePlaces.length) {
        setAllPlaces(normalized);
        setStats({
          places: normalized.length,
          goldPlaces: normalized.filter((p) => p.qualityTier === 'gold').length,
          books: new Set(normalized.map((p) => p.bookTitle)).size,
          authors: new Set(normalized.map((p) => p.author)).size,
          cities: new Set(normalized.map((p) => p.placeName)).size,
        });
        const f = pickFeatured(normalized);
        if (f.length > 0) setFeatured(f);
      }
    });
  }, [basePlaces]);

  const featuredPassages = featured.filter(
    (p) => p.passage && p.passage.length > 20
  );

  return (
    <div className="min-h-screen bg-akhand-bg">
      {/* ── Navigation ──────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-akhand-accent/10 flex items-center justify-center group-hover:bg-akhand-accent/20 transition-colors">
              <span className="font-serif text-sm font-bold text-akhand-accent">A</span>
            </div>
            <span className="font-serif text-lg font-semibold text-akhand-text-primary tracking-tight">
              Akhand
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/stories/literary-mumbai"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-akhand-accent/10 to-purple-500/10 text-akhand-accent border border-akhand-accent/30 text-sm font-medium rounded-full hover:bg-akhand-accent/20 hover:border-akhand-accent/40 transition-all"
            >
              <Quote className="w-3.5 h-3.5" />
              Stories
            </Link>
            <a
              href="https://github.com/CodeRustyPro/akhand"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-akhand-text-muted hover:text-akhand-text-secondary transition-colors hidden sm:block"
            >
              GitHub
            </a>
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-akhand-accent/10 text-akhand-accent text-sm font-medium rounded-full hover:bg-akhand-accent/20 border border-akhand-accent/20 transition-all"
            >
              Explore
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────── */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative min-h-screen flex items-center overflow-hidden"
      >
        {/* Aurora mesh background */}
        <div className="hero-aurora" />
        <div className="noise-overlay" />

        {/* Content: side-by-side hero + reading lists */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-24 pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center min-h-[calc(100vh-120px)]">
            {/* Left: Hero text */}
            <div className="lg:col-span-7">
              <motion.h1
                className="font-serif text-[clamp(2.5rem,6vw,5.5rem)] font-bold leading-[1.05] tracking-tight"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="text-akhand-text-primary">Every novel{' '}</span>
                <br className="hidden sm:block" />
                <span className="text-akhand-text-primary">is a </span>
                <span className="text-gradient">map.</span>
              </motion.h1>

              <motion.p
                className="mt-6 text-lg sm:text-xl text-akhand-text-secondary max-w-xl leading-relaxed font-light"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.8 }}
              >
                Akhand extracts place references from world literature, geocodes them,
                and renders them as interactive, searchable maps. The first platform to
                close the loop between NLP and literary cartography.
              </motion.p>

              <motion.div
                className="mt-10 flex flex-wrap items-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.8 }}
              >
                <Link
                  href="/explore"
                  className="group inline-flex items-center gap-2.5 px-8 py-4 bg-akhand-accent text-akhand-bg font-semibold rounded-full hover:bg-akhand-accent-hover transition-all duration-300 glow-accent text-sm"
                >
                  Explore the Map
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <a
                  href="https://github.com/CodeRustyPro/akhand"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-4 text-sm font-medium text-akhand-text-secondary hover:text-akhand-text-primary border border-akhand-border rounded-full hover:border-akhand-border-light transition-all"
                >
                  View Source
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </motion.div>

              {/* Stats bar */}
              <motion.div
                className="mt-14 flex items-center gap-8 sm:gap-12"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
              >
                {[
                  { value: stats.goldPlaces, label: 'Gold Places' },
                  { value: stats.places, label: 'Total Places' },
                  { value: stats.books, label: 'Works' },
                  { value: stats.cities, label: 'Cities' },
                  { value: stats.authors, label: 'Authors' },
                ].map((stat, i) => (
                  <div key={stat.label} className="relative">
                    {i > 0 && (
                      <div className="absolute -left-4 sm:-left-6 top-1/2 -translate-y-1/2 w-px h-8 bg-akhand-border" />
                    )}
                    <p className="text-3xl sm:text-4xl font-serif font-bold text-akhand-text-primary tabular-nums">
                      {stat.value}
                    </p>
                    <p className="text-xs text-akhand-text-muted mt-1 uppercase tracking-wider">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Right: Reading Lists */}
            <motion.div
              className="lg:col-span-5"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="space-y-3">
                <p className="text-xs font-medium text-akhand-text-muted uppercase tracking-widest mb-4 pl-1">
                  Curated Reading Lists
                </p>
                {READING_LISTS.map((list, i) => {
                  const matches = allPlaces.filter((p) => p.qualityTier === 'gold').filter(list.filter);
                  if (matches.length < 2) return null;
                  return (
                    <Link
                      key={list.title}
                      href={`/explore?q=${encodeURIComponent(list.query)}`}
                      className="group flex items-center gap-4 p-4 rounded-2xl bg-akhand-surface/60 border border-akhand-border/40 hover:border-akhand-accent/30 hover:bg-akhand-surface transition-all duration-300"
                    >
                      <span className="text-xl flex-shrink-0 w-10 h-10 rounded-xl bg-akhand-surface-2 flex items-center justify-center">
                        {list.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-akhand-text-primary group-hover:text-akhand-accent transition-colors">
                          {list.title}
                        </h3>
                        <p className="text-xs text-akhand-text-muted mt-0.5 truncate">
                          {list.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs tabular-nums text-akhand-accent font-medium bg-akhand-accent/10 px-2.5 py-1 rounded-full">
                          {matches.length}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-akhand-text-muted group-hover:text-akhand-accent group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Scroll indicator */}
          <motion.div
            className="absolute bottom-6 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex flex-col items-center gap-2"
            >
              <span className="text-[10px] text-akhand-text-muted uppercase tracking-widest">Scroll</span>
              <ChevronDown className="w-4 h-4 text-akhand-text-muted" />
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      {/* ── Features ────────────────────────────────── */}
      <section className="relative py-32 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-akhand-bg via-akhand-surface/30 to-akhand-bg pointer-events-none" />
        <div className="relative max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-20"
          >
            <motion.p
              variants={fadeUp}
              custom={0}
              className="text-xs font-medium text-akhand-accent tracking-[0.2em] uppercase"
            >
              Architecture
            </motion.p>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-serif text-3xl sm:text-5xl font-bold text-akhand-text-primary mt-5 leading-tight"
            >
              Computational literary
              <br />
              cartography
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-akhand-text-secondary mt-5 max-w-2xl mx-auto text-base leading-relaxed"
            >
              From named entity recognition to geocoding, sentiment analysis
              to WebGL visualization. A convergent stack of NLP, spatial
              databases, and immersive rendering.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                variants={fadeUp}
                custom={i}
                className="group relative p-6 rounded-2xl bg-akhand-surface/50 border border-akhand-border/40 hover:border-akhand-accent/25 transition-all duration-500 overflow-hidden"
              >
                {/* Hover glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-akhand-accent/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-akhand-accent/10 flex items-center justify-center mb-4 group-hover:bg-akhand-accent/15 transition-colors">
                    <feature.icon className="w-5 h-5 text-akhand-accent" />
                  </div>
                  <h3 className="font-serif text-lg font-semibold text-akhand-text-primary">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-akhand-text-secondary mt-2 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Featured Passages ───────────────────────── */}
      {featuredPassages.length > 0 && (
        <section className="py-32 px-6">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              className="text-center mb-20"
            >
              <motion.p
                variants={fadeUp}
                custom={0}
                className="text-xs font-medium text-akhand-accent tracking-[0.2em] uppercase"
              >
                From the Corpus
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-5xl font-bold text-akhand-text-primary mt-5"
              >
                Cities as fiction renders them
              </motion.h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {featuredPassages.map((place, i) => (
                <motion.div
                  key={place.id}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-50px' }}
                  variants={fadeUp}
                  custom={i}
                  className="group relative bg-akhand-surface/50 rounded-2xl border border-akhand-border/40 overflow-hidden hover:border-akhand-accent/20 transition-all duration-500"
                >
                  <div className="p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <Quote className="w-4 h-4 text-akhand-accent/40 flex-shrink-0 mt-1" />
                      <p className="font-serif text-sm italic text-akhand-literary leading-relaxed">
                        &ldquo;
                        {place.passage.length > 180
                          ? place.passage.slice(0, 180) + '...'
                          : place.passage}
                        &rdquo;
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-akhand-border/20">
                      <div>
                        <p className="text-sm font-medium text-akhand-text-primary">
                          {place.bookTitle}
                        </p>
                        <p className="text-xs text-akhand-text-muted mt-0.5">
                          {place.author}, {place.publishYear}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 bg-akhand-accent/10 px-2.5 py-1 rounded-full">
                        <MapPin className="w-3 h-3 text-akhand-accent" />
                        <span className="text-xs text-akhand-accent font-medium">
                          {place.placeName}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Literary Tours ──────────────────────────── */}
      <section className="py-32 px-6 relative overflow-hidden">
        {/* Accent glow for emphasis */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-purple-500/[0.03] blur-[80px]" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <motion.p
              variants={fadeUp}
              custom={0}
              className="text-xs font-medium bg-gradient-to-r from-akhand-accent to-purple-400 bg-clip-text text-transparent tracking-[0.2em] uppercase"
            >
              Scrollytelling
            </motion.p>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-serif text-3xl sm:text-5xl font-bold text-akhand-text-primary mt-5"
            >
              Literary Tours
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-akhand-text-secondary mt-5 max-w-2xl mx-auto text-base leading-relaxed"
            >
              Narrative-driven explorations that guide you through a city&apos;s fiction,
              one book at a time. Scroll through the story while the map follows along.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={stagger}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {tours.map((tour, i) => {
              const projectToPreview = buildTourPreviewProjector(tour.stops);
              return (
                <motion.div key={tour.slug} variants={fadeUp} custom={i}>
                  <Link
                    href={`/stories/${tour.slug}`}
                    className="group block relative bg-akhand-surface/50 rounded-2xl border border-akhand-border/40 overflow-hidden hover:border-akhand-accent/25 transition-all duration-500"
                  >
                    {/* Decorative map preview gradient */}
                    <div className="h-40 bg-gradient-to-br from-akhand-surface-2 via-akhand-surface to-akhand-bg relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="relative">
                          {tour.stops.map((stop) => {
                            const [x, y] = projectToPreview(stop.coordinates);
                            return (
                              <div
                                key={stop.id}
                                className="absolute w-2 h-2 rounded-full bg-akhand-accent/60"
                                style={{
                                  left: `${x}px`,
                                  top: `${y}px`,
                                }}
                              />
                            );
                          })}
                          <div className="w-8 h-8 rounded-full bg-akhand-accent/10 flex items-center justify-center">
                            <BookOpen className="w-4 h-4 text-akhand-accent" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-6">
                      <h3 className="font-serif text-lg font-semibold text-akhand-text-primary group-hover:text-akhand-accent transition-colors">
                        {tour.title}
                      </h3>
                      <p className="text-xs text-akhand-text-muted mt-1">
                        {tour.subtitle}
                      </p>
                      <p className="text-sm text-akhand-text-secondary mt-3 leading-relaxed line-clamp-2">
                        {tour.description}
                      </p>
                      <div className="flex items-center gap-3 mt-4">
                        <span className="text-xs text-akhand-accent font-medium bg-akhand-accent/10 px-2.5 py-1 rounded-full">
                          {tour.stops.length} stops
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-akhand-text-muted group-hover:text-akhand-accent group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section className="relative py-32 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-akhand-accent/[0.04] blur-[100px]" />
        </div>

        <div className="relative max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="font-serif text-3xl sm:text-5xl font-bold text-akhand-text-primary leading-tight"
            >
              The map is not the territory.
              <br />
              <span className="text-gradient">But it reveals the story.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-akhand-text-secondary mt-6 max-w-xl mx-auto leading-relaxed"
            >
              Computational literary geography produces genuine scholarly and
              creative insight. Maps reveal hidden structures in fiction that
              diverge from, and illuminate, real urban patterns.
            </motion.p>
            <motion.div variants={fadeUp} custom={2} className="mt-10">
              <Link
                href="/explore"
                className="group inline-flex items-center gap-2.5 px-10 py-4 bg-akhand-accent text-akhand-bg font-semibold rounded-full hover:bg-akhand-accent-hover transition-all duration-300 glow-accent text-sm"
              >
                Begin Exploring
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="border-t border-akhand-border/20 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded bg-akhand-accent/10 flex items-center justify-center">
              <span className="font-serif text-[10px] font-bold text-akhand-accent">A</span>
            </div>
            <span className="font-serif text-sm text-akhand-text-muted">
              Akhand
            </span>
          </div>
          <p className="text-xs text-akhand-text-muted">
            FastAPI &middot; deck.gl &middot; MapLibre &middot; spaCy &middot; GLiNER &middot; Gemini
          </p>
        </div>
      </footer>
    </div>
  );
}
