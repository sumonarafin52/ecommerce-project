// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#131921", // deep dark navy — page/header/footer bg
        "primary-light": "#232F3E", // secondary surfaces — cards, borders, hover
        // accent now reads from a CSS variable (--color-accent) so the admin
        // theme can swap it to a Shopify-green palette without editing any
        // component — see styles/globals.css :root and body.admin-theme
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-2": "rgb(var(--color-accent-2) / <alpha-value>)", // secondary gradient stop
      },
      boxShadow: {
        card: "0 4px 16px rgba(0, 0, 0, 0.4)",
        glow: "0 0 12px rgb(var(--color-accent) / 0.35)",
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