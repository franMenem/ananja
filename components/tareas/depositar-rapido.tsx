"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { useRefrescarTareas } from "@/components/tareas-badge";
import { AccionRapida } from "@/components/tareas/accion-rapida";
import { useAccionRapidaMonto } from "@/components/tareas/use-accion-rapida-monto";
import type { MedioPago } from "@/lib/dominio/caja";
import { formatFecha, hoyISO } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";
import { validarMontoDeposito } from "@/lib/dominio/tareas";
import { MEDIOS_DESTINO_TRANSFERENCIA } from "@/lib/dominio/transferencias";

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  TENEDOR_INVALIDO: "Esa persona no es un admin activo.",
  MEDIO_INVALIDO: "Elegí Mercado Pago o Banco.",
  MONTO_INVALIDO: "Revisá el monto.",
};

type DepositarRapidoProps = {
  tenedorId: string;
  /** Lo que tiene en mano ahora: precarga el monto y es el tope sin
   * "Guardar igual". */
  montoCentavos: number;
  /** Nombre de quien tiene la plata si NO es quien mira (otro admin registra
   * que la pasó); `null`/sin definir = es mi plata. */
  tenedorNombre?: string | null;
  /** Cuenta preseleccionada (`cajas.destino_efectivo`). */
  medioInicial: MedioPago;
  /** "claro" para usarlo sobre el bloque oliva de Inicio. */
  tono?: "oscuro" | "claro";
};

/**
 * "Pasar a la cuenta" de un toque (Inicio y Tareas): hoja con el monto
 * precargado con lo que tiene en mano pero editable (se puede pasar solo una
 * parte), la cuenta preseleccionada y la fecha de hoy, y el mismo RPC que
 * `/plata/depositar` (`registrar_deposito_cuenta`). Sirve para mi plata
 * ("Pasar a la cuenta") y para la de otro admin ("Registrar que lo pasó",
 * con su nombre: el RPC deja que cualquier admin cargue el depósito de
 * otro). El monto tiene que ser > 0; si supera lo que tiene en mano (según
 * la pantalla o, si cambió mientras tanto, según el RPC con
 * `SALDO_INSUFICIENTE`), ofrece "Usar $ disponible" o "Guardar igual".
 * Un ref evita mandar el depósito dos veces con un doble toque. Para
 * cambiar la fecha o agregar una nota, link al formulario completo.
 */
