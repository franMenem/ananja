import Link from "next/link";

import { HistorialPagos } from "@/components/mi/historial-pagos";
import { IconMas } from "@/components/icons";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { Fila } from "@/components/ui/fila";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { hoyISO, formatFecha } from "@/lib/fechas";
import { calcularGananciaRevendedor, gananciaDelMes, type VentaGanancia } from "@/lib/dominio/ganancia-revendedor";
import { estadoDeudaHero } from "@/lib/dominio/deuda-hero";
import type { MovimientoPago } from "@/lib/dominio/pagos-revendedor";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";

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
  /** Lo que le cobraron A ELLA por todo lo que tiene sin vender
   * (`v_valor_stock_revendedor.valor_en_poder_centavos`, 0059). */
  valorEnPoderCentavos: number;
  /** A quién le debe ese valor: el nombre de su coordinador si cobra con
   * margen propio, o `null` para "Ananja". */
  valorEnPoderDestino: string | null;
  stock: StockProductoMi[];
  movimientos: MovimientoPago[];
  ventas: VentaGanancia[];
  /** Mes de "Este mes ganaste" ("yyyy-mm"); por defecto, el de hoy. */
  periodoActual?: string;
};

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-text-muted"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/**
 * Contenido de `/mi` (los datos los arma `app/(mi)/mi/page.tsx`). Server
 * Component sin funciones en las props.
 *
 * El orden del DOM es el orden de lectura: saludo, columna de lo que hay que
 * hacer (deuda, pagar, registrar venta, botellas) y columna de resultados
 * (ganancia del mes, pagos). En mobile las dos columnas se apilan; cuando el
 * contenedor llega a 48rem (escritorio con el rail, ver
 * `components/mi/mi-shell.tsx`) quedan lado a lado. Se mide el contenedor y
 * no la pantalla porque el ancho libre depende del rail.
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
  periodoActual,
}: MiInicioVistaProps) {
  const destinoPago = encargadoNombre ?? NEGOCIO.nombre;
  const totalBotellas = stock.reduce((acc, p) => acc + p.enPoder, 0);
  const gananciaMes = gananciaDelMes(calcularGananciaRevendedor(ventas).porMes, periodoActual ?? hoyISO().slice(0, 7));
  const conEntregas = stock.filter((p) => p.tramos.length > 0);
  const conBotellas = stock.filter((p) => p.enPoder > 0);
  const deuda = estadoDeudaHero(debeCentavos, pendienteCentavos);
  const todoPagado = deuda.tipo === "todo-pagado";

  return (
    <div className="@container w-full">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 pb-8 @3xl:grid @3xl:max-w-[1100px] @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @3xl:items-start @3xl:gap-x-8">
        <h1 className="font-display text-[28px] leading-[1.1] font-bold break-words text-text @3xl:col-span-2">
          Hola{nombre ? `, ${nombre}` : ""}
        </h1>

        <div className="flex flex-col gap-5">
          {nombre !== null && (
            <Tarjeta como="section" className="flex flex-col gap-4">
              <NumeroGrande
                etiqueta={`Le debés a ${NEGOCIO.nombre}`}
                tono={deuda.tipo === "debe" || deuda.tipo === "parcial" ? "debe" : undefined}
              >
                {formatCentavos(debeCentavos)}
              </NumeroGrande>
              {deuda.tipo === "al-dia" && pendienteCentavos <= 0 && (
                <Pastilla variante="ok" className="w-fit">
                  Al día
                </Pastilla>
              )}
              {todoPagado && (
                <Pastilla variante="confirmar" className="w-fit max-w-full whitespace-normal! leading-snug!">
                  Ya pagaste todo, falta que {destinoPago} lo confirme
                </Pastilla>
              )}
              {(deuda.tipo === "parcial" || (deuda.tipo === "al-dia" && pendienteCentavos > 0)) && (
                <Pastilla variante="confirmar" className="w-fit max-w-full whitespace-normal! leading-snug!">
                  {formatCentavos(pendienteCentavos)} esperando que {destinoPago} lo confirme
                </Pastilla>
              )}
              {deuda.tipo === "parcial" && (
                <p className="text-[14px] text-text-muted">Te queda pagar {formatCentavos(deuda.quedaCentavos)}</p>
              )}
              <Link href="/mi/pagar" className={`${todoPagado ? BOTON_SECUNDARIO : BOTON_PRIMARIO} flex w-full px-4`}>
                Pagarle a {destinoPago}
              </Link>
              <p className="text-[14px] text-text-muted">
                {encargadoNombre
                  ? `Tu encargado es ${encargadoNombre}: le pagás a ${encargadoNombre} y ${encargadoNombre} lo pasa a la cuenta de ${NEGOCIO.nombre}.`
                  : `No tenés encargado: pagás directo a la cuenta de ${NEGOCIO.nombre}.`}
              </p>
            </Tarjeta>
          )}

          <Link href="/mi/ventas/nueva" className={`${BOTON_SECUNDARIO} flex w-full gap-2 px-4`}>
            <IconMas className="h-5 w-5" />
            Registré una venta
          </Link>

          <Tarjeta como="section" className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] leading-tight font-bold text-text">
              {totalBotellas === 0 ? `No tenés ${envase(2)} ahora` : `Tenés ${totalBotellas} ${envase(totalBotellas)}`}
            </h2>
            {stock.length === 0 ? (
              <p className="py-2 text-[16px] text-text-muted">Todavía no hay productos cargados.</p>
            ) : (
              totalBotellas > 0 && (
                <div className="flex flex-col divide-y divide-line">
                  {conBotellas.map((p) => (
                    <Fila key={p.id} titulo={p.nombre} valor={p.enPoder} />
                  ))}
                </div>
              )
            )}
            {totalBotellas > 0 && valorEnPoderCentavos > 0 && (
              <p className="text-[14px] text-text-muted">
                Cuando lo vendas le vas a deber a {valorEnPoderDestino ?? NEGOCIO.nombre}{" "}
                <span className="font-semibold whitespace-nowrap tabular-nums text-text">
                  {formatCentavos(valorEnPoderCentavos)}
                </span>
              </p>
            )}
            {conEntregas.length > 0 && (
              <details className="group mt-2 border-t border-line pt-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-primary [&::-webkit-details-marker]:hidden">
                  Ver de qué entrega es cada una
                  <span aria-hidden="true" className="text-text-muted transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="flex flex-col gap-3 pt-1 pb-1">
                  {conEntregas.map((p) => (
                    <div key={p.id} className="flex flex-col gap-1">
                      <span className="text-[16px] font-semibold text-text">{p.nombre}</span>
                      {p.tramos.map((t) => (
                        <span key={t.entregaItemId} className="text-[14px] text-text-muted">
                          {t.quedan} de la entrega del {formatFecha(t.fecha)} ·{" "}
                          {t.costoCentavos !== null
                            ? `le debés ${formatCentavos(t.costoCentavos)} c/u`
                            : `${NEGOCIO.nombre} todavía no te asignó precio`}
                          {t.sugeridoCentavos !== null && ` · sugerido ${formatCentavos(t.sugeridoCentavos)}`}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </Tarjeta>
        </div>

        <div className="flex flex-col gap-5">
          <Link
            href="/mi/ganancia"
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-background lg:p-5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[15px] text-text-muted">Este mes ganaste</span>
              <span
                className={`font-display text-[28px] leading-none break-words tabular-nums ${
                  gananciaMes > 0 ? "text-secondary" : "text-text"
                }`}
              >
                {formatCentavos(gananciaMes)}
              </span>
            </div>
            <Chevron />
          </Link>

          <Tarjeta como="section" className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[20px] leading-tight font-bold text-text">Tus pagos</h2>
              {movimientos.length > 3 && (
                <Link
                  href="/mi/ganancia"
                  className="inline-flex min-h-11 items-center text-[15px] font-semibold text-primary"
                >
                  Ver todos
                </Link>
              )}
            </div>
            <HistorialPagos movimientos={movimientos} limite={3} vacio="Todavía no registraste pagos." />
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
