import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Identidad visual del operativo + shadcn/ui.
 *
 * El rojo es de la marca, no del fondo. Se usa para lo que el operador
 * tiene que encontrar rápido —la acción principal, la pestaña activa, el
 * dato que urge— y para nada más. Una pantalla roja entera cansa en la
 * segunda hora y esta gente la va a mirar doce horas seguidas el 4 de
 * octubre.
 *
 * La superficie es blanca sobre un lienzo gris muy claro, que es lo que
 * hace legible una tabla de 600 filas.
 */
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /* ─── shadcn/ui CSS variables ─── */
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },

        /* ─── Tokens del operativo (identidad visual) ─── */
        colorado: {
          DEFAULT: "#C00000",
          50: "#FDF1F1",
          100: "#FADCDC",
          200: "#F2B8B8",
          300: "#E88A8A",
          400: "#D44B4B",
          500: "#C00000",
          600: "#C00000",
          700: "#A30000",
          800: "#7F0000",
          900: "#5C0000",
        },
        tinta: {
          DEFAULT: "#333333",
          suave: "#5F5F63",
          tenue: "#8A8A90",
        },
        lienzo: "#F5F5F6",
        borde: "#E4E4E7",

        /* ─── Estados semánticos ─── */
        success: {
          DEFAULT: "#16a34a",
          50: "#f0fdf4",
          100: "#dcfce7",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#d97706",
          50: "#fffbeb",
          100: "#fef3c7",
          foreground: "#ffffff",
        },
        danger: {
          DEFAULT: "#dc2626",
          50: "#fef2f2",
          100: "#fee2e2",
          foreground: "#ffffff",
        },
        info: {
          DEFAULT: "#2563eb",
          50: "#eff6ff",
          100: "#dbeafe",
          foreground: "#ffffff",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        tarjeta: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
        elevada: "0 4px 12px -2px rgb(0 0 0 / 0.10)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
