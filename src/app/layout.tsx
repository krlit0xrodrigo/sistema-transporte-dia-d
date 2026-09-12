import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logística Día D — Villa Hayes",
  description: "Gestión de choferes del operativo",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY">
      <body className="min-h-screen text-slate-900 antialiased">{children}</body>
    </html>
  );
}
