module.exports = {
  darkMode: 'class',
  content: [
    './app/frontend/**/*.{js,jsx}',
    './app/views/spa/**/*.haml'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Work Sans', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
