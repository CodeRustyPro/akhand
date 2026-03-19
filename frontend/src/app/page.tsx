'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { literaryPlaces } from '@/lib/data';
import { fetchLiteraryPlaces } from '@/lib/api';
import { tours } from '@/lib/tours';
import type { LiteraryPlace } from '@/lib/types';
import { normalizePlacesMetadata } from '@/lib/quality';

type ReadingList = {
  title: string;
  description: string;
  query: string;
  filter: (p: LiteraryPlace) => boolean;
};

const READING_LISTS: ReadingList[] = [
  {
    title: 'Partition Fiction',
    description: 'Novels reckoning with partition-era memory and displacement.',
    query: 'partition',
    filter: (p) =>
      p.sentiment.themes.some((t) => t.includes('partition')) ||
      p.bookTitle.toLowerCase().includes('partition') ||
      p.bookTitle.toLowerCase().includes('train to pakistan') ||
      p.bookTitle.toLowerCase().includes('tamas') ||
      p.bookTitle.toLowerCase().includes('ice-candy-man'),
  },
  {
    title: 'Mumbai Noir',
    description: 'Crime and urban tension across narrative Mumbai.',
    query: '_list:mumbai-noir',
    filter: (p) =>
      p.placeName === 'Mumbai' &&
      (p.genres.includes('crime') ||
        p.genres.includes('mystery') ||
        p.genres.includes('thriller') ||
        p.sentiment.themes.some((t) => t.includes('corruption'))),
  },
  {
    title: 'Fiction in Translation',
    description: 'Works beyond English in the current mapped collection.',
    query: '_lang:non-english',
    filter: (p) => p.language !== 'English' && p.language !== 'Unknown' && Boolean(p.language),
  },
  {
    title: 'Historical Fiction',
    description: 'Narratives anchored in past eras and historical memory.',
    query: '_genre:historical fiction',
    filter: (p) => p.genres.includes('historical fiction'),
  },
];

const HERO_RESEARCH_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuALtgtFucU48ruxm5AKvJD1H6Kms5vXH1Vk5osfoM5hro4S30996V1Y-fHOFv_zrsGu9O3ehRpwRvilfQmn4PNH0_qQwlQK6GbSfD8CXQ1x6s6UHOLZ2o-Nl8Y2BodVts0hQ4ZP44Ys8xSwEgRE7iK5p76JXGnouNsXXPinagskc3i4Lf-_XQgLUWH3KAS69dKzj8VVJp03XpeWzoMeUzlLBlFax-maYfyf5GZRgUvPol3wE9Lhcd6sUY_ETPGVHbM0pHm-7NpgtyI';
const HERO_PLATFORM_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB43bTQ47KoYYtq6Olc73lOYaRx8BCK3mlrQI-h6e7kQK9oWhOKJSwE6BT-nCLR6g-DLamGjK2v2JS96biI1Kpa3HfpVXjg0yjIxM0MV6MxgO3P1TDnuqdPkbMYILMkpAvYue_LKqyL6k2tqQz0Jn2EXFYyDWlzpPoV2cRNOgTuh5T7hthZOgVKdNqvOilTQMJQE3dvvHieEeWgyPQaB5fd0LaRAVIcdv2rlz5pXN1V6RwXQZnaNT_cNAl6qvsH5SecKs9FhOu5keA';
const PLATFORM_PREVIEW_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCngOYtyf4sTUYVoSJIhydDynd7IaUWKuDM3iUwrjIKEWkkgiKZRlIB_TV9BYXfTe__t-Hl0eAuftiEG3thZ6V1PZbf0Bp8uRVITjoayuU-xfBCgeizx3ko5IkrtWI0fICryljjb7RkDQQfppTgBTXg3E8QhoSOZ5wel84Utp2U9wRk73hOMOeENH3NO7AT5iEWwfFsG9i69Wrrmbe_cPHfMrchPxNWuuSEqjDqMzN_CzKFpMJyLIqm-uPBTJbuZqeWKReaGcwTDS4';
const TOUR_IMAGES = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDSr9C0eqqQBjcXN-fNaTr-ZTu6Eq_Sjb0mcL9Xh9B5qh_5Y_bkQNzN0aSl7YGkIx0LTXBOQhK-Kw_bC8n1jVhcGn8di0thebEqN5DSeZV11Yf8dJRq_Zr936iZ_hKFe734GAiWA9QV2qk40CitLQtQ5svb58NmEOCOGmcNZl6bZHWZrhX5DHqLy_Nw-ToA3FplCo2yIAAD4lruWFhqnbIuD9yVPdsU4adcrxhLSUygQEFePpfzAhVcrjVC3ILO78q3jY42b_Lg2bE',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBFDdeOzZRab35cAx7WHlt5oM_m7etwgWCiPxuectnyXN0An1TOujiP9JWhBd6_LmqVBEc25Lsh_6ybjrrsI4g8kprgGSFDNaUt0IiI5zdjEcZ8Vq6KT6S8gXvUq3qsr6_ZfaafGYa6VODMG8tJ9uBvhFjzqbYAqTJ6_z4STiLXIj3J_AKHll0VeaY2k0Mw2mfk-Zs8n-C_xP99_F2pnHKTZP1_pjCTeIxGVLLXT82GnbogFMT_iodko7rhCp6lDjZQLVsAa4m2MPU',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDR77wQwQ9VOBlABhpvBGeFczZd-2vOIMjIHdlqgK8RVZWTeKFtn432YZEBNpQwJGkY4stbffeLj2Otk_ZZd3mBlVytbAh88J4LKkOSEp71FNPzqbqA5CML9pib6wY82WxId4vQDhGenBQJxY5xLGhSO-9pfq7B9M-frAvUn3kU7FN9CopGSCltZVxe39ldvvZtHMNOf12_0-Djrf6zg_vXWb2n3mLu1PP6zwsUpry0pl2aSHYPa0jQXG88vAz-FFQlAVa6cOvxFL4',
];

