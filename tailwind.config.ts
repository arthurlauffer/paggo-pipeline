import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#1e293b',
        'surface-2': '#263348',
        border: '#334155',
        muted: '#94a3b8',
        risk: {
          high: '#ef4444',
          medium: '#f59e0b',
          low: '#22c55e',
        },
      },
    },
  },
  plugins: [],
}
export default config
