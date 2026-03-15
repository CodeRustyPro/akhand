/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@deck.gl/core',
    '@deck.gl/layers',
    '@deck.gl/aggregation-layers',
    '@deck.gl/mapbox',
  ],
};

export default nextConfig;
