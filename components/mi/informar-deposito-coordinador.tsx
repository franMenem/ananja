"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { useAccionRapidaMonto } from "@/components/tareas/use-accion-rapida-monto";
import type { MedioPago } from "@/lib/dominio/caja";
import { hoyISO } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { subirComprobanteDepositoCoordinador, validarArchivoComprobante } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import { validarMontoDeposito } from "@/lib/dominio/tareas";
import { MEDIOS_DESTINO_TRANSFERENCIA } from "@/lib/dominio/transferencias";

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  MEDIO_INVALIDO: "Elegí Mercado Pago o Banco.",
  MONTO_INVALIDO: "Revisá el monto.",
  FECHA_INVALIDA: "Revisá la fecha.",
  // Un solo aviso pendiente por vez (0057, revisión adversarial): ya hay
  // uno esperando que un admin lo confirme o lo rechace.
  AVISO_PENDIENTE: "Ya avisaste un depósito y está esperando confirmación.",
  // Comprobante (0071): siempre es una transferencia, así que la UI lo exige.
  // `COMPROBANTE_REQUERIDO` y `SUBIDA_FALLIDA` los arma este componente
  // (no vienen de la base).
  COMPROBANTE_REQUERIDO: "Adjuntá el comprobante de la transferencia.",
  COMPROBANTE_INVALIDO: "No se pudo usar ese comprobante. Elegilo de nuevo.",
  SUBIDA_FALLIDA: "No se pudo subir el comprobante. Probá de nuevo.",
};

type InformarDepositoCoordinadorProps = {
  /** Lo que tiene que pasar a la cuenta de Ananja ahora mismo
   * (`v_plata_en_manos.total_centavos` propio, ya sin su margen propio
   * desde 0058): precarga el monto y es el tope sin "Guardar igual". */
  montoCentavos: number;
  /** Id de la coordinadora logueada: el comprobante se sube a
   * `coordinadores/<vendedorId>/` (la única carpeta donde puede escribir). */
  vendedorId: string;
};

/**
 * "Avisé que la pasé" de un coordinador (0057_coordinador_plata_stock.sql):
 * el coordinador NO carga ni ve nada de Plata (pedido de Fran, sin cambios)
 * pero puede avisar que pasó su plata en mano a la cuenta de
 * {NEGOCIO.nombre} — queda pendiente hasta que un admin lo confirma (o lo
 * rechaza) desde Tareas, mismo patrón que "informar un pago" de una
 * revendedora. Mismo hook que `DepositarRapido` (`useAccionRapidaMonto`):
 * monto precargado pero editable, con "Usar $ disponible"/"Guardar igual"
 * si escribe de más. Sin fecha editable (siempre hoy) ni nota: esta
 * pantalla es la única que ve un coordinador (`/mi` a secas, sin subrutas),
 * así que no hay un formulario más completo al que mandarlo.
 *
 * Comprobante (0071_comprobante_deposito_informado.sql): obligatorio en la
 * UI (siempre es una transferencia). Al enviar se sube primero el archivo y
 * recién después se llama al RPC con `p_imagen_path`. Si el RPC falla, el
 * archivo ya está en Storage: se recuerda el path (`subido`, atado al
 * `File` elegido) para reintentar sin volver a subirlo y no dejar archivos
 * huérfanos; si la persona elige otro archivo, ese path se descarta solo
 * (cambia el `File`).
 */
