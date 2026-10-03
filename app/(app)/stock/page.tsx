import Link from "next/link";

import { StockCard } from "@/components/stock/stock-card";
import { estimarUnidadesProducibles, type RecetaInput } from "@/lib/dominio/calculos";
import { obtenerDeposito } from "@/lib/data/stock";
import { segmentosDeposito, type LoteConQuedan } from "@/lib/dominio/deposito-lotes";
import { formatCentavos } from "@/lib/money";
import { formatPresentacion, NEGOCIO } from "@/lib/negocio";
import { leerFormasProveedor } from "@/lib/proveedor-servidor";
import { createClient } from "@/lib/supabase/server";

// Datos en vivo: nunca cachear el stock (debe reflejar el último movimiento).
export const dynamic = "force-dynamic";

/**
 * "Depósito": responde una sola
 * pregunta, "¿cuántas botellas tengo y me alcanza?" — cuánto queda en
 * depósito por presentación, discriminado por pedido (`lib/deposito-lotes.ts`,
 * recuperado a pedido de Fran), y cuánto aceite/etiquetas quedan en el proveedor
 * y para cuántas botellas alcanzan. Los costos (que acá ya eran el
 * VIGENTE, `v_costo_lote_vigente`, 0052) y los avisos de plata pasaron a
 * vivir en Pedidos (`/stock/lotes`) y en Plata.
 */
