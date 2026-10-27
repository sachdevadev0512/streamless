/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        netflix: {
          red: '#E50914',
          darkRed: '#B20710',
          black: '#141414',
          darkGray: '#1a1a2e',
          gray: '#2a2a3e',
          lightGray: '#8c8c8c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
