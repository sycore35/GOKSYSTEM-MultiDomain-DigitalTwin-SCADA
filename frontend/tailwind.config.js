/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        graphite: {
          950: '#111315',
          900: '#17191B', // Main application background
          850: '#1C1F22',
          800: '#202326', // Main panels
          750: '#24272B',
          700: '#272B2E', // Elevated surfaces
          650: '#2E3337', // Panel hover
          600: '#373C40', // Borders & separators
          500: '#4A5156', // Strong borders
          400: '#6E757C', // Muted text tertiary
          300: '#A0A6AB', // Secondary text
          200: '#C8CDD0',
          100: '#E8EAEC', // Primary soft off-white text
          50: '#F4F5F6',
        },
        scada: {
          bg: '#17191B',
          panel: '#202326',
          elevated: '#272B2E',
          hover: '#2E3337',
          border: '#373C40',
          borderStrong: '#4A5156',
          text: '#E8EAEC',
          muted: '#A0A6AB',
          dim: '#6E757C',
          amber: '#E6A23C',      // Restrained Industrial Amber
          amberDark: '#B27B2B',
          amberLight: '#F3B755',
          running: '#22C55E',    // Restrained Industrial Green
          warning: '#E6A23C',    // Industrial Amber
          fault: '#EF4444',      // Controlled Industrial Red
          offline: '#6B7280',    // Neutral Gray
        }
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Sans', 'Segoe UI', 'system-ui', 'sans-serif'],
        value: ['IBM Plex Mono', 'SF Mono', 'Menlo', 'monospace']
      }
    },
  },
  plugins: [],
}