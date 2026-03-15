/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/akhand',
  images: { unoptimized: true },
  transpilePackages: [
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/aggregation-layers',
    '@deck.gl/mapbox',
  ],
};

export default nextConfig;
