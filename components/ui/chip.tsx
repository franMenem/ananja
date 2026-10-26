/** Clases de un chip de filtro: píldora de 44px de alto, 15px. Activo = color
 * principal; inactivo = blanco con borde. */
export function claseChip(activo: boolean): string {
  return `inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors ${
    activo
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-surface text-text hover:bg-background"
  }`;
}
