'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

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

interface Props {
  summary: ResearchSummary;
  entries: ReviewedEntry[];
}

function titleCase(value: string): string {
  return (value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function recordTypeTone(value: string): string {
  if (value === 'narrative') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (value === 'unknown') return 'border-amber-500/40 bg-amber-500/10 text-amber-100';
  if (value === 'fictional') return 'border-sky-500/40 bg-sky-500/10 text-sky-100';
  return 'border-akhand-border bg-akhand-surface-2 text-akhand-text-secondary';
}

function buildQuery(params: { q: string; page: number; limit: number }): string {
  const qp = new URLSearchParams();
  if (params.q) qp.set('q', params.q);
  qp.set('page', String(params.page));
  qp.set('limit', String(params.limit));
  return `?${qp.toString()}`;
}

export function ResearchLedgerClient({ summary, entries }: Props) {
  const searchParams = useSearchParams();

  const qRaw = (searchParams.get('q') || '').trim();
  const q = qRaw.toLowerCase();
  const parsedPage = Number(searchParams.get('page') || '1');
  const parsedLimit = Number(searchParams.get('limit') || '100');
  const limit = [50, 100, 200].includes(parsedLimit) ? parsedLimit : 100;

  const sortedRows = [...entries].sort((a, b) => a.sampleId - b.sampleId);
  const filteredRows = q
    ? sortedRows.filter((entry) => {
        const haystack = [
          entry.id,
          entry.workTitle,
          entry.author,
          entry.primaryPlace,
          entry.recordType,
          entry.notes,
          ...entry.places,
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
    : sortedRows;

  const totalFiltered = filteredRows.length;
  const uniqueSampleCount = new Set(entries.map((entry) => entry.sampleId)).size;
  const filteredUniqueSampleCount = new Set(filteredRows.map((entry) => entry.sampleId)).size;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 1), totalPages) : 1;
  const start = (page - 1) * limit;
  const end = start + limit;
  const pageRows = filteredRows.slice(start, end);

  return (
    <>
      <section className="mb-10 rounded-2xl border border-akhand-border bg-akhand-surface p-6">
        <h2 className="mb-4 text-xl font-semibold">Full Row Ledger ({summary.totalRows} Rows)</h2>
        <p className="mb-5 text-sm text-akhand-text-secondary">
          Every in-scope literary row is listed with all resolved place anchors, its primary anchor,
          and notes. This is the complete public-facing place ledger for the sample.
        </p>
        <p className="mb-5 text-xs text-akhand-text-muted">
          Source reviewed samples: {uniqueSampleCount}. A sample can appear in multiple ledger rows when it resolves to multiple places.
        </p>
        <form method="get" className="mb-5 grid gap-3 md:grid-cols-[1fr_140px_120px]">
          <input
            type="text"
            name="q"
            defaultValue={qRaw}
            placeholder="Search work, author, place, note"
            className="rounded-lg border border-akhand-border bg-akhand-surface-2 px-3 py-2 text-sm text-akhand-text-primary outline-none focus:border-akhand-accent"
          />
          <select
            name="limit"
            defaultValue={String(limit)}
            className="rounded-lg border border-akhand-border bg-akhand-surface-2 px-3 py-2 text-sm text-akhand-text-primary outline-none focus:border-akhand-accent"
          >
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
            <option value="200">200 / page</option>
          </select>
          <button
            type="submit"
            className="rounded-lg border border-akhand-accent/40 bg-akhand-accent/10 px-3 py-2 text-sm text-akhand-accent hover:bg-akhand-accent/20"
          >
            Apply
          </button>
        </form>
        <p className="mb-4 text-xs text-akhand-text-muted">
          Showing {totalFiltered === 0 ? 0 : start + 1}-{Math.min(end, totalFiltered)} of {totalFiltered} rows
          {' · '}
          {filteredUniqueSampleCount} reviewed samples in current result
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-akhand-text-muted">
                <th className="border-b border-akhand-border px-3 py-2">Row</th>
                <th className="border-b border-akhand-border px-3 py-2">Work</th>
                <th className="border-b border-akhand-border px-3 py-2">Places</th>
                <th className="border-b border-akhand-border px-3 py-2">Primary</th>
                <th className="border-b border-akhand-border px-3 py-2">Type</th>
                <th className="border-b border-akhand-border px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((entry, index) => (
                <tr key={entry.id} className="align-top">
                  <td className="border-b border-akhand-border px-3 py-3 text-akhand-text-muted">
                    <p>#{start + index + 1}</p>
                    <p className="mt-1 text-[11px]">sample #{entry.sampleId}</p>
                  </td>
                  <td className="border-b border-akhand-border px-3 py-3">
                    <p className="font-medium">{entry.workTitle}</p>
                    <p className="text-xs text-akhand-text-muted">{entry.author}</p>
                  </td>
                  <td className="border-b border-akhand-border px-3 py-3 text-akhand-text-secondary">
                    {entry.places.join(' | ')}
                  </td>
                  <td className="border-b border-akhand-border px-3 py-3 text-akhand-text-secondary">
                    {entry.primaryPlace}
                  </td>
                  <td className="border-b border-akhand-border px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${recordTypeTone(entry.recordType)}`}>
                      {titleCase(entry.recordType)}
                    </span>
                  </td>
                  <td className="border-b border-akhand-border px-3 py-3 text-xs leading-6 text-akhand-text-secondary">
                    {entry.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-akhand-text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={buildQuery({ q: qRaw, page: page - 1, limit })}
                className="rounded-md border border-akhand-border px-3 py-1 text-akhand-text-secondary hover:text-akhand-text-primary"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-md border border-akhand-border px-3 py-1 text-akhand-text-muted">Previous</span>
            )}
            {page < totalPages ? (
              <Link
                href={buildQuery({ q: qRaw, page: page + 1, limit })}
                className="rounded-md border border-akhand-border px-3 py-1 text-akhand-text-secondary hover:text-akhand-text-primary"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-md border border-akhand-border px-3 py-1 text-akhand-text-muted">Next</span>
            )}
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-5">
        <article className="rounded-2xl border border-akhand-border bg-akhand-surface p-5">
          <p className="text-xs text-akhand-text-muted">Rows In Ledger</p>
          <p className="mt-2 text-3xl font-semibold">{summary.totalRows}</p>
          <p className="mt-1 text-xs text-akhand-text-secondary">Literary-scope rows only</p>
        </article>
        <article className="rounded-2xl border border-akhand-border bg-akhand-surface p-5">
          <p className="text-xs text-akhand-text-muted">Narrative</p>
          <p className="mt-2 text-3xl font-semibold">{summary.narrativeRows}</p>
          <p className="mt-1 text-xs text-akhand-text-secondary">Core narrative geography rows</p>
        </article>
        <article className="rounded-2xl border border-akhand-border bg-akhand-surface p-5">
          <p className="text-xs text-akhand-text-muted">Multi-Place</p>
          <p className="mt-2 text-3xl font-semibold">{summary.multiPlaceRows}</p>
          <p className="mt-1 text-xs text-akhand-text-secondary">Rows with more than one place anchor</p>
        </article>
        <article className="rounded-2xl border border-akhand-border bg-akhand-surface p-5">
          <p className="text-xs text-akhand-text-muted">Unknown</p>
          <p className="mt-2 text-3xl font-semibold text-amber-200">{summary.unknownRows}</p>
          <p className="mt-1 text-xs text-akhand-text-secondary">Explicit unknowns, not forced geotags</p>
        </article>
        <article className="rounded-2xl border border-akhand-border bg-akhand-surface p-5">
          <p className="text-xs text-akhand-text-muted">Filtered Non-Fiction</p>
          <p className="mt-2 text-3xl font-semibold">{summary.filteredOutNonfictionRows || 0}</p>
          <p className="mt-1 text-xs text-akhand-text-secondary">Removed from public ledger scope</p>
        </article>
      </section>
    </>
  );
}