export function InformarDepositoCoordinador({ montoCentavos, vendedorId }: InformarDepositoCoordinadorProps) {
  const router = useRouter();
  const [medio, setMedio] = useState<MedioPago | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const subido = useRef<{ archivo: File; path: string } | null>(null);

  const {
    abierto,
    abrir,
    cerrar,
    monto,
    setMonto,
    guardando,
    error,
    setError,
    excedeCentavos,
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
    ejecutar: async ({ centavos }) => {
      if (!medio) return { error: { message: "MEDIO_INVALIDO" } };
      if (!archivo) return { error: { message: "COMPROBANTE_REQUERIDO" } };

      // Subir solo si este archivo todavía no se subió (reintento tras un
      // fallo del RPC: se reusa el path, ver comentario del componente).
      let path = subido.current?.archivo === archivo ? subido.current.path : null;
      if (path === null) {
        try {
          path = await subirComprobanteDepositoCoordinador(archivo, vendedorId);
          subido.current = { archivo, path };
        } catch {
          return { error: { message: "SUBIDA_FALLIDA" } };
        }
      }

      const supabase = createClient();
      const resultado = await supabase.rpc("informar_deposito_cuenta", {
        p_medio_pago: medio,
        p_monto_centavos: centavos,
        p_fecha: hoyISO(),
        p_imagen_path: path,
      });
      // La base no aceptó ese path: no sirve reintentar con el mismo.
      if (resultado.error?.message === "COMPROBANTE_INVALIDO") subido.current = null;
      return resultado;
    },
    codigoExcede: "SALDO_INSUFICIENTE",
    campoTopeEnDetalle: "disponible",
    erroresPorCodigo: ERRORES,
    mensajeErrorGenerico: "No se pudo avisar el depósito. Probá de nuevo.",
    onOk: () => {
      setArchivo(null);
      subido.current = null;
      router.refresh();
    },
  });

  function elegirArchivo(event: React.ChangeEvent<HTMLInputElement>) {
    const elegido = event.target.files?.[0] ?? null;
    // Se limpia el input para poder volver a elegir el mismo archivo.
    event.target.value = "";
    if (!elegido) return;
    const problema = validarArchivoComprobante(elegido);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setArchivo(elegido);
  }

  function guardar() {
    if (!medio) {
      setError("Elegí Mercado Pago o Banco.");
      return;
    }
    if (!archivo) {
      setError(ERRORES.COMPROBANTE_REQUERIDO);
      return;
    }
    void enviar();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="mt-1 flex min-h-11 items-center justify-center border border-primary px-4 text-[12px] font-medium tracking-[0.14em] text-primary uppercase"
      >
        Avisé que la pasé
      </button>

      <BottomSheet open={abierto} ariaLabel="Avisar depósito">
        <h2 className="font-display text-[24px] text-primary">Avisar depósito</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          Registrá cuánto de lo que tenés que pasar ({formatCentavos(montoCentavos)}) ya pasaste a la
          cuenta de {NEGOCIO.nombre} y adjuntá el comprobante de la transferencia. Un admin lo va a
          confirmar.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <MontoInput
            id="informar-deposito-monto"
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
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
              Comprobante de la transferencia
            </span>
            <label
              htmlFor="informar-deposito-comprobante"
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 border border-dashed border-border px-3 py-2 text-center text-sm break-all text-text hover:border-primary"
            >
              {archivo ? archivo.name : "Sacar foto o elegir archivo"}
              {archivo && (
                <span className="text-[11px] tracking-[0.12em] text-text-muted uppercase">Tocá para cambiarlo</span>
              )}
            </label>
            <input
              id="informar-deposito-comprobante"
              type="file"
              accept="image/*,.pdf,.heic"
              className="sr-only"
              disabled={guardando}
              onChange={elegirArchivo}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}

        {excedeCentavos !== null ? (
          // A diferencia de `DepositarRapido`, acá no hay "Guardar igual":
          // `informar_deposito_cuenta` no tiene `p_permitir_negativo` — un
          // coordinador nunca puede avisar más de lo que tiene en mano
          // (decisión a propósito, evita un aviso que después ningún admin
          // pueda confirmar sin dejarlo en negativo).
          <div className="mt-4 border-t-2 border-accent pt-3">
            <p className="text-sm text-text">
              Tenés {formatCentavos(excedeCentavos)} en mano — no podés avisar más que eso.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <BotonAccion
                cargando={guardando}
                textoCargando="Guardando…"
                onClick={() => usarDisponible()}
                className="min-h-[52px] flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
              >
                Usar {formatCentavos(excedeCentavos)}
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
              Avisar
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
      </BottomSheet>
    </>
  );
}
