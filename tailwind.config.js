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
        // The brand navy, overriding Tailwind's own indigo. Only 950/900/700/100
        // were defined, so the other seven steps fell through to Tailwind's
        // default violet — which is why a navy `bg-indigo-900` button hovered
        // to violet `indigo-800` on the product listing and in Reviews, and why
        // Tax, Notifications and Downloads came out violet while every other
        // admin page is navy. The ramp is now complete, so no step can land
        // outside the brand.
        indigo: {
          50: "#F3F7FB",
          100: "#E9EEF5",
          200: "#CFDDEB",
          300: "#A9C2DA",
          400: "#7B9DC2",
          500: "#5A8AB4",
          600: "#4A77A0",
          700: "#3D6B96",
          800: "#345C8A",
          900: "#2C5282",
          950: "#1E3A5F",
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
      // Three steps, no more. Each shadow is tinted with the ink colour
      // (#2B2318) rather than pure black: a neutral-black shadow on a warm
      // cream page reads as grey dirt under the card, which is what made
      // every surface look slightly muddy. `card` was 0.4 alpha black — a
      // shadow built for the dark admin theme, used on the cream storefront.
      boxShadow: {
        card: "0 4px 16px rgba(0, 0, 0, 0.4)", // legacy, dark admin surfaces only
        e1: "0 1px 2px rgba(43, 35, 24, 0.06), 0 1px 3px rgba(43, 35, 24, 0.04)",
        e2: "0 2px 4px rgba(43, 35, 24, 0.05), 0 4px 12px rgba(43, 35, 24, 0.07)",
        e3: "0 4px 8px rgba(43, 35, 24, 0.06), 0 12px 28px rgba(43, 35, 24, 0.10)",
        glow: "0 0 12px rgb(var(--color-accent) / 0.35)",
      },
      // Radius carries hierarchy: r-sm for controls that sit inside
      // something, r-md for cards, r-lg for the few surfaces that are a
      // whole panel. Previously rounded-md/lg/xl/[10px] were mixed with no
      // rule, so nothing read as a level.
      borderRadius: {
        "r-sm": "6px",
        "r-md": "10px",
        "r-lg": "16px",
      },
      transitionTimingFunction: {
        ui: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        ui: "180ms",
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