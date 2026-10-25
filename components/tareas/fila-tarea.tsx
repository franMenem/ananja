import Link from "next/link";

import { ConfirmarDepositoRapido } from "@/components/tareas/confirmar-deposito-rapido";
import { ConfirmarPagoRapido } from "@/components/tareas/confirmar-pago-rapido";
import { DepositarRapido } from "@/components/tareas/depositar-rapido";
import { BOTON_ACCION_TAREA } from "@/components/ui/boton";
import { Pastilla } from "@/components/ui/pastilla";
import type { MedioPago } from "@/lib/dominio/caja";
import type { Tarea } from "@/lib/dominio/tareas";

/**
 * Una tarea: título (una oración corta, con "Urgente" al lado si lo es),
 * detalle en una línea y la acción rápida como botón secundario chico — a
 * la derecha desde `sm`, debajo y a ancho completo en el celular. Sin borde
 * de color ni etiqueta de categoría. La usan Hoy y `/tareas`.
 *
 * "Confirmar" y "Pasar a la cuenta" (o "Registrar que lo pasó", si la plata
 * es de otra persona — con un "Ver" al detalle en /plata) se resuelven en el
 * lugar (BottomSheet); el resto lleva a su pantalla con "Ver". Server
 * Component: a los botones de acción solo les pasa datos planos.
 */
export function FilaTarea({ tarea, medioDeposito }: { tarea: Tarea; medioDeposito: MedioPago }) {
  const { accion } = tarea;
  return (
    <li className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[16px] leading-snug font-semibold break-words text-text">{tarea.titulo}</span>
          {tarea.urgencia === "urgente" && <Pastilla variante="debe">Urgente</Pastilla>}
        </div>
        <p className="truncate text-[14px] text-text-muted" title={tarea.detalle}>
          {tarea.detalle}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">
        {accion?.tipo === "confirmar_pago" ? (
          <ConfirmarPagoRapido
            pagoId={accion.pagoId}
            montoCentavos={accion.montoCentavos}
            medioPago={accion.medioPago}
            fecha={accion.fecha}
            vendedorNombre={accion.vendedorNombre}
            destino={accion.destino}
            comprobanteUrl={accion.comprobanteUrl ?? null}
            tieneComprobante={accion.imagenPath !== null}
          />
        ) : accion?.tipo === "confirmar_deposito" ? (
          <ConfirmarDepositoRapido
            depositoInformadoId={accion.depositoInformadoId}
            montoCentavos={accion.montoCentavos}
            medioPago={accion.medioPago}
            tenedorNombre={accion.tenedorNombre}
            comprobanteUrl={accion.comprobanteUrl ?? null}
            tieneComprobante={accion.imagenPath !== null}
          />
        ) : accion?.tipo === "depositar" ? (
          <>
            {accion.tenedorNombre !== null && (
              <Link href={tarea.href} className={BOTON_ACCION_TAREA}>
                Ver
              </Link>
            )}
            <DepositarRapido
              tenedorId={accion.tenedorId}
              montoCentavos={accion.montoCentavos}
              tenedorNombre={accion.tenedorNombre}
              medioInicial={medioDeposito}
            />
          </>
        ) : (
          <Link href={tarea.href} className={BOTON_ACCION_TAREA}>
            Ver
          </Link>
        )}
      </div>
    </li>
  );
}
