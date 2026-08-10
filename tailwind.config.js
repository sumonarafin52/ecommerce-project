// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#131921", // deep dark navy — page/header/footer bg
        "primary-light": "#232F3E", // secondary surfaces — cards, borders, hover
        accent: "#FF9900", // warm orange — CTA, highlights, deals
      },
      boxShadow: {
        card: "0 4px 16px rgba(0, 0, 0, 0.4)",
        glow: "0 0 12px rgba(255, 153, 0, 0.35)",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-in-out",
        "slide-up": "slideUp 0.5s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: 0 },
          "100%": { opacity: 1 },
        },
        slideUp: {
          "0%": { opacity: 0, transform: "translateY(12px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};