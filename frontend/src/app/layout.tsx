import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Akhand | Literary Geography Platform',
  description:
    'Mapping the geography of fiction. Extract place references from novels, geocode them, and render them as interactive, searchable maps.',
  keywords: [
    'literary geography',
    'literary mapping',
    'NLP',
    'digital humanities',
    'geoparsing',
    'fiction',
    'spatial humanities',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
