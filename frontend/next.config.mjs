/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/akhand',
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: [
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/aggregation-layers',
    '@deck.gl/mapbox',
  ],
};

export default nextConfig;
