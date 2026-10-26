import Link from "next/link";

import { HeroeBotellas } from "@/components/stock/deposito/heroe-botellas";
import { ParaProducir } from "@/components/stock/deposito/para-producir";
import { PresentacionDeposito } from "@/components/stock/deposito/presentacion-deposito";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { obtenerDeposito } from "@/lib/data/stock";
import { alcancePorPresentacion, repartoPorTamano, totalBotellas } from "@/lib/dominio/botellas";
import { segmentosDeposito, type LoteConQuedan } from "@/lib/dominio/deposito-lotes";
import { leerFormasProveedor } from "@/lib/proveedor-servidor";
import { createClient } from "@/lib/supabase/server";

// Datos en vivo: nunca cachear el stock (debe reflejar el último movimiento).
export const dynamic = "force-dynamic";

/**
 * "Botellas": responde "¿cuántas tengo y dónde están?". El héroe suma el
 * depósito (`v_stock_actual`) y lo que tienen las revendedoras
 * (`v_stock_revendedor`, la misma suma que `/revendedores`); "Por tamaño"
 * baja a cada presentación, con el reparto por pedido de lo que queda en el
 * depósito (`lib/dominio/deposito-lotes.ts`); y "Para producir" resume el
 * aceite y las etiquetas que quedan en el proveedor. Los costos y la plata
 * viven en Pedidos (`/stock/lotes`) y en Plata.
 */
export default async function StockPage() {
  const supabase = await createClient();

  const [{ stockRows, recetasRows, tanqueRows, stockPorLote, stockInsumos, enManos }, proveedor] = await Promise.all([
    obtenerDeposito(supabase),
    leerFormasProveedor(),
  ]);

  const totales = totalBotellas(stockRows, enManos ?? []);
  const presentaciones = repartoPorTamano(stockRows, enManos ?? []);

  // Reparto por pedido por producto, comparado contra `v_stock_actual.stock`
  // para mostrar aparte lo que no viene de ningún pedido.
  const lotesPorProducto = new Map<string, LoteConQuedan[]>();
  for (const fila of stockPorLote) {
    if (!fila.producto_id || !fila.lote_id) continue;
    const lista = lotesPorProducto.get(fila.producto_id) ?? [];
    lista.push({ loteId: fila.lote_id, fecha: fila.fecha ?? "", quedan: fila.quedan ?? 0 });
    lotesPorProducto.set(fila.producto_id, lista);
  }

  // Cuánto aceite/etiquetas quedan en el proveedor y para cuántas botellas
  // alcanzan — un insumo en 0/desconocido significa que nunca se cargó una
  // compra, no que el stock realmente sea 0.
  const stockPorInsumo = new Map(stockInsumos.map((s) => [s.insumo_id ?? "", s.stock ?? 0]));
  const productos = stockRows.map((s) => ({ id: s.producto_id ?? "", presentacion_ml: s.presentacion_ml ?? 0 }));
  const recetas = recetasRows.map((r) => ({
    producto_id: r.producto_id,
    insumo_id: r.insumo_id,
    cantidad: r.cantidad,
    tipoInsumo: r.insumos?.tipo ?? null,
  }));
  const alcanceAceite = alcancePorPresentacion({ productos, recetas, stockPorInsumo, tipo: "materia_prima" });
  const alcanceEtiqueta = alcancePorPresentacion({ productos, recetas, stockPorInsumo, tipo: "etiqueta" });

  const etiquetasRestantes = stockInsumos
    .filter((s) => s.tipo === "etiqueta")
    .reduce((acc, s) => acc + (s.stock ?? 0), 0);

  // Tanque de aceite (v_tanque_aceite): litros restantes y su valor al costo
  // promedio de las compras. Sin tanque, se suma el stock de materia prima.
  const tanque = tanqueRows[0] ?? null;
  const aceiteLitros =
    tanque?.litros_restantes ??
    stockInsumos.filter((s) => s.tipo === "materia_prima").reduce((acc, s) => acc + (s.stock ?? 0), 0);
  const aceiteValorCentavos = tanque?.valor_restante_centavos ?? null;

  return (
    <div className="@container flex w-full min-w-0 flex-col gap-6 pb-8">
      <EncabezadoPantalla titulo="Botellas" pregunta="¿Cuántas tengo y dónde están?" />

      <div className="grid grid-cols-1 items-start gap-6 @3xl:grid-cols-2 @3xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <HeroeBotellas deposito={totales.deposito} revendedoras={enManos === null ? null : totales.revendedoras} />

          <Tarjeta como="section" aria-labelledby="botellas-tamano" className="flex flex-col gap-1">
            <h2 id="botellas-tamano" className="text-[20px] leading-tight font-semibold text-text">
              Por tamaño
            </h2>
            {presentaciones.length === 0 ? (
              <p className="py-3 text-[16px] text-text-muted">Todavía no hay presentaciones cargadas.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {presentaciones.map((p) => (
                  <PresentacionDeposito
                    key={p.productoId}
                    presentacion={p}
                    segmentos={segmentosDeposito(lotesPorProducto.get(p.productoId) ?? [], p.deposito)}
                  />
                ))}
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ParaProducir
            proveedorEn={proveedor.en}
            aceiteLitros={aceiteLitros}
            alcanceAceite={alcanceAceite}
            aceiteValorCentavos={aceiteValorCentavos}
            etiquetasRestantes={etiquetasRestantes}
            alcanceEtiqueta={alcanceEtiqueta}
          />

          <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <Link href="/stock/nuevo?tipo=egreso" className={`${BOTON_SECUNDARIO} flex px-4`}>
              − Egreso
            </Link>
            <Link href="/stock/movimientos" className={`${BOTON_SECUNDARIO} flex px-4`}>
              Ver movimientos
            </Link>
          </div>
        </div>
      </div>

      <Link
        href="/stock/proveedor"
        className="inline-flex min-h-11 w-fit items-center text-[14px] text-text-muted underline decoration-[#d0cec8] underline-offset-4"
      >
        Cambiar nombre del proveedor
      </Link>
    </div>
  );
}
