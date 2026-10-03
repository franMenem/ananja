"use client";

import { useState } from "react";

import type { Credenciales } from "@/lib/dominio/invitaciones";

type CredencialesPanelProps = {
  titulo: string;
  credenciales: Credenciales;
  onListo: () => void;
};

/**
 * Datos de ingreso de una cuenta con contraseña temporal — se muestran UNA
 * sola vez (la contraseña no se guarda en ningún lado). Copiar mensaje,
 * copiar contraseña o abrir WhatsApp con el mensaje ya escrito.
 */
export function CredencialesPanel({ titulo, credenciales, onListo }: CredencialesPanelProps) {
  const [copiado, setCopiado] = useState<"mensaje" | "password" | "error" | null>(null);

  async function copiar(textoACopiar: string, cual: "mensaje" | "password") {
    try {
      await navigator.clipboard.writeText(textoACopiar);
      setCopiado(cual);
    } catch {
      setCopiado("error");
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(credenciales.mensaje)}`;
  const botonSecundario =
    "flex min-h-11 items-center justify-center border border-primary px-4 text-[12px] font-medium tracking-[0.12em] text-primary uppercase";

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-4 border border-border border-t-2 border-t-mark bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[26px] leading-[1.1] text-primary">{titulo}</h2>
        <p className="text-sm text-text-muted">
          Mandale estos datos por WhatsApp. <strong className="font-medium text-accent">La contraseña no se
          vuelve a mostrar</strong>: si la perdés, podés generar otra desde esta misma pantalla.
        </p>
      </div>

      <dl className="flex flex-col gap-3 border-y border-border py-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] tracking-[0.18em] text-text-muted uppercase">Email</dt>
          <dd className="break-all text-base text-text">{credenciales.email}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-[10px] tracking-[0.18em] text-text-muted uppercase">Contraseña temporal</dt>
          <dd className="font-mono text-[22px] tracking-[0.06em] text-primary select-all">
            {credenciales.password}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">Mensaje para mandar</span>
        <p className="border-l-2 border-mark bg-background px-3 py-2.5 text-sm leading-relaxed text-text select-all">
          {credenciales.mensaje}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copiar(credenciales.mensaje, "mensaje")}
          className="flex min-h-11 flex-1 items-center justify-center bg-primary px-4 text-[12px] font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          {copiado === "mensaje" ? "Mensaje copiado" : "Copiar mensaje"}
        </button>
        <button type="button" onClick={() => copiar(credenciales.password, "password")} className={botonSecundario}>
          {copiado === "password" ? "Copiada" : "Copiar contraseña"}
        </button>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={botonSecundario}>
          Abrir WhatsApp
        </a>
      </div>

      {copiado === "error" && (
        <p role="alert" className="text-xs text-accent">
          No se pudo copiar. Mantené apretado el texto para copiarlo a mano.
        </p>
      )}

      <button
        type="button"
        onClick={onListo}
        className="flex min-h-11 items-center justify-center text-[12px] tracking-[0.12em] text-text-muted uppercase underline-offset-4 hover:text-primary hover:underline"
      >
        Listo, ya se los mandé
      </button>
    </section>
  );
}