export default async function StockPage() {
  const supabase = await createClient();

  const [{ stockRows, recetasRows, tanqueRows, stockPorLote, stockInsumos }, proveedor] = await Promise.all([
    obtenerDeposito(supabase),
    leerFormasProveedor(),
  ]);

  const bajoUmbral = stockRows.find((s) => s.bajo_umbral);

  // Reparto por pedido por producto (`lib/deposito-lotes.ts`), comparado
  // contra `v_stock_actual.stock` (el número grande que ya muestra la
  // tarjeta) para mostrar aparte lo que no viene de ningún pedido.
  const lotesPorProducto = new Map<string, LoteConQuedan[]>();
  for (const fila of stockPorLote) {
    if (!fila.producto_id || !fila.lote_id) continue;
    const lista = lotesPorProducto.get(fila.producto_id) ?? [];
    lista.push({ loteId: fila.lote_id, fecha: fila.fecha ?? "", quedan: fila.quedan ?? 0 });
    lotesPorProducto.set(fila.producto_id, lista);
  }
  const segmentosPorProducto = new Map(
    stockRows.map((s) => [
      s.producto_id ?? "",
      segmentosDeposito(lotesPorProducto.get(s.producto_id ?? "") ?? [], s.stock ?? 0),
    ]),
  );

  // Cuánto aceite/etiquetas quedan en el proveedor y para cuántas botellas
  // alcanzarían de cada presentación (estimarUnidadesProducibles,
  // lib/calculos.ts) — un insumo "0/desconocido" significa que nunca se
  // cargó una compra todavía, no que el stock realmente sea 0.
  const stockPorInsumo = new Map(stockInsumos.map((s) => [s.insumo_id ?? "", s.stock ?? 0]));
  const recetasMateriaPrima: RecetaInput[] = recetasRows
    .filter((r) => r.insumos?.tipo === "materia_prima")
    .map((r) => ({ producto_id: r.producto_id, insumo_id: r.insumo_id, cantidad: r.cantidad }));
  const recetasEtiqueta: RecetaInput[] = recetasRows
    .filter((r) => r.insumos?.tipo === "etiqueta")
    .map((r) => ({ producto_id: r.producto_id, insumo_id: r.insumo_id, cantidad: r.cantidad }));

  const etiquetaInsumos = stockInsumos.filter((s) => s.tipo === "etiqueta");
  const etiquetasRestantes = etiquetaInsumos.reduce((acc, s) => acc + (s.stock ?? 0), 0);

  // Tanque de aceite (v_tanque_aceite) — litros restantes y su valor al
  // costo promedio ponderado de las compras. Un solo insumo de materia
  // prima en la práctica (aceite/miel a granel) — se toma el primero.
  const tanque = tanqueRows[0] ?? null;
  const aceiteLitros =
    tanque?.litros_restantes ??
    stockInsumos.filter((s) => s.tipo === "materia_prima").reduce((acc, s) => acc + (s.stock ?? 0), 0);
  const aceiteValorCentavos = tanque?.valor_restante_centavos ?? null;

  // Productos con receta de materia prima / etiqueta, tomados de
  // `v_stock_actual` (ya trae producto_id + presentacion_ml de TODOS los
  // productos, igual que la tabla `productos`) para no repetir la query.
  const productosParaAlcance = stockRows.map((s) => ({
    id: s.producto_id ?? "",
    presentacion_ml: s.presentacion_ml ?? 0,
  }));
  const alcanceAceite = productosParaAlcance
    .map((p) => ({
      producto: p,
      unidades: estimarUnidadesProducibles(p.id, recetasMateriaPrima, stockPorInsumo),
    }))
    .filter((r) => r.unidades !== null);
  const alcanceEtiqueta = productosParaAlcance
    .map((p) => ({
      producto: p,
      unidades: estimarUnidadesProducibles(p.id, recetasEtiqueta, stockPorInsumo),
    }))
    .filter((r) => r.unidades !== null);

  return (
    <div className="flex flex-col pb-8">
      {bajoUmbral && (
        <div className="-mx-5 -mt-4 flex items-center gap-2.5 bg-accent px-5 py-[11px] text-background lg:-mx-[var(--page-px)] lg:-mt-[34px] lg:px-[var(--page-px)]">
          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 bg-background" />
          <span className="text-[12px]">
            {formatPresentacion(bajoUmbral.presentacion_ml)} quedó en{" "}
            <span className="font-semibold">{bajoUmbral.stock}</span> unidades
            · mínimo {bajoUmbral.umbral_minimo}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between py-6">
        <h1 className="font-display text-[38px] leading-[1.05] text-primary md:text-[38px]">
          Depósito
        </h1>
      </div>

      <div className="flex flex-col gap-2 pb-6 md:flex-row">
        <Link
          href="/stock/lotes/nuevo"
          className="flex min-h-[52px] flex-1 items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          + Pedido {proveedor.a}
        </Link>
        <Link
          href="/stock/nuevo?tipo=egreso"
          className="flex min-h-[52px] flex-1 items-center justify-center border border-accent px-4 text-[13px] font-medium tracking-[0.14em] text-accent uppercase"
        >
          − Egreso
        </Link>
      </div>

      <div className="flex flex-col gap-px bg-border md:grid md:grid-cols-[repeat(auto-fit,minmax(280px,1fr))] md:gap-0 md:border-t md:border-l md:border-border md:bg-transparent">
        {stockRows.map((stock) => (
          <StockCard
            key={stock.producto_id}
            stock={stock}
            segmentosDeposito={segmentosPorProducto.get(stock.producto_id ?? "") ?? []}
          />
        ))}
      </div>

      {/* Cuánto queda en el proveedor y para cuánto alcanza — sin stock cargado
          todavía (0/desconocido) se pide cargar la compra en vez de mostrar
          "alcanza para 0 botellas", que se leería como que no queda nada. */}
      <div className="flex flex-col gap-2 pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
            {proveedor.en}
          </span>
          <Link
            href="/stock/proveedor"
            className="shrink-0 text-[11px] text-text-muted underline decoration-dotted underline-offset-4"
          >
            Cambiar nombre del proveedor
          </Link>
        </div>
        {aceiteLitros > 0 ? (
          <p className="text-[13px] leading-snug text-text">
            {NEGOCIO.materiaPrima.nombre[0].toUpperCase() + NEGOCIO.materiaPrima.nombre.slice(1)}{" "}
            <span className="font-medium tabular-nums">{aceiteLitros} L</span>
            {alcanceAceite.length > 0 && (
              <>
                {" ≈ alcanza para "}
                {alcanceAceite
                  .map(
                    (a) =>
                      `${a.unidades} × ${formatPresentacion(a.producto.presentacion_ml)}`,
                  )
                  .join(" / ")}
              </>
            )}
            {aceiteValorCentavos != null && (
              <>
                {" · valor "}
                <span className="font-medium tabular-nums">
                  {formatCentavos(aceiteValorCentavos)}
                </span>
              </>
            )}
          </p>
        ) : (
          <Link
            href="/stock/insumos/factura"
            className="text-[13px] text-text-muted underline decoration-dotted underline-offset-4"
          >
            Cargá la compra de {NEGOCIO.materiaPrima.nombre} para ver cuánto queda
          </Link>
        )}

        {etiquetasRestantes > 0 ? (
          <p className="text-[13px] leading-snug text-text">
            Etiquetas <span className="font-medium tabular-nums">{etiquetasRestantes}</span>
            {alcanceEtiqueta.length > 0 && (
              <>
                {" ≈ alcanza para "}
                {alcanceEtiqueta
                  .map(
                    (a) =>
                      `${a.unidades} × ${formatPresentacion(a.producto.presentacion_ml)}`,
                  )
                  .join(" / ")}
              </>
            )}
          </p>
        ) : (
          <Link
            href="/stock/insumos/factura"
            className="text-[13px] text-text-muted underline decoration-dotted underline-offset-4"
          >
            Cargá la compra de etiquetas para ver cuánto queda
          </Link>
        )}
      </div>

      <Link
        href="/stock/movimientos"
        className="mt-6 self-start text-[13px] font-medium tracking-[0.06em] text-primary uppercase underline decoration-mark underline-offset-4"
      >
        Ver movimientos
      </Link>
    </div>
  );
}
