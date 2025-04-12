/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
      extend: {
        keyframes: {
          pop: {
            '0%': { transform: 'scale(0.8)', opacity: '0' },
            '50%': { transform: 'scale(1.1)', opacity: '1' },
            '100%': { transform: 'scale(1)', opacity: '1' },
          },
        },
        animation: {
          pop: 'pop 0.3s ease-out',
        },
      },
    },
    plugins: [],
  };
  