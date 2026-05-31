/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@neondatabase/serverless'],
    // Bundle the CSV file with the /api/seed serverless function
    outputFileTracingIncludes: {
      '/api/seed': ['./public/data/deals.csv'],
    },
  },
}

module.exports = nextConfig
