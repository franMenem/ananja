import type { ReactNode } from "react";

import { AsignarRolButton } from "@/components/revendedores/asignar-rol-button";
import { EspacioRevendedorButton } from "@/components/revendedores/espacio-revendedor-button";
import { GananciaRevendedor } from "@/components/revendedores/ganancia-revendedor";
import { TomaDirectoRevendedor } from "@/components/revendedores/toma-directo-revendedor";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import type { VentaGanancia } from "@/lib/dominio/ganancia-revendedor";
import type { VentaBorrada } from "@/lib/dominio/ventas-revendedor";
import { formatDiaMesHora, formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

const BOTON = `${BOTON_SECUNDARIO} inline-flex px-4 text-[15px]`;
const BOTON_DESTACADO =
  "inline-flex min-h-12 items-center justify-center rounded-xl border border-primary px-4 text-[15px] font-semibold text-primary";

/** Un bloque plegable dentro de "Ajustes". */
function Plegado({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="group border-t border-line">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-[16px] font-semibold text-text select-none [&::-webkit-details-marker]:hidden">
        {titulo}
        <span aria-hidden className="inline-block text-text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

export type AjustesFichaProps = {
  vendedorId: string;
  nombre: string;
  rol: "admin" | "revendedor" | "coordinador" | string;
  revende: boolean;
  /** "Agarra directo del depósito" (`vendedores.toma_directo`, 0073). */
  tomaDirecto: boolean;
  /** Solo la ficha de una revendedora tiene ganancia y ventas borradas. */
  ventasGanancia?: VentaGanancia[];
  ventasBorradas?: VentaBorrada[];
  nombrePorProducto?: Map<string, string>;
  nombreBorrador?: Map<string, string>;
};

/**
 * Tarjeta plegable "Ajustes" al pie de la ficha: cambios de rol, espacio de
 * revendedora, "agarra directo del depósito", la ganancia como revendedora
 * y las ventas borradas. Un admin nunca se pasa a revendedor
 * (0026_roles_pendiente_espacio_revendedor.sql); un admin puede pasar a
 * coordinador y un coordinador volver a admin (0057). Al pasar a
 * coordinador se apaga el espacio de revendedora y NO se prende solo al
 * volver a admin — por eso ese botón se ve destacado.
 */
export function AjustesFicha({
  vendedorId,
  nombre,
  rol,
  revende,
  tomaDirecto,
  ventasGanancia,
  ventasBorradas = [],
  nombrePorProducto = new Map(),
  nombreBorrador = new Map(),
}: AjustesFichaProps) {
  // Solo quien puede revender tiene botellas en su poder (un coordinador no
  // vende; un admin solo si tiene su espacio de revendedora).
  const puedeRevender = rol === "revendedor" || (rol === "admin" && revende);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-[20px] leading-tight font-semibold text-text select-none lg:px-5 [&::-webkit-details-marker]:hidden">
          Ajustes
          <span aria-hidden className="inline-block text-text-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>

        <div className="flex flex-col gap-4 border-t border-line px-4 py-4 lg:px-5">
          <div className="flex flex-wrap gap-2">
            {(rol === "revendedor" || rol === "coordinador") && (
              <AsignarRolButton
                vendedorId={vendedorId}
                nombre={nombre}
                rolDestino="admin"
                label="Pasar a admin"
                className={BOTON}
              />
            )}
            {rol === "admin" && (
              <>
                <AsignarRolButton
                  vendedorId={vendedorId}
                  nombre={nombre}
                  rolDestino="coordinador"
                  label="Pasar a coordinador"
                  className={BOTON}
                />
                {revende ? (
                  <EspacioRevendedorButton
                    vendedorId={vendedorId}
                    nombre={nombre}
                    habilitar={false}
                    className={BOTON}
                  />
                ) : (
                  <EspacioRevendedorButton
                    vendedorId={vendedorId}
                    nombre={nombre}
                    habilitar={true}
                    className={BOTON_DESTACADO}
                  />
                )}
              </>
            )}
          </div>

          {puedeRevender && <TomaDirectoRevendedor vendedorId={vendedorId} nombre={nombre} tomaDirecto={tomaDirecto} />}

          {ventasGanancia && (
            <div className="flex flex-col">
              <Plegado titulo="Ver ganancia como revendedora">
                <GananciaRevendedor persona="ella" ventas={ventasGanancia} />
              </Plegado>

              {ventasBorradas.length > 0 && (
                <Plegado titulo={`Ventas borradas (${ventasBorradas.length})`}>
                  <div className="flex flex-col divide-y divide-line">
                    {ventasBorradas.map((v) => (
                      <div
                        key={`${v.grupoId}-${v.borradaPor ?? ""}`}
                        className="flex items-start justify-between gap-3 py-3 text-[16px]"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="text-text-muted">
                            {formatFecha(v.fecha)} · {nombrePorProducto.get(v.productoId) ?? "?"} × {v.cantidad}
                          </span>
                          <span className="text-[14px] text-text-muted">
                            Borrada por{" "}
                            {v.borradaPor
                              ? (nombreBorrador.get(v.borradaPor) ?? "alguien")
                              : "alguien fuera de la app"}{" "}
                            el {formatDiaMesHora(v.borradaAt)}
                          </span>
                        </div>
                        <span className="shrink-0 text-right tabular-nums text-text-muted">
                          {v.precioVentaCentavos !== null ? `${formatCentavos(v.precioVentaCentavos)} c/u` : "Sin precio"}
                        </span>
                      </div>
                    ))}
                  </div>
                </Plegado>
              )}
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
