"use client";

import { AreaTexto, Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { MasDatos } from "@/components/ui/seccion-form";
import { formatFecha, hoyISO } from "@/lib/fechas";

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
    <div className="flex flex-col gap-4">
      {vendedorLoading ? (
        <p className="text-[14px] text-text-muted">Cargando…</p>
      ) : vendedorExiste ? (
        <p className="text-[14px] text-text-muted">
          Cargado por <span className="font-semibold text-text">{vendedorNombre ?? "Sin vendedor"}</span>
          {fecha ? ` · ${formatFecha(fecha)}` : ""}
        </p>
      ) : (
        <MensajeError>
          Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta desde el
          dashboard de Supabase.
        </MensajeError>
      )}

      <MasDatos abierto={nota.trim() !== "" || (fecha !== "" && fecha !== hoyISO())}>
        <Campo id="fecha" etiqueta="Fecha de la venta">
          <Entrada
            type="date"
            required
            value={fecha}
            onChange={(event) => onFechaChange(event.target.value)}
            className="tabular-nums"
          />
        </Campo>
        <Campo id="nota" etiqueta="Nota" opcional>
          <AreaTexto
            value={nota}
            onChange={(event) => onNotaChange(event.target.value)}
            rows={2}
            placeholder="Algo que quieras recordar de esta venta"
          />
        </Campo>
      </MasDatos>
    </div>
  );
}
