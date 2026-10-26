import Link from "next/link";

import { InsumoUmbral } from "@/components/stock/insumo-umbral";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
import { VolverLink } from "@/components/volver-link";
import { obtenerInsumo } from "@/lib/data/insumos";
import { formatFechaHoraSinAnio } from "@/lib/fechas";
import { formatCantidadConUnidad } from "@/lib/dominio/insumos";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InsumoDetailPage({
  params,
}: PageProps<"/stock/insumos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  let detalle: Awaited<ReturnType<typeof obtenerInsumo>> = null;
  let errorMensaje: string | null = null;
  try {
    detalle = await obtenerInsumo(supabase, id);
  } catch (err) {
    errorMensaje = err instanceof Error ? err.message : "No se pudo cargar el insumo.";
  }

  if (errorMensaje || !detalle) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/stock/insumos" label="insumos" corto />
        {errorMensaje ? (
          <p role="alert" className="text-[16px] text-accent">
            {errorMensaje}
          </p>
        ) : (
          <p className="text-[16px] text-text-muted">No encontramos el insumo.</p>
        )}
      </div>
    );
  }

  const { insumo, stock, movimientos } = detalle;

  const hayMovimientos = movimientos.length > 0;
  return (
    <div className="mx-auto flex w-full max-w-[760px] min-w-0 flex-col gap-6 pb-8">
      <VolverLink href="/stock/insumos" label="insumos" corto />

      <EncabezadoPantalla
        titulo={insumo.nombre}
        pregunta="¿Cuánto queda y qué pasó con este insumo?"
      />

      <Tarjeta como="section" aria-label="Cuánto queda" className="flex flex-col gap-3">
        <NumeroGrande etiqueta="Queda">{formatCantidadConUnidad(stock?.stock ?? 0, insumo.unidad)}</NumeroGrande>
        <InsumoUmbral insumoId={insumo.id} umbralMinimo={insumo.umbral_minimo} />
      </Tarjeta>

      <Tarjeta como="section" aria-labelledby="insumo-historial" className="flex flex-col gap-1">
        <h2 id="insumo-historial" className="text-[20px] leading-tight font-semibold text-text">
          Historial
        </h2>
        <div className="flex flex-col divide-y divide-line">
          {!hayMovimientos ? (
            <p className="py-3 text-[16px] text-text-muted">Todavía no hay movimientos de este insumo.</p>
          ) : (
            movimientos.map((m) => {
              const esIngreso = m.tipo === "ingreso";
              let origen: React.ReactNode;
              if (m.gasto_id) {
                origen = (
                  <Link href={`/gastos/${m.gasto_id}`} className="inline-flex min-h-11 items-center text-primary underline decoration-mark underline-offset-4">
                    Compra
                  </Link>
                );
              } else if (m.lote_id) {
                origen = (
                  <Link
                    href={`/stock/lotes/${m.lote_id}`}
                    className="inline-flex min-h-11 items-center text-primary underline decoration-mark underline-offset-4"
                  >
                    Consumo de pedido
                  </Link>
                );
              } else {
                origen = <span className="text-text">Ajuste{m.nota ? ` · ${m.nota}` : ""}</span>;
              }

              return (
                <div key={m.id} className="flex min-h-14 items-center gap-3 py-2">
                  <span aria-hidden="true" className={`w-[13px] shrink-0 ${esIngreso ? "text-secondary" : "text-text-muted"}`}>
                    {esIngreso ? "+" : "−"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[16px]">{origen}</span>
                    <span className="text-[14px] text-text-muted">
                      {formatFechaHoraSinAnio(m.created_at)} · {m.vendedores?.nombre ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[16px] text-text-muted tabular-nums">
                    {formatCantidadConUnidad(m.cantidad, insumo.unidad)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </Tarjeta>
    </div>
  );
}
