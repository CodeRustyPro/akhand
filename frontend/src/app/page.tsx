'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  MapPin,
  Search,
  BookOpen,
  Sparkles,
  Globe2,
  Layers,
  Brain,
  ArrowRight,
  GitBranch,
  Compass,
  Quote,
} from 'lucide-react';
import { literaryPlaces } from '@/lib/data';
import { fetchLiteraryPlaces } from '@/lib/api';
import type { LiteraryPlace } from '@/lib/types';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  }),
};

const features = [
  {
    icon: Search,
    title: 'Full-Text Search',
    description:
      'Search across 840+ literary places by title, author, city, theme, or passage. Filter by region, genre, and publication era.',
  },
  {
    icon: Layers,
    title: 'Multi-Layer Maps',
    description:
      'Scatter plots, heatmaps, and connection arcs. Switch between visualization modes to reveal different patterns in literary geography.',
  },
  {
    icon: GitBranch,
    title: 'Author Networks',
    description:
      'Trace arc connections between cities an author inhabits across their body of work. See literary worlds as connected graphs.',
  },
  {
    icon: Brain,
    title: 'NLP Pipeline',
    description:
      'spaCy NER, GLiNER zero-shot extraction, Gemini-powered structured analysis. From raw text to geocoded literary metadata at scale.',
  },
  {
    icon: Globe2,
    title: 'Historical Aliases',
    description:
      'Bombay resolves alongside Mumbai. Calcutta with Kolkata. Historical name deduplication ensures no literary reference is lost to renaming.',
  },
  {
    icon: Compass,
    title: 'Sentiment Geography',
    description:
      'How do authors emotionally render cities? Sentiment polarity and dominant emotions extracted per passage, mapped as color-coded geography.',
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
  const found = FEATURED_IDS
    .map((id) => places.find((p) => p.id === id))
    .filter(Boolean) as LiteraryPlace[];
  if (found.length >= 4) return found.slice(0, 6);
  return places.filter((p) => p.passage && p.passage.length > 40).slice(0, 6);
}

export default function HomePage() {
  const [stats, setStats] = useState({
    places: literaryPlaces.length,
    books: new Set(literaryPlaces.map((p) => p.bookTitle)).size,
    authors: new Set(literaryPlaces.map((p) => p.author)).size,
    cities: new Set(literaryPlaces.map((p) => p.placeName)).size,
  });
  const [featured, setFeatured] = useState<LiteraryPlace[]>(
    pickFeatured(literaryPlaces)
  );

  useEffect(() => {
    fetchLiteraryPlaces({ limit: 2000 }).then((places) => {
      if (places.length > literaryPlaces.length) {
        setStats({
          places: places.length,
          books: new Set(places.map((p) => p.bookTitle)).size,
          authors: new Set(places.map((p) => p.author)).size,
          cities: new Set(places.map((p) => p.placeName)).size,
        });
        const f = pickFeatured(places);
        if (f.length > 0) setFeatured(f);
      }
    });
  }, []);

  const featuredPassages = featured.filter(
    (p) => p.passage && p.passage.length > 20
  );

  return (
    <div className="min-h-screen bg-akhand-bg gradient-bg">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-akhand-accent" />
            <span className="font-serif text-xl font-semibold text-akhand-text-primary tracking-tight">
              Akhand
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/explore"
              className="text-sm text-akhand-text-secondary hover:text-akhand-text-primary transition-colors"
            >
              Explore
            </Link>
            <a
              href="https://github.com/CodeRustyPro/akhand"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-akhand-text-secondary hover:text-akhand-text-primary transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-6 overflow-hidden">
        {/* Decorative background dots */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {literaryPlaces.slice(0, 20).map((place, i) => {
            const x = ((place.coordinates[0] + 180) / 360) * 100;
            const y = ((90 - place.coordinates[1]) / 180) * 100;
            return (
              <motion.div
                key={place.id}
                className="absolute w-1.5 h-1.5 rounded-full bg-akhand-accent"
                style={{ left: `${x}%`, top: `${y}%` }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 0.6, 0.3],
                  scale: [0, 1.5, 1],
                }}
                transition={{
                  delay: 0.5 + i * 0.08,
                  duration: 2,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  repeatDelay: Math.random() * 4 + 2,
                }}
              />
            );
          })}
        </div>

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-sm font-medium text-akhand-accent tracking-[0.2em] uppercase mb-6">
              Literary Geography Platform
            </p>
          </motion.div>

          <motion.h1
            className="font-serif text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.1] tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: 0.15,
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <span className="text-akhand-text-primary">Every novel is a </span>
            <span className="text-gradient">map</span>
            <br />
            <span className="text-akhand-text-primary">Every city, a </span>
            <span className="text-gradient">story</span>
          </motion.h1>

          <motion.p
            className="mt-8 text-lg text-akhand-text-secondary max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
          >
            Akhand extracts place references from fiction, geocodes them, and
            renders them as interactive, searchable maps. Built on NLP
            pipelines that turn novels into geographic data, with a focus on
            South Asian literary fiction and its global counterparts.
          </motion.p>

          <motion.div
            className="mt-10 flex items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.8 }}
          >
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-akhand-accent text-akhand-bg font-medium rounded-full hover:bg-akhand-accent-hover transition-all duration-300 glow-accent text-sm"
            >
              Explore the Map
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          {/* Stats */}
          <motion.div
            className="mt-16 flex items-center justify-center gap-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            {[
              { value: stats.places, label: 'Literary Places' },
              { value: stats.cities, label: 'Cities' },
              { value: stats.authors, label: 'Authors' },
              { value: stats.books, label: 'Works of Fiction' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-serif font-bold text-akhand-accent">
                  {stat.value}
                </p>
                <p className="text-xs text-akhand-text-muted mt-1">
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-5 h-8 border border-akhand-border-light rounded-full flex justify-center pt-1.5"
          >
            <div className="w-1 h-2 bg-akhand-accent rounded-full" />
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
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
              className="text-sm font-medium text-akhand-accent tracking-[0.15em] uppercase"
            >
              Architecture
            </motion.p>
            <motion.h2
              variants={fadeUp}
              custom={1}
              className="font-serif text-3xl sm:text-4xl font-bold text-akhand-text-primary mt-4"
            >
              Computational literary cartography,
              <br />
              built on open-source tooling
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-akhand-text-secondary mt-4 max-w-2xl mx-auto"
            >
              From named entity recognition to geocoding, sentiment analysis
              to WebGL visualization. A convergent stack of NLP, spatial
              databases, and immersive rendering.
            </motion.p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-50px' }}
                variants={fadeUp}
                custom={i}
                className="group p-6 bg-akhand-surface rounded-2xl border border-akhand-border/50 hover:border-akhand-accent/30 transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-xl bg-akhand-accent-dim flex items-center justify-center mb-4 group-hover:bg-akhand-accent/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-akhand-accent" />
                </div>
                <h3 className="font-serif text-lg font-semibold text-akhand-text-primary">
                  {feature.title}
                </h3>
                <p className="text-sm text-akhand-text-secondary mt-2 leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Passages */}
      {featuredPassages.length > 0 && (
        <section className="py-32 px-6 border-t border-akhand-border/30">
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
                className="text-sm font-medium text-akhand-accent tracking-[0.15em] uppercase"
              >
                From the Corpus
              </motion.p>
              <motion.h2
                variants={fadeUp}
                custom={1}
                className="font-serif text-3xl sm:text-4xl font-bold text-akhand-text-primary mt-4"
              >
                Cities as fiction renders them
              </motion.h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featuredPassages.map((place, i) => (
                <motion.div
                  key={place.id}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-50px' }}
                  variants={fadeUp}
                  custom={i}
                  className="bg-akhand-surface rounded-2xl border border-akhand-border/50 overflow-hidden group hover:border-akhand-accent/20 transition-all duration-300"
                >
                  <div className="p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <Quote className="w-5 h-5 text-akhand-accent/50 flex-shrink-0 mt-1" />
                      <p className="font-serif text-sm italic text-akhand-literary leading-relaxed">
                        &ldquo;
                        {place.passage.length > 180
                          ? place.passage.slice(0, 180) + '...'
                          : place.passage}
                        &rdquo;
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-akhand-border/30">
                      <div>
                        <p className="text-sm font-medium text-akhand-text-primary">
                          {place.bookTitle}
                        </p>
                        <p className="text-xs text-akhand-text-secondary mt-0.5">
                          {place.author}, {place.publishYear}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-akhand-accent" />
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

      {/* CTA */}
      <section className="py-32 px-6 border-t border-akhand-border/30">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.h2
              variants={fadeUp}
              custom={0}
              className="font-serif text-3xl sm:text-4xl font-bold text-akhand-text-primary"
            >
              The map is not the territory.
              <br />
              <span className="text-gradient">But it reveals the story.</span>
            </motion.h2>
            <motion.p
              variants={fadeUp}
              custom={1}
              className="text-akhand-text-secondary mt-6 max-w-xl mx-auto"
            >
              Computational literary geography produces genuine scholarly and
              creative insight. Maps reveal hidden structures in fiction that
              diverge from, and illuminate, real urban patterns.
            </motion.p>
            <motion.div variants={fadeUp} custom={2} className="mt-10">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-akhand-accent text-akhand-bg font-medium rounded-full hover:bg-akhand-accent-hover transition-all duration-300 glow-accent text-sm"
              >
                Begin Exploring
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-akhand-border/30 py-12 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-akhand-accent" />
            <span className="font-serif text-sm text-akhand-text-secondary">
              Akhand
            </span>
          </div>
          <p className="text-xs text-akhand-text-muted">
            PostGIS · pgvector · deck.gl · spaCy · GLiNER · Gemini
          </p>
        </div>
      </footer>
    </div>
  );
}
