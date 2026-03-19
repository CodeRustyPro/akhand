import fs from 'node:fs/promises';
import path from 'node:path';
import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { ResearchLedgerClient } from '@/components/research/ResearchLedgerClient';

interface ResearchSummary {
  sourceRows?: number;
  filteredOutNonfictionRows?: number;
  totalRows: number;
  reviewedRows: number;
  reviewedCoverageRate: number;
  singlePlaceRows: number;
  multiPlaceRows: number;
  unknownRows: number;
  fictionalRows: number;
  nonfictionRows: number;
  narrativeRows: number;
  systemTierCountsReviewed: Record<string, number>;
  recordTypeCounts: Record<string, number>;
}

interface ReviewedEntry {
  sampleId: number;
  id: string;
  workTitle: string;
  author: string;
  places: string[];
  primaryPlace: string;
  placeCount: number;
  isMultiPlace: boolean;
  confidence: number;
  lon: number;
  lat: number;
  recordType: string;
  notes: string;
  status: string;
}

export const metadata: Metadata = {
  title: 'Research | Akhand',
  description:
    'Public research ledger for literary places with multi-place records and explanatory notes.',
};

async function loadResearchData(): Promise<{
  summary: ResearchSummary;
  entries: ReviewedEntry[];
}> {
  const dataDir = path.join(process.cwd(), 'public', 'data', 'research');
  const [summaryRaw, entriesRaw] = await Promise.all([
    fs.readFile(path.join(dataDir, 'summary.json'), 'utf8'),
    fs.readFile(path.join(dataDir, 'ai_reviewed_entries.json'), 'utf8'),
  ]);

  return {
    summary: JSON.parse(summaryRaw) as ResearchSummary,
    entries: JSON.parse(entriesRaw) as ReviewedEntry[],
  };
}

export default async function ResearchPage() {
  const { summary, entries } = await loadResearchData();

  return (
    <main className="min-h-screen bg-akhand-bg text-akhand-text-primary">
      <div className="mx-auto max-w-7xl px-6 py-8 md:py-12">
        <div className="mb-8 flex items-center justify-between gap-4 border-b border-akhand-border pb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-akhand-text-muted hover:text-akhand-text-primary"
          >
            <span className="font-serif text-lg text-akhand-accent">A</span>
            Akhand
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="rounded-full border border-akhand-border px-4 py-2 text-sm text-akhand-text-secondary hover:text-akhand-text-primary"
            >
              Explore Dataset
            </Link>
            <Link
              href="/stories/literary-mumbai"
              className="inline-flex items-center gap-1 rounded-full border border-akhand-accent/30 px-4 py-2 text-sm text-akhand-accent hover:bg-akhand-accent/10"
            >
              Narrative Example
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <section className="mb-10">
          <h1 className="max-w-4xl font-serif text-4xl leading-tight md:text-5xl">
            Literary works, resolved places, and research notes
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-akhand-text-secondary md:text-base">
            This page is designed for direct public usefulness: each work shows resolved place anchors,
            multiple places where needed, and a clear note explaining complexity. Records that do not
            map to a concrete narrative place are marked as Unknown or Fictional explicitly.
            Non-fiction references are excluded from this ledger.
            The analysis below is generated from shipped artifacts in
            <span className="text-akhand-text-primary"> /public/data/research</span>.
          </p>
        </section>
        <Suspense
          fallback={
            <section className="mb-10 rounded-2xl border border-akhand-border bg-akhand-surface p-6 text-sm text-akhand-text-muted">
              Loading research ledger...
            </section>
          }
        >
          <ResearchLedgerClient summary={summary} entries={entries} />
        </Suspense>
      </div>
    </main>
  );
}