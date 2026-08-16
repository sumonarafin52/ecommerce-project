// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#131921", // deep dark navy — admin panel & not-yet-redesigned pages
        "primary-light": "#232F3E",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-2": "rgb(var(--color-accent-2) / <alpha-value>)",

        // ===== Storefront redesign palette (warm cream bazaar theme) =====
        // New, separate token set — deliberately NOT reusing primary/accent
        // above, so pages not yet migrated to this design keep working
        // exactly as before. Rolled out page by page starting with the
        // homepage; every future page reuses these same names.
        cream: {
          bg: "#FBF5E9",
          alt: "#F4E9CE",
          white: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#2B2318",
          soft: "#5C5140",
          muted: "#8C8168",
        },
        indigo: {
          950: "#1E3A5F",
          900: "#2C5282",
          700: "#3D6B96",
          100: "#E9EEF5",
        },
        gold: {
          DEFAULT: "#C98A2B",
          dark: "#A8721F",
          light: "#F4E4C4",
        },
        maroon: "#8B2E3C",
        brick: "#A13A3A",
        line: "#E7DAB9",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body2: ["var(--font-publicsans)", "sans-serif"],
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