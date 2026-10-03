"use client";

type SeccionQuienProps = {
  vendedorLoading: boolean;
  /** `true` si `useVendedorActual` ya resolvió un vendedor vinculado —
   * separado del nombre a mostrar porque el chequeo original es sobre el
   * objeto (`!vendedor`), no sobre su nombre. */
  vendedorExiste: boolean;
  vendedorNombre: string | null | undefined;
  fecha: string;
  onFechaChange: (value: string) => void;
  nota: string;
  onNotaChange: (value: string) => void;
};

/** Paso 5 · Quién y cuándo (vendedor, fecha, nota) — extraído de
 * `components/comprobante-form.tsx`. */
export function SeccionQuien({
  vendedorLoading,
  vendedorExiste,
  vendedorNombre,
  fecha,
  onFechaChange,
  nota,
  onNotaChange,
}: SeccionQuienProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        5 · Quién y cuándo
      </span>

      <div className="flex gap-2.5">
        <div className="flex min-h-12 flex-1 items-center border border-border bg-surface px-3.5 text-sm text-text">
          {vendedorLoading ? "Cargando…" : (vendedorNombre ?? "Sin vendedor")}
        </div>
        <input
          id="fecha"
          type="date"
          required
          aria-label="Fecha"
          value={fecha}
          onChange={(event) => onFechaChange(event.target.value)}
          className="min-h-12 border border-border bg-surface px-3.5 text-base text-text tabular-nums focus:border-primary"
        />
      </div>
      {!vendedorLoading && !vendedorExiste && (
        <p role="alert" className="text-xs text-accent">
          Tu usuario no está vinculado a un vendedor. Pedile al dueño que te
          dé de alta desde el dashboard de Supabase.
        </p>
      )}

      <textarea
        id="nota"
        value={nota}
        onChange={(event) => onNotaChange(event.target.value)}
        rows={2}
        placeholder="Nota (opcional)"
        className="min-h-[60px] border border-border bg-surface px-3.5 py-2 text-base text-text placeholder:text-text-muted focus:border-primary"
      />
    </div>
  );
}