export function DepositarRapido({
  tenedorId,
  montoCentavos,
  tenedorNombre = null,
  medioInicial,
  tono = "oscuro",
}: DepositarRapidoProps) {
  const propia = tenedorNombre === null;
  const tituloHoja = propia ? "Pasar a la cuenta" : `Registrar que ${tenedorNombre} lo pasó`;
  const router = useRouter();
  const refrescarTareas = useRefrescarTareas();
  const [medio, setMedio] = useState<MedioPago | null>(
    MEDIOS_DESTINO_TRANSFERENCIA.includes(medioInicial) ? medioInicial : null,
  );

  const {
    abierto,
    abrir,
    cerrar,
    monto,
    setMonto,
    guardando,
    error,
    setError,
    excedeCentavos: saldoInsuficiente,
    enviar,
    usarExcedente: usarDisponible,
    descartarExceso,
  } = useAccionRapidaMonto({
    montoInicialCentavos: montoCentavos,
    validar: (texto, tope, permitirExceso) => {
      const validacion = validarMontoDeposito(texto, tope, permitirExceso);
      return validacion.tipo === "excede"
        ? { tipo: "excede", centavos: validacion.centavos, topeCentavos: validacion.disponibleCentavos }
        : validacion;
    },
    ejecutar: async ({ centavos, permitirExceso }) => {
      // Defensivo: en la práctica nunca se llega acá con `medio` null —
      // `guardar()` ya lo valida antes de disparar `enviar()`, y "Guardar
      // igual"/"Usar $" solo aparecen dentro del mismo flujo ya validado.
      if (!medio) return { error: { message: "MEDIO_INVALIDO" } };
      const supabase = createClient();
      return await supabase.rpc("registrar_deposito_cuenta", {
        p_tenedor_id: tenedorId,
        p_medio_pago: medio,
        p_monto_centavos: centavos,
        p_fecha: hoyISO(),
        p_permitir_negativo: permitirExceso,
      });
    },
    codigoExcede: "SALDO_INSUFICIENTE",
    campoTopeEnDetalle: "disponible",
    erroresPorCodigo: ERRORES,
    mensajeErrorGenerico: "No se pudo guardar el depósito. Probá de nuevo.",
    onOk: () => {
      refrescarTareas();
      router.refresh();
    },
  });

  function guardar() {
    if (!medio) {
      setError("Elegí Mercado Pago o Banco.");
      return;
    }
    void enviar();
  }

  return (
    <AccionRapida
      triggerLabel={propia ? "Pasar a la cuenta" : "Registrar que lo pasó"}
      triggerAriaLabel={propia ? undefined : `Registrar que ${tenedorNombre} pasó su plata a la cuenta`}
      triggerClassName={`flex min-h-11 shrink-0 items-center justify-center px-4 text-xs font-medium tracking-[0.12em] uppercase transition-colors ${
        tono === "claro"
          ? "bg-background text-primary hover:bg-surface-raised"
          : "bg-primary text-background hover:bg-primary-hover"
      }`}
      ariaLabel={tituloHoja}
      abierto={abierto}
      onAbrir={abrir}
    >
      <h2 className="font-display text-[24px] break-words text-primary">{tituloHoja}</h2>
      <p className="mt-1 text-[13px] text-text-muted">
        {propia
          ? `Registrá cuánto de la plata que tenés en mano (${formatCentavos(montoCentavos)}) ya está en la cuenta de ${NEGOCIO.nombre}.`
          : `Registrá cuánto de la plata que tiene ${tenedorNombre} en mano (${formatCentavos(montoCentavos)}) ya está en la cuenta de ${NEGOCIO.nombre}.`}{" "}
        Fecha: {formatFecha(hoyISO())}.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <MontoInput
          id={`deposito-rapido-${tenedorId}`}
          label="Monto"
          value={monto}
          onChange={setMonto}
          required
          simbolo={null}
          labelClassName="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          cajaClassName="mt-1 flex border-b-2 border-primary"
          inputClassName="font-display block w-full min-w-0 bg-transparent py-1 text-[32px] text-primary tabular-nums"
        />
        <div>
          <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">Cuenta destino</span>
          <MedioPagoChips
            value={medio}
            onChange={setMedio}
            opciones={MEDIOS_DESTINO_TRANSFERENCIA}
            ocultarRotulo
            className="mt-1.5"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      )}

      {saldoInsuficiente !== null ? (
        <div className="mt-4 border-t-2 border-accent pt-3">
          <p className="text-sm text-text">
            {propia ? "Tenés" : `${tenedorNombre} tiene`} {formatCentavos(saldoInsuficiente)} en mano. Si guardás
            el monto escrito, queda negativo.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {saldoInsuficiente > 0 && (
              <BotonAccion
                cargando={guardando}
                textoCargando="Guardando…"
                onClick={() => usarDisponible()}
                className="min-h-[52px] flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
              >
                Usar {formatCentavos(saldoInsuficiente)}
              </BotonAccion>
            )}
            <BotonAccion
              cargando={guardando}
              textoCargando="Guardando…"
              onClick={() => enviar({ permitirExceso: true })}
              className="min-h-[52px] flex-1 bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
            >
              Guardar igual
            </BotonAccion>
            <button
              type="button"
              onClick={descartarExceso}
              disabled={guardando}
              className="min-h-[52px] flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Revisar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={guardando}
            textoCargando="Guardando…"
            onClick={guardar}
            className="flex min-h-[52px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
          >
            Guardar depósito
          </BotonAccion>
          <button
            type="button"
            onClick={cerrar}
            disabled={guardando}
            className="flex min-h-[52px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
        </div>
      )}

      <Link
        href={`/plata/depositar?tenedor=${tenedorId}&monto=${montoCentavos}`}
        className="mt-4 inline-block border-b border-mark text-[11px] tracking-[0.12em] text-text uppercase"
      >
        Otra fecha o con nota →
      </Link>
    </AccionRapida>
  );
}
