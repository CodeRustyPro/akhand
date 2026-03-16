import { tours } from '@/lib/tours';
import StoryPageClient from './StoryPageClient';

export function generateStaticParams() {
  return tours.map((t) => ({ slug: t.slug }));
}

export default function StoryPage({ params }: { params: { slug: string } }) {
  return <StoryPageClient slug={params.slug} />;
}
