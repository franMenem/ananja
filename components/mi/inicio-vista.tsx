import Link from "next/link";

import { HistorialPagos } from "@/components/mi/historial-pagos";
import { GananciaRevendedor } from "@/components/revendedores/ganancia-revendedor";
import { formatFecha } from "@/lib/fechas";
import type { VentaGanancia } from "@/lib/dominio/ganancia-revendedor";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";
import type { MovimientoPago } from "@/lib/dominio/pagos-revendedor";

/** Una entrega de la que todavía le quedan botellas de un producto. */
export type TramoStockMi = {
  entregaItemId: string;
  quedan: number;
  fecha: string;
  /** Lo que le debe a Ananja por botella, o `null` si todavía no hay precio. */
  costoCentavos: number | null;
  sugeridoCentavos: number | null;
};

export type StockProductoMi = {
  id: string;
  nombre: string | null;
  enPoder: number;
  tramos: TramoStockMi[];
};

type MiInicioVistaProps = {
  /** `null` si no se encontró la cuenta de revendedora (no se muestra la deuda). */
  nombre: string | null;
  debeCentavos: number;
  pendienteCentavos: number;
  encargadoNombre: string | null;
  /** Costo REAL de Ananja de todo lo que tiene sin vender
   * (`v_valor_stock_revendedor.valor_en_poder_centavos`, 0059) — lo que le
   * cobraron A ELLA, no necesariamente lo mismo que
   * `valor_en_poder_ananja_centavos` de la ficha de admin. */
  valorEnPoderCentavos: number;
  /** A quién le debe ese valor en poder: el nombre de su coordinador si
   * cobra con margen propio, o `null` para "Ananja" (encargado admin, o
   * sin encargado — arma `MiInicioVista` con la misma regla que ya usa
   * `app/(mi)/mi/page.tsx` para decidirlo). */
  valorEnPoderDestino: string | null;
  stock: StockProductoMi[];
  movimientos: MovimientoPago[];
  ventas: VentaGanancia[];
};

/**
 * Contenido de `/mi` (los datos los arma `app/(mi)/mi/page.tsx`). Server
 * Component sin funciones en las props.
 *
 * Mobile: una sola columna, en este orden — saludo, deuda + "Pagar",
 * stock, "Registrar venta", pagos, ganancia. Cuando el contenedor llega a
 * 48rem (escritorio con el rail, ver `components/mi/mi-shell.tsx`), pasa a
 * dos columnas: a la izquierda lo que hay que hacer (deuda, pagar,
 * registrar venta, últimos pagos) y a la derecha el stock por entrega y la
 * ganancia. Se mide el contenedor y no la pantalla porque el ancho libre
 * depende de si el rail está expandido o colapsado. Las columnas usan
 * `display: contents` en mobile, así cada bloque vuelve a ser hijo directo
 * de la columna única y `order-*` conserva el orden de siempre.
 */
export function MiInicioVista({
  nombre,
  debeCentavos,
  pendienteCentavos,
  encargadoNombre,
  valorEnPoderCentavos,
  valorEnPoderDestino,
  stock,
  movimientos,
  ventas,
}: MiInicioVistaProps) {
  const destinoPago = encargadoNombre ?? NEGOCIO.nombre;

  return (
    <div className="@container w-full">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 pb-8 @3xl:grid @3xl:max-w-[1240px] @3xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @3xl:items-start @3xl:gap-x-12 @6xl:gap-x-16">
        <h1 className="font-display text-[30px] leading-[1.05] text-primary @3xl:col-span-2 @3xl:text-[38px]">
          Hola{nombre ? `, ${nombre}` : ""}
        </h1>

        <div className="contents @3xl:flex @3xl:flex-col @3xl:gap-8">
          {nombre !== null && (
            <section className="order-1 flex flex-col gap-3 border-y border-border py-4 @3xl:py-5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
                  Le debés a {NEGOCIO.nombre}
                </span>
                <span className="font-display text-[32px] leading-none break-words text-accent tabular-nums @3xl:text-[40px]">
                  {formatCentavos(debeCentavos)}
                </span>
                {pendienteCentavos > 0 && (
                  <span className="text-sm text-text-muted">
                    Pendiente de confirmar{" "}
                    <span className="font-medium tabular-nums text-text">
                      {formatCentavos(pendienteCentavos)}
                    </span>
                  </span>
                )}
              </div>
              <span className="text-[13px] text-text-muted">
                {encargadoNombre
                  ? `Tu encargado es ${encargadoNombre}: le pagás a ${encargadoNombre} y ${encargadoNombre} lo pasa a la cuenta de ${NEGOCIO.nombre}.`
                  : `No tenés encargado: pagás directo a la cuenta de ${NEGOCIO.nombre}.`}
              </span>
              <Link
                href="/mi/pagar"
                className="flex min-h-[52px] items-center justify-center bg-primary px-4 text-center text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover"
              >
                Pagar a {destinoPago}
              </Link>
            </section>
          )}

          <Link
            href="/mi/ventas/nueva"
            className="order-3 flex min-h-[56px] items-center justify-center border border-primary text-[14px] font-medium tracking-[0.16em] text-primary uppercase hover:bg-surface-raised"
          >
            Registrar venta
          </Link>

          <section className="order-4 flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                Tus pagos
              </span>
              {movimientos.length > 3 && (
                <Link
                  href="/mi/ganancia"
                  className="border-b border-mark text-[11px] tracking-[0.12em] text-text uppercase"
                >
                  Ver todos
                </Link>
              )}
            </div>
            <HistorialPagos
              movimientos={movimientos}
              limite={3}
              vacio="Todavía no registraste pagos."
            />
          </section>
        </div>

        <div className="contents @3xl:flex @3xl:flex-col @3xl:gap-10">
          <section className="order-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="shrink-0 text-[10px] tracking-[0.22em] text-text-muted uppercase">Tu stock</span>
              {valorEnPoderCentavos > 0 && (
                <span className="min-w-0 break-words text-right text-[12px] text-text-muted">
                  Le debés a {valorEnPoderDestino ?? NEGOCIO.nombre}{" "}
                  <span className="font-medium tabular-nums text-text">{formatCentavos(valorEnPoderCentavos)}</span>
                </span>
              )}
            </div>
            {stock.length === 0 ? (
              <p className="py-6 text-sm text-text-muted">Todavía no hay productos cargados.</p>
            ) : (
              <div className="flex flex-col @3xl:border-t @3xl:border-border">
                {stock.map((p) => (
                  <div key={p.id} className="flex flex-col gap-1 border-b border-border py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 break-words font-display text-[19px] text-primary">
                        {p.nombre}
                      </span>
                      <span className="shrink-0 text-lg font-medium tabular-nums text-text">
                        {p.enPoder}
                      </span>
                    </div>
                    {p.tramos.length === 0 ? (
                      <span className="text-[11px] text-text-muted">
                        No tenés {envase(2)} de este producto.
                      </span>
                    ) : (
                      p.tramos.map((t) => (
                        <span key={t.entregaItemId} className="text-[11px] text-text-muted">
                          {t.quedan} de la entrega del {formatFecha(t.fecha)} ·{" "}
                          {t.costoCentavos !== null
                            ? `le debés ${formatCentavos(t.costoCentavos)} c/u`
                            : `${NEGOCIO.nombre} todavía no te asignó precio`}
                          {t.sugeridoCentavos !== null &&
                            ` · sugerido ${formatCentavos(t.sugeridoCentavos)}`}
                        </span>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="order-5">
            <GananciaRevendedor persona="vos" ventas={ventas} />
          </div>
        </div>
      </div>
    </div>
  );
}
