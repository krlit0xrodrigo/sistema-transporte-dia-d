import type { Config } from "tailwindcss";

/**
 * Identidad visual del operativo.
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
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rojo: {
          DEFAULT: "#C00000",
          600: "#C00000",
          700: "#A30000",
          800: "#7F0000",
          50: "#FDF1F1",
          100: "#FADCDC",
          200: "#F2B8B8",
        },
        tinta: {
          DEFAULT: "#333333",
          suave: "#5F5F63",
          tenue: "#8A8A90",
        },
        lienzo: "#F5F5F6",
        borde: "#E4E4E7",
      },
      fontFamily: {
        sans: ["var(--fuente)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        tarjeta: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
        elevada: "0 4px 12px -2px rgb(0 0 0 / 0.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
