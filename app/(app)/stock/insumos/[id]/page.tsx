import Link from "next/link";

import { InsumoUmbral } from "@/components/stock/insumo-umbral";
import { VolverLink } from "@/components/volver-link";
import { obtenerInsumo } from "@/lib/data/insumos";
import { formatFechaHoraSinAnio } from "@/lib/fechas";
import { TIPO_INSUMO_LABELS, formatCantidadConUnidad } from "@/lib/dominio/insumos";
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
        <VolverLink href="/stock/insumos" label="insumos" />
        {errorMensaje ? (
          <p role="alert" className="text-sm text-accent">
            {errorMensaje}
          </p>
        ) : (
          <p className="text-sm text-text-muted">No encontramos el insumo.</p>
        )}
      </div>
    );
  }

  const { insumo, stock, movimientos } = detalle;

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/stock/insumos" label="insumos" />

        <div className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            {TIPO_INSUMO_LABELS[insumo.tipo as keyof typeof TIPO_INSUMO_LABELS] ?? insumo.tipo}
          </span>
          <h1 className="font-display text-[28px] text-primary">{insumo.nombre}</h1>
          <p className="font-display text-[22px] tabular-nums text-primary">
            {formatCantidadConUnidad(stock?.stock ?? 0, insumo.unidad)}
          </p>
          <InsumoUmbral insumoId={insumo.id} umbralMinimo={insumo.umbral_minimo} />
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
            Historial
          </span>
          <span
            className="h-px flex-1"
            style={{
              background: "linear-gradient(to right, var(--color-border), transparent)",
            }}
          />
        </div>

        <div className="flex flex-col">
          {movimientos.length === 0 ? (
            <p className="py-3 text-sm text-text-muted">
              Todavía no hay movimientos de este insumo.
            </p>
          ) : (
            movimientos.map((m) => {
              const esIngreso = m.tipo === "ingreso";
              let origen: React.ReactNode;
              if (m.gasto_id) {
                origen = (
                  <Link
                    href={`/gastos/${m.gasto_id}`}
                    className="border-b border-dotted border-mark text-primary"
                  >
                    Compra
                  </Link>
                );
              } else if (m.lote_id) {
                origen = (
                  <Link
                    href={`/stock/lotes/${m.lote_id}`}
                    className="border-b border-dotted border-mark text-primary"
                  >
                    Consumo de lote
                  </Link>
                );
              } else {
                origen = <span className="text-text">Ajuste{m.nota ? ` · ${m.nota}` : ""}</span>;
              }

              return (
                <div
                  key={m.id}
                  className="flex items-baseline gap-3 border-b border-border py-3"
                >
                  <span
                    aria-hidden="true"
                    className={`w-[13px] shrink-0 ${esIngreso ? "text-secondary" : "text-accent"}`}
                  >
                    {esIngreso ? "+" : "−"}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-[13px]">{origen}</span>
                    <span className="text-[11px] text-text-muted">
                      {formatFechaHoraSinAnio(m.created_at)} · {m.vendedores?.nombre ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] text-text-muted tabular-nums">
                    {formatCantidadConUnidad(m.cantidad, insumo.unidad)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
