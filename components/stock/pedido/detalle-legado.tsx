import Link from "next/link";

import { formatCentavos } from "@/lib/money";
import { formatPresentacion } from "@/lib/negocio";

const MOTIVO_LABELS: Record<string, string> = {
  degustacion: "Degustación",
  rotura: "Rotura",
  regalo: "Regalo",
  ajuste: "Ajuste",
  otro: "Otro",
};

type PerdidaMotivo = { motivo: string; unidades: number; costoCentavos: number };

type GastoLegacy = {
  id: string;
  monto_centavos: number;
  nota: string | null;
  producto_id: string | null;
  categorias_gasto: { nombre: string } | null;
  productos: { presentacion_ml: number } | null;
};

type DetalleLegadoProps = {
  perdidasPorMotivo: PerdidaMotivo[];
  gastosLegacy: GastoLegacy[];
};

/**
 * `<details>` "Ver pérdidas por motivo y gastos anteriores" del detalle de
 * un pedido (bloque 4): las pérdidas ya se cuentan en "Botellas" (bloque 3) — acá
 * está el desglose POR MOTIVO. Los gastos legado (anteriores a
 * `supabase/migrations/0028_costos_por_lote.sql`) solo aparecen si el
 * pedido tiene alguno; no desaparecen, pero tampoco compiten con el resto.
 */
export function DetalleLegado({ perdidasPorMotivo, gastosLegacy }: DetalleLegadoProps) {
  if (perdidasPorMotivo.length === 0 && gastosLegacy.length === 0) return null;

  return (
    <details className="group border-t border-border pt-3">
      <summary className="text-[12px] font-medium tracking-[0.06em] text-primary uppercase">
        Ver pérdidas por motivo y gastos anteriores
      </summary>
      <div className="mt-3 flex flex-col gap-5">
        {perdidasPorMotivo.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              Pérdidas por motivo
            </span>
            <div className="flex flex-col">
              {perdidasPorMotivo.map((p) => (
                <div
                  key={p.motivo}
                  className="flex items-baseline justify-between gap-2 border-b border-border py-2.5 text-[13px]"
                >
                  <span className="text-text">
                    {MOTIVO_LABELS[p.motivo] ?? p.motivo} · {p.unidades} unidades
                  </span>
                  <span className="text-text-muted tabular-nums">{formatCentavos(p.costoCentavos)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {gastosLegacy.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              Gastos asignados antes de esta actualización
            </span>
            <div className="flex flex-col">
              {gastosLegacy.map((gasto) => (
                <Link
                  key={gasto.id}
                  href={`/gastos/${gasto.id}`}
                  className="flex items-baseline justify-between gap-2 border-b border-border py-3 text-[13px]"
                >
                  <span className="text-text">
                    {gasto.categorias_gasto?.nombre ?? "Sin categoría"}
                    {gasto.nota ? ` · ${gasto.nota}` : ""}
                    <span className="ml-2 text-[11px] text-text-muted uppercase">
                      {gasto.producto_id && gasto.productos
                        ? formatPresentacion(gasto.productos.presentacion_ml)
                        : "Compartido"}
                    </span>
                  </span>
                  <span className="font-medium text-text tabular-nums">
                    {formatCentavos(gasto.monto_centavos)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