function pickLedgerRows(places: LiteraryPlace[]): LiteraryPlace[] {
  return places.filter((p) => p.passage && p.passage.length > 40).slice(0, 3);
}

export default function HomePage() {
  const basePlaces = useMemo(
    () => normalizePlacesMetadata(literaryPlaces).filter((p) => p.qualityTier !== 'gold'),
    []
  );
  const [allPlaces, setAllPlaces] = useState<LiteraryPlace[]>(basePlaces);

  useEffect(() => {
    fetchLiteraryPlaces({ limit: 5000 }).then((places) => {
      const normalized = normalizePlacesMetadata(places).filter((p) => p.qualityTier !== 'gold');
      if (normalized.length > basePlaces.length) {
        setAllPlaces(normalized);
      }
    });
  }, [basePlaces]);

  const stats = useMemo(
    () => ({
      places: allPlaces.length,
      works: new Set(allPlaces.map((p) => p.bookTitle)).size,
      authors: new Set(allPlaces.map((p) => p.author)).size,
      cities: new Set(allPlaces.map((p) => p.placeName)).size,
    }),
    [allPlaces]
  );

  const ledgerRows = useMemo(() => pickLedgerRows(allPlaces), [allPlaces]);
  const primaryTour = tours[0];
  const tourStops = primaryTour ? primaryTour.stops.slice(0, 3) : [];

  return (
    <div className="min-h-screen bg-akhand-bg text-akhand-text-primary">
      <div className="pointer-events-none fixed inset-0 opacity-[0.03] [background-image:url('https://grainy-gradients.vercel.app/noise.svg')]" />

      <nav className="fixed top-0 z-50 w-full border-b border-akhand-border/40 bg-[#0f0f0f]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 md:px-8">
          <Link href="/" className="font-serif text-2xl font-bold tracking-tight uppercase">
            Akhand
          </Link>
          <div className="hidden items-center gap-10 md:flex">
            <Link href="/research" className="font-serif italic text-akhand-accent">
              Research
            </Link>
            <Link href="/explore" className="font-serif italic text-akhand-text-secondary hover:text-akhand-text-primary">
              Platform
            </Link>
            <Link href="/stories/literary-mumbai" className="font-serif italic text-akhand-text-secondary hover:text-akhand-text-primary">
              Stories
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/CodeRustyPro/akhand"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-xs uppercase tracking-widest text-akhand-text-muted hover:text-akhand-accent sm:inline"
            >
              GitHub
            </a>
            <Link
              href="/research"
              className="border border-akhand-accent/30 bg-akhand-accent px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-akhand-bg hover:bg-akhand-accent-hover"
            >
              Open Research
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-20">
        <section className="relative min-h-[92vh] overflow-hidden border-b border-akhand-border/20">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(196,154,108,0.12),transparent_55%),radial-gradient(ellipse_at_80%_70%,rgba(196,154,108,0.08),transparent_55%)]" />
          <div className="relative grid min-h-[92vh] grid-cols-1 lg:grid-cols-2">
            <div className="group relative flex flex-col justify-end overflow-hidden border-r border-akhand-border/20 p-8 md:p-12">
              <img
                alt="Satellite view of urban network at night"
                className="absolute inset-0 h-full w-full object-cover opacity-95 scale-110 transition-transform duration-1000 group-hover:scale-100"
                src={HERO_RESEARCH_IMAGE}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/85 via-[#050505]/55 to-[#050505]/25" />
              <div className="relative z-10">
              <span className="mb-4 text-[10px] uppercase tracking-[0.2em] text-akhand-accent">Pillar I: Research</span>
              <h1 className="mb-8 font-serif text-5xl italic leading-none md:text-7xl">The Research Ledger</h1>
              <p className="mb-10 max-w-md text-sm leading-7 text-akhand-text-secondary md:text-base">
                Public literary geography rows with place anchors, notes, and clear scope. Non-fiction is excluded from the public ledger.
              </p>
              <div className="mb-10 flex flex-wrap gap-3">
                <Link href="/research" className="bg-akhand-accent px-7 py-4 text-xs font-semibold uppercase tracking-widest text-akhand-bg hover:bg-akhand-accent-hover">
                  Open Research
                </Link>
                <Link href="/explore" className="border border-akhand-border-light px-7 py-4 text-xs uppercase tracking-widest text-akhand-text-secondary hover:border-akhand-accent hover:text-akhand-accent">
                  Open Explore
                </Link>
              </div>
              <div className="grid max-w-xl grid-cols-2 gap-6 md:grid-cols-4">
                <div>
                  <p className="font-serif text-3xl">{stats.places}</p>
                  <p className="text-[10px] uppercase tracking-widest text-akhand-text-muted">Places</p>
                </div>
                <div>
                  <p className="font-serif text-3xl">{stats.works}</p>
                  <p className="text-[10px] uppercase tracking-widest text-akhand-text-muted">Works</p>
                </div>
                <div>
                  <p className="font-serif text-3xl">{stats.authors}</p>
                  <p className="text-[10px] uppercase tracking-widest text-akhand-text-muted">Authors</p>
                </div>
                <div>
                  <p className="font-serif text-3xl">{stats.cities}</p>
                  <p className="text-[10px] uppercase tracking-widest text-akhand-text-muted">Cities</p>
                </div>
              </div>
              </div>
            </div>

            <div className="group relative flex flex-col justify-end overflow-hidden p-8 md:p-12">
              <img
                alt="Abstract cartography and topographical lines"
                className="absolute inset-0 h-full w-full object-cover opacity-95 scale-110 transition-transform duration-1000 group-hover:scale-100"
                src={HERO_PLATFORM_IMAGE}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/85 via-[#050505]/55 to-[#050505]/25" />
              <div className="relative z-10">
              <span className="mb-4 text-[10px] uppercase tracking-[0.2em] text-akhand-accent">Pillar II: Platform</span>
              <h2 className="mb-8 font-serif text-5xl italic leading-none md:text-7xl">Spatial Explore</h2>
              <p className="mb-10 max-w-md text-sm leading-7 text-akhand-text-secondary md:text-base">
                Search and filter literary places, switch map layers, and open story routes without leaving the platform.
              </p>
              <div className="mb-8 flex flex-wrap gap-3">
                <Link href="/explore" className="bg-akhand-accent px-7 py-4 text-xs font-semibold uppercase tracking-widest text-akhand-bg hover:bg-akhand-accent-hover">
                  Open Explore
                </Link>
                <Link href="/stories/literary-mumbai" className="border border-akhand-border-light px-7 py-4 text-xs uppercase tracking-widest text-akhand-accent hover:border-akhand-accent">
                  Start Literary Tour
                </Link>
              </div>
              <div className="space-y-2 text-xs uppercase tracking-widest text-akhand-text-muted">
                <p>Layers: Places / Density / Connections</p>
                <p>Routes: Stories and tours</p>
                <p>Source: Public literary dataset</p>
              </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-akhand-surface py-24">
          <div className="mx-auto max-w-7xl px-6 md:px-8">
            <div className="mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <span className="mb-3 block text-[10px] uppercase tracking-[0.2em] text-akhand-text-muted">Section 01 / Methodology</span>
                <h3 className="font-serif text-5xl italic">The Public Ledger</h3>
                <p className="mt-6 text-base leading-8 text-akhand-text-secondary">
                  Every mapped point ties back to a literary reference and note. This section previews real records from the current dataset.
                </p>
              </div>
              <Link href="/research" className="w-fit border-b border-akhand-accent pb-2 text-xs uppercase tracking-widest text-akhand-accent hover:text-akhand-text-primary">
                Open Research Ledger
              </Link>
            </div>

            <div className="border-t border-akhand-border/30">
              {ledgerRows.map((row) => (
                <div key={row.id} className="grid grid-cols-1 gap-4 border-b border-akhand-border/20 py-7 md:grid-cols-12 md:gap-6">
                  <p className="font-serif text-2xl italic md:col-span-4">{row.bookTitle}</p>
                  <p className="text-xs uppercase tracking-widest text-akhand-text-secondary md:col-span-3">{row.placeName}</p>
                  <p className="text-sm italic leading-7 text-akhand-text-muted md:col-span-5">
                    {row.passage ? `"${row.passage.slice(0, 140)}..."` : 'Narrative place reference available in the research ledger.'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#0d0d0d] py-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 md:grid-cols-2 md:px-8">
            <div className="border border-akhand-border/30 bg-akhand-surface-2 p-8">
              <div className="relative mb-8 h-64 overflow-hidden border border-akhand-border/30">
                <img
                  alt="Interface showing literary heatmaps"
                  className="h-full w-full object-cover opacity-60 grayscale transition duration-700 hover:grayscale-0"
                  src={PLATFORM_PREVIEW_IMAGE}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/70 via-transparent to-transparent" />
              </div>
              <p className="text-[10px] uppercase tracking-widest text-akhand-text-muted">Map Layer Preview</p>
            </div>
            <div>
              <span className="mb-3 block text-[10px] uppercase tracking-[0.2em] text-akhand-text-muted">Section 02 / Interface</span>
              <h3 className="mb-8 font-serif text-5xl italic">Spatial Intelligence</h3>
              <ul className="space-y-7">
                <li className="flex gap-4">
                  <span className="font-serif text-3xl text-akhand-accent">01</span>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest">Search + Filter</p>
                    <p className="text-sm text-akhand-text-secondary">Find by author, work, place, region, and literary themes.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="font-serif text-3xl text-akhand-accent">02</span>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest">Layer Switching</p>
                    <p className="text-sm text-akhand-text-secondary">Toggle between place markers, density view, and connection arcs.</p>
                  </div>
                </li>
                <li className="flex gap-4">
                  <span className="font-serif text-3xl text-akhand-accent">03</span>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest">Passage Context</p>
                    <p className="text-sm text-akhand-text-secondary">Inspect the literary context attached to mapped coordinates.</p>
                  </div>
                </li>
              </ul>
              <Link href="/explore" className="mt-10 inline-block bg-akhand-accent px-8 py-4 text-xs font-semibold uppercase tracking-widest text-akhand-bg hover:bg-akhand-accent-hover">
                Open Explore
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-akhand-surface py-24">
          <div className="mx-auto max-w-7xl px-6 md:px-8">
            <div className="mb-14 text-center">
              <span className="mb-3 block text-[10px] uppercase tracking-[0.2em] text-akhand-text-muted">Section 03 / Narratives</span>
              <h3 className="font-serif text-6xl italic">Literary Mumbai</h3>
              <p className="mx-auto mt-4 max-w-2xl text-akhand-text-secondary">
                Stop-based storytelling from the currently available tour experience.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {tourStops.map((stop, index) => (
                <article key={stop.id} className="group relative overflow-hidden border border-akhand-border/30 bg-akhand-surface-2 p-7">
                  <img
                    alt={`Literary Mumbai chapter ${index + 1}`}
                    className="absolute inset-0 h-full w-full object-cover opacity-30 transition-all duration-700 group-hover:scale-105 group-hover:opacity-50"
                    src={TOUR_IMAGES[index % TOUR_IMAGES.length]}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-transparent" />
                  <div className="relative z-10">
                    <p className="mb-2 text-[10px] uppercase tracking-widest text-akhand-accent">Chapter {String(index + 1).padStart(2, '0')}</p>
                    <h4 className="mb-3 font-serif text-3xl italic">{stop.bookTitle}</h4>
                    <p className="mb-6 text-sm leading-7 text-akhand-text-secondary">{stop.editorial.slice(0, 120)}...</p>
                    <p className="text-[10px] uppercase tracking-widest text-akhand-text-muted">{stop.author} / {stop.publishYear}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link href="/stories/literary-mumbai" className="inline-block bg-akhand-accent px-10 py-4 text-xs font-semibold uppercase tracking-widest text-akhand-bg hover:bg-akhand-accent-hover">
                Start Literary Tour
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-[#0d0d0d] py-20">
          <div className="mx-auto max-w-7xl px-6 md:px-8">
            <h4 className="mb-10 text-[10px] uppercase tracking-[0.2em] text-akhand-text-muted">Curated Reading Pathways</h4>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {READING_LISTS.map((list) => {
                const count = allPlaces.filter(list.filter).length;
                return (
                  <Link
                    key={list.title}
                    href={`/explore?q=${encodeURIComponent(list.query)}`}
                    className="border-l border-akhand-border/40 pl-5 hover:border-akhand-accent"
                  >
                    <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest">{list.title}</h5>
                    <p className="mb-4 text-xs leading-6 text-akhand-text-secondary">{list.description}</p>
                    <p className="text-[10px] uppercase tracking-widest text-akhand-accent">{count} works</p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y border-akhand-border/20 bg-akhand-surface py-10">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-6 text-[10px] uppercase tracking-widest text-akhand-text-secondary md:flex-row md:items-center md:px-8">
            <div className="flex flex-wrap items-center gap-4 text-akhand-text-primary">
              <span>01 Ingestion</span>
              <span className="text-akhand-accent">&gt;</span>
              <span>02 Extraction</span>
              <span className="text-akhand-accent">&gt;</span>
              <span>03 Review</span>
              <span className="text-akhand-accent">&gt;</span>
              <span>04 Export</span>
            </div>
            <p>Method and data details are available through project docs and GitHub.</p>
          </div>
        </section>

        <section className="relative bg-akhand-surface py-28 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(196,154,108,0.12),transparent_50%)]" />
          <div className="relative mx-auto max-w-4xl px-6">
            <h3 className="mb-10 font-serif text-6xl italic leading-tight md:text-7xl">
              Map the fiction.<br />Walk the reality.
            </h3>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link href="/research" className="bg-akhand-accent px-12 py-4 text-xs font-semibold uppercase tracking-widest text-akhand-bg hover:bg-akhand-accent-hover">
                Access Research Ledger
              </Link>
              <Link href="/explore" className="border border-akhand-border-light px-12 py-4 text-xs uppercase tracking-widest text-akhand-accent hover:border-akhand-accent">
                Launch Spatial Explore
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-akhand-border/20 bg-[#0d0d0d]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 py-12 md:flex-row md:px-8">
          <div>
            <p className="font-serif text-lg font-bold uppercase">Akhand</p>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-akhand-text-muted">Literary geographies platform</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 text-[10px] uppercase tracking-widest text-akhand-text-muted">
            <Link href="/research" className="hover:text-akhand-accent">Research</Link>
            <Link href="/explore" className="hover:text-akhand-accent">Explore</Link>
            <Link href="/stories/literary-mumbai" className="hover:text-akhand-accent">Stories</Link>
            <a href="https://github.com/CodeRustyPro/akhand" target="_blank" rel="noopener noreferrer" className="hover:text-akhand-accent">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
