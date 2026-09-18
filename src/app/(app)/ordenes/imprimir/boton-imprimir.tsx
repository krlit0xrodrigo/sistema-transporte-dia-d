"use client";

export function BotonImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm transition-colors"
    >
      Imprimir Planillas
    </button>
  );
}
