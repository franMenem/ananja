import Link from "next/link";

import { listarStockInsumos } from "@/lib/data/insumos";
import { agruparPorTipo, formatCantidadConUnidad } from "@/lib/dominio/insumos";
import { createClient } from "@/lib/supabase/server";

// Datos en vivo: nunca cachear el stock de insumos (debe reflejar el
// último movimiento), mismo criterio que /stock.
export const dynamic = "force-dynamic";

export default async function InsumosPage() {
  const supabase = await createClient();
  const { data: stock, error } = await listarStockInsumos(supabase);
  const grupos = agruparPorTipo(stock);
  const bajoUmbral = stock.filter((s) => s.bajo_umbral);

  return (
    <div className="flex flex-col pb-8">
      {bajoUmbral.length > 0 && (
        <div className="-mx-5 -mt-4 flex items-center gap-2.5 bg-accent px-5 py-[11px] text-background lg:-mx-[var(--page-px)] lg:-mt-[34px] lg:px-[var(--page-px)]">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-background" />
          <span className="text-[12px]">
            {bajoUmbral.length === 1
              ? "1 insumo está bajo el mínimo."
              : `${bajoUmbral.length} insumos están bajo el mínimo.`}
          </span>
        </div>
      )}

      <div className="hidden items-center justify-between py-6 md:flex">
        <h1 className="font-display text-[38px] leading-[1.05] text-primary">
          Insumos
        </h1>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-accent">
          {error}
        </p>
      )}

      {!error && grupos.length === 0 && (
        <p className="py-6 text-sm text-text-muted">
          Todavía no cargaste ningún insumo.
        </p>
      )}

      {grupos.map((grupo) => (
        <div key={grupo.tipo} className="flex flex-col">
          <div className="flex items-center gap-2.5 pt-6 pb-2">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              {grupo.nombre}
            </span>
            <span
              className="h-px flex-1"
              style={{
                background:
                  "linear-gradient(to right, var(--color-border), transparent)",
              }}
            />
          </div>
          <div className="flex flex-col gap-px bg-border md:grid md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] md:gap-0 md:border-t md:border-l md:border-border md:bg-transparent">
            {grupo.insumos.map((insumo) => {
              // Sin stock (0 o menos) es un caso distinto de "bajo el
              // mínimo": con umbral_minimo = 0 (los insumos recién dados de
              // alta después de un vaciado de datos), bajo_umbral nunca es
              // true aunque el stock esté literalmente en cero — ver
              // v_stock_insumos (supabase/migrations/0017_insumos.sql). Acá
              // se prioriza el hint de "sin stock" sobre "bajo el mínimo"
              // cuando los dos aplicarían a la vez.
              const sinStock = (insumo.stock ?? 0) <= 0;
              return (
                <div
                  key={insumo.insumo_id}
                  className={`flex items-center justify-between gap-3 bg-surface-raised p-[18px] md:border-r md:border-b md:border-border ${
                    sinStock
                      ? "border-l-[3px] border-mark"
                      : insumo.bajo_umbral
                        ? "border-l-[3px] border-accent"
                        : "border-l-[3px] border-secondary"
                  }`}
                >
                  <Link
                    href={`/stock/insumos/${insumo.insumo_id}`}
                    className="text-[14px] text-text"
                  >
                    {insumo.nombre}
                  </Link>
                  <span className="flex flex-col items-end gap-1">
                    <Link
                      href={`/stock/insumos/${insumo.insumo_id}`}
                      className="font-display text-[20px] whitespace-nowrap text-primary tabular-nums"
                    >
                      {formatCantidadConUnidad(
                        insumo.stock ?? 0,
                        insumo.unidad ?? "unidad",
                      )}
                    </Link>
                    {sinStock ? (
                      <Link
                        href={`/stock/insumos/factura?insumo=${insumo.insumo_id}`}
                        className="text-[10px] tracking-[0.12em] text-mark uppercase underline underline-offset-2"
                      >
                        Sin stock — registrá la compra
                      </Link>
                    ) : (
                      insumo.bajo_umbral && (
                        <span className="text-[10px] tracking-[0.12em] text-accent uppercase">
                          Bajo el mínimo
                        </span>
                      )
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2 pt-8 sm:flex-row">
        <Link
          href="/stock/insumos/factura"
          className="flex min-h-[52px] flex-1 items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          + Cargar compra
        </Link>
        <Link
          href="/stock/insumos/ajuste"
          className="flex min-h-[52px] flex-1 items-center justify-center border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase"
        >
          Ajustar
        </Link>
      </div>
      <Link
        href="/stock/insumos/nuevo"
        className="mt-2 self-start text-[12px] font-medium tracking-[0.06em] text-text-muted uppercase underline decoration-mark underline-offset-4"
      >
        Nuevo insumo
      </Link>
    </div>
  );
}
