import Link from "next/link";

import { ConfirmarDepositoRapido } from "@/components/tareas/confirmar-deposito-rapido";
import { ConfirmarPagoRapido } from "@/components/tareas/confirmar-pago-rapido";
import { DepositarRapido } from "@/components/tareas/depositar-rapido";
import type { MedioPago } from "@/lib/dominio/caja";
import type { Tarea } from "@/lib/dominio/tareas";

type ListaTareasProps = {
  tareas: Tarea[];
  /** Cuenta preseleccionada en "Pasar a la cuenta". */
  medioDeposito: MedioPago;
};

/**
 * Lista única de tareas (sin grupos): etiqueta de tipo, marca de urgencia,
 * título, detalle y acción. "Confirmar" y "Pasar a la cuenta" (o
 * "Registrar que lo pasó", si la plata es de otra persona — con un "Ver"
 * al detalle en /plata) se resuelven en el lugar (BottomSheet); el resto
 * lleva a su pantalla. Server Component:
 * a los botones de acción solo les pasa datos planos.
 */
export function ListaTareas({ tareas, medioDeposito }: ListaTareasProps) {
  return (
    <ul className="flex flex-col border-t border-border">
      {tareas.map((tarea) => (
        <li
          key={tarea.id}
          className={`flex flex-col gap-3 border-b border-border py-3.5 pl-3 @md:flex-row @md:items-center @md:justify-between ${
            tarea.urgencia === "urgente"
              ? "border-l-2 border-l-accent"
              : tarea.urgencia === "normal"
                ? "border-l-2 border-l-mark"
                : "border-l-2 border-l-transparent"
          }`}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="border border-border px-1.5 py-px text-[9px] tracking-[0.14em] text-text-muted uppercase">
                {tarea.etiqueta}
              </span>
              {tarea.urgencia === "urgente" && (
                <span className="text-[9px] font-medium tracking-[0.14em] text-accent uppercase">Urgente</span>
              )}
            </span>
            <span className="text-sm font-medium break-words text-text">{tarea.titulo}</span>
            <span className="text-[13px] break-words text-text-muted">{tarea.detalle}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {tarea.accion?.tipo === "confirmar_pago" ? (
              <ConfirmarPagoRapido
                pagoId={tarea.accion.pagoId}
                montoCentavos={tarea.accion.montoCentavos}
                medioPago={tarea.accion.medioPago}
                fecha={tarea.accion.fecha}
                vendedorNombre={tarea.accion.vendedorNombre}
                destino={tarea.accion.destino}
                comprobanteUrl={tarea.accion.comprobanteUrl ?? null}
                tieneComprobante={tarea.accion.imagenPath !== null}
              />
            ) : tarea.accion?.tipo === "confirmar_deposito" ? (
              <ConfirmarDepositoRapido
                depositoInformadoId={tarea.accion.depositoInformadoId}
                montoCentavos={tarea.accion.montoCentavos}
                medioPago={tarea.accion.medioPago}
                tenedorNombre={tarea.accion.tenedorNombre}
                comprobanteUrl={tarea.accion.comprobanteUrl ?? null}
                tieneComprobante={tarea.accion.imagenPath !== null}
              />
            ) : tarea.accion?.tipo === "depositar" ? (
              <>
                {tarea.accion.tenedorNombre !== null && (
                  <Link
                    href={tarea.href}
                    className="flex min-h-11 items-center justify-center border border-primary px-4 text-xs font-medium tracking-[0.12em] text-primary uppercase transition-colors hover:bg-primary/[.06]"
                  >
                    Ver
                  </Link>
                )}
                <DepositarRapido
                  tenedorId={tarea.accion.tenedorId}
                  montoCentavos={tarea.accion.montoCentavos}
                  tenedorNombre={tarea.accion.tenedorNombre}
                  medioInicial={medioDeposito}
                />
              </>
            ) : (
              <Link
                href={tarea.href}
                className="flex min-h-11 items-center justify-center border border-primary px-4 text-xs font-medium tracking-[0.12em] text-primary uppercase transition-colors hover:bg-primary/[.06]"
              >
                Ver
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
