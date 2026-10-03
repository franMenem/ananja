"use client";

import { useState, useTransition } from "react";

import {
  cancelarCuentaTemporal,
  cancelarInvitacion,
  reenviarInvitacion,
} from "@/app/(app)/revendedores/invitar/actions";
import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { ETIQUETA_ROL, type InvitacionPendiente, type ResultadoAccion } from "@/lib/dominio/invitaciones";

/**
 * Lista "Pendientes de entrar" de `/revendedores/invitar`: personas
 * invitadas por mail que todavía no eligieron su contraseña, y cuentas con
 * contraseña temporal que nunca se usaron para entrar. A una invitación se
 * le puede reenviar el mail; las dos se pueden cancelar mientras nunca se
 * hayan usado y no tengan movimientos (lo verifica la server action).
 */
export function InvitacionesPendientes({ invitaciones }: { invitaciones: InvitacionPendiente[] }) {
  if (invitaciones.length === 0) {
    return <p className="py-4 text-sm text-text-muted">No hay nadie esperando para entrar.</p>;
  }

  return (
    <ul className="flex flex-col gap-px border border-border bg-border">
      {invitaciones.map((inv) => (
        <FilaInvitacion key={inv.userId} invitacion={inv} />
      ))}
    </ul>
  );
}

function FilaInvitacion({ invitacion }: { invitacion: InvitacionPendiente }) {
  const [resultado, setResultado] = useState<ResultadoAccion | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [errorCancelar, setErrorCancelar] = useState<string | null>(null);
  const [reenviando, startReenvio] = useTransition();
  const [cancelando, startCancelar] = useTransition();

  const rol = ETIQUETA_ROL[invitacion.rol as keyof typeof ETIQUETA_ROL] ?? "Sin rol";
  const temporal = invitacion.tipo === "temporal";
  const tituloCancelar = temporal
    ? `¿Cancelar la cuenta de ${invitacion.nombre}?`
    : `¿Cancelar la invitación de ${invitacion.nombre}?`;

  function reenviar() {
    setResultado(null);
    startReenvio(async () => {
      setResultado(await reenviarInvitacion(invitacion.userId));
    });
  }

  function cancelar() {
    setErrorCancelar(null);
    startCancelar(async () => {
      const r = temporal
        ? await cancelarCuentaTemporal(invitacion.userId)
        : await cancelarInvitacion(invitacion.userId);
      if (r.ok) {
        setConfirmar(false);
      } else {
        setErrorCancelar(r.mensaje);
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 bg-surface-raised p-3.5 md:flex-row md:items-center md:justify-between md:gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 font-medium text-text">
          <span className="min-w-0 break-words">{invitacion.nombre}</span>
          <span className="shrink-0 border border-border px-1.5 py-px text-[9px] tracking-[0.1em] text-text-muted uppercase">
            {rol}
          </span>
        </span>
        <span className="text-[13px] break-all text-text-muted">{invitacion.email}</span>
        <span className="text-[12px] text-text-muted">
          {temporal ? (
            <>Cuenta con contraseña temporal sin usar · creada el {invitacion.invitadaEn}</>
          ) : (
            <>
              Invitada por mail el {invitacion.invitadaEn}
              {!invitacion.puedeCancelar && " · abrió el link, falta que elija su contraseña"}
            </>
          )}
        </span>
        {resultado && (
          <span role="status" className={`text-[13px] ${resultado.ok ? "text-text" : "text-accent"}`}>
            {resultado.mensaje}
          </span>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {!temporal && (
          <BotonAccion
            cargando={reenviando}
            textoCargando="Enviando…"
            onClick={reenviar}
            className="flex min-h-11 items-center justify-center border border-primary px-3 text-[11px] font-medium tracking-[0.1em] text-primary uppercase disabled:opacity-45"
          >
            Reenviar
          </BotonAccion>
        )}
        {invitacion.puedeCancelar && (
          <button
            type="button"
            onClick={() => {
              setErrorCancelar(null);
              setConfirmar(true);
            }}
            className="flex min-h-11 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-accent hover:text-accent"
          >
            {temporal ? "Cancelar cuenta" : "Cancelar invitación"}
          </button>
        )}
      </div>

      <BottomSheet open={confirmar} ariaLabel={tituloCancelar} variant="accent">
        <h2 className="font-display text-[24px] leading-[1.25] text-primary">{tituloCancelar}</h2>
        <p className="mt-2 text-sm text-text-muted">
          {temporal
            ? "Se borra su cuenta y la contraseña temporal deja de funcionar. Si después querés sumarla, la cargás de nuevo."
            : "Se borra su cuenta y el link del mail deja de funcionar. Si después querés sumarla, la invitás de nuevo."}
        </p>

        {errorCancelar && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {errorCancelar}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={cancelando}
            textoCargando="Cancelando…"
            onClick={cancelar}
            className="min-h-11 flex-[1.6] bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Sí, cancelar
          </BotonAccion>
          <button
            type="button"
            onClick={() => !cancelando && setConfirmar(false)}
            disabled={cancelando}
            className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Volver
          </button>
        </div>
      </BottomSheet>
    </li>
  );
}
