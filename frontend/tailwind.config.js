/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'mosaic': {
          bg: '#050508',
          'bg-secondary': '#0a0a12',
          card: '#0d0d18',
          elevated: '#12121f',
          border: '#1a1a2e',
          'border-bright': '#252540',
        },
        'brand': {
          purple: '#a855f7',
          'purple-dim': '#7c3aed',
          'purple-bright': '#c084fc',
          cyan: '#06b6d4',
          'cyan-dim': '#0891b2',
          'cyan-bright': '#22d3ee',
        },
        'money': {
          gold: '#fbbf24',
          'gold-bright': '#fcd34d',
        },
        'agent': {
          coordinator: '#a855f7',
          research: '#06b6d4',
          analyst: '#22c55e',
          writer: '#f59e0b',
        },
        'status': {
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'breathing': 'breathing 3s ease-in-out infinite',
        'rotate-slow': 'rotate-slow 8s linear infinite',
        'shake': 'shake 0.5s ease-in-out',
      },
      boxShadow: {
        'glow-purple': '0 0 20px rgba(168, 85, 247, 0.4), 0 0 40px rgba(168, 85, 247, 0.2)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.4), 0 0 40px rgba(6, 182, 212, 0.2)',
        'glow-gold': '0 0 20px rgba(251, 191, 36, 0.5), 0 0 40px rgba(251, 191, 36, 0.2)',
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.4)',
        'glow-red': '0 0 20px rgba(239, 68, 68, 0.5), 0 0 40px rgba(239, 68, 68, 0.2)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'gradient-mesh': 'radial-gradient(at 20% 20%, rgba(168, 85, 247, 0.1) 0%, transparent 50%), radial-gradient(at 80% 80%, rgba(6, 182, 212, 0.1) 0%, transparent 50%)',
      },
    },
  },
  plugins: [],
};
