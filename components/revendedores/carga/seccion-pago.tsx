import Link from "next/link";

import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { CAMPO, LINK_CHICO, ListaProblemas, ROTULO, Seccion } from "@/components/revendedores/carga/ui";
import type { PagoPendienteCarga } from "@/components/revendedores/carga/tipos";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import type { MedioPago, ProblemaCarga, ViaPago } from "@/lib/dominio/carga-revendedor";
import { MEDIOS_DESTINO_TRANSFERENCIA } from "@/lib/dominio/transferencias";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

export type OpcionVia = { value: ViaPago; label: string };

/** Sección 3 · Pago de `CargaForm`: cómo se la dio (con encargado, transferida
 * directo, o un cliente que pagó directo), monto (precargado con lo que va a
 * deber), medio, fecha y nota. */
export function SeccionPago({
  activa,
  onToggle,
  hoy,
  vendedorNombre,
  encargadoNombre,
  opcionesVia,
  via,
  onCambiarVia,
  pagosPendientes,
  pendienteCentavos,
  montoEnPantalla,
  onCambiarMonto,
  onMontoTodo,
  onMontoBorrar,
  deudaDespuesVentasCentavos,
  medioPago,
  onCambiarMedioPago,
  fecha,
  onCambiarFecha,
  nota,
  onCambiarNota,
  pagoCentavos,
  problemas,
}: {
  activa: boolean;
  onToggle: () => void;
  hoy: string;
  vendedorNombre: string;
  encargadoNombre: string | null;
  opcionesVia: OpcionVia[];
  via: ViaPago;
  onCambiarVia: (via: ViaPago) => void;
  pagosPendientes: PagoPendienteCarga[];
  pendienteCentavos: number;
  montoEnPantalla: string;
  onCambiarMonto: (texto: string) => void;
  onMontoTodo: () => void;
  onMontoBorrar: () => void;
  deudaDespuesVentasCentavos: number;
  medioPago: MedioPago | null;
  onCambiarMedioPago: (medio: MedioPago | null) => void;
  fecha: string;
  onCambiarFecha: (fecha: string) => void;
  nota: string;
  onCambiarNota: (nota: string) => void;
  pagoCentavos: number;
  problemas: ProblemaCarga[];
}) {
  return (
    <Seccion
      numero={3}
      titulo="Pago"
      activa={activa}
      onToggle={onToggle}
      descripcion={
        activa
          ? `${formatCentavos(pagoCentavos)} · ${formatFecha(fecha || hoy)}`
          : "La plata que ya pagó"
      }
    >
      <div className="flex flex-col gap-2">
        <span className={ROTULO}>¿Cómo te la dio?</span>
        <div className="flex flex-col gap-px bg-border">
          {opcionesVia.map((opcion) => {
            const selected = via === opcion.value;
            return (
              <button
                key={opcion.value}
                type="button"
                onClick={() => onCambiarVia(opcion.value)}
                aria-pressed={selected}
                className={`min-h-12 px-3 text-left text-[13px] font-medium transition-colors ${
                  selected ? "bg-primary text-background" : "bg-surface-raised text-text"
                }`}
              >
                {opcion.label}
              </button>
            );
          })}
        </div>
        {via === "encargado" && !encargadoNombre && (
          <p className="text-xs text-accent">
            {vendedorNombre} no tiene un encargado admin asignado — vas a quedar vos con la
            plata en mano hasta que la deposites.
          </p>
        )}
      </div>

      {pagosPendientes.length > 0 && (
        <div role="note" className="flex flex-col gap-1.5 border-l-2 border-accent pl-3">
          <p className="text-sm text-text">
            Tiene {formatCentavos(pendienteCentavos)} informado sin confirmar: confirmalo o
            rechazalo en Tareas antes de registrar otro pago.
          </p>
          {pagosPendientes.map((p) => (
            <Link
              key={p.id}
              href={`/tareas/pagos/${p.id}`}
              className="text-[12px] text-primary underline-offset-2 hover:underline"
            >
              {formatFecha(p.fecha)} · {formatCentavos(p.montoCentavos)} ·{" "}
              {MEDIO_PAGO_LABELS[p.medioPago]} — ver en Tareas
            </Link>
          ))}
          <p className="text-[11px] text-text-muted">
            El monto de abajo ya lo descuenta, para que no quede pagado dos veces.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <MontoInput
          id="monto-pago"
          label="Monto"
          value={montoEnPantalla}
          onChange={onCambiarMonto}
          required
          placeholder="$ 0,00"
          simbolo={null}
          labelClassName={ROTULO}
          cajaClassName="mt-1 flex border-b-2 border-primary"
          inputClassName="font-display block w-full min-w-0 bg-transparent py-1 text-[40px] text-primary tabular-nums focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted">
            Después de las ventas va a deber {formatCentavos(deudaDespuesVentasCentavos)}
          </span>
          <div className="flex gap-4">
            <button type="button" onClick={onMontoTodo} className={`text-primary ${LINK_CHICO}`}>
              Todo
            </button>
            <button
              type="button"
              onClick={onMontoBorrar}
              className={`text-text-muted ${LINK_CHICO}`}
            >
              Borrar
            </button>
          </div>
        </div>
      </div>

      <MedioPagoChips
        value={medioPago}
        onChange={onCambiarMedioPago}
        opciones={via === "encargado" ? undefined : MEDIOS_DESTINO_TRANSFERENCIA}
      />

      <div>
        <label htmlFor="fecha-pago" className={ROTULO}>
          Fecha del pago
        </label>
        <input
          id="fecha-pago"
          type="date"
          required
          max={hoy}
          value={fecha}
          onChange={(event) => onCambiarFecha(event.target.value)}
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="nota-pago" className={ROTULO}>
          Nota (opcional)
        </label>
        <textarea
          id="nota-pago"
          value={nota}
          onChange={(event) => onCambiarNota(event.target.value)}
          rows={2}
          className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
        />
      </div>

      <ListaProblemas problemas={problemas} />
    </Seccion>
  );
}
