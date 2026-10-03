"use client";

import { useActionState, useState, useTransition } from "react";

import {
  darDeAlta,
  nuevaPasswordTemporal,
  reenviarInvitacion,
} from "@/app/(app)/revendedores/invitar/actions";
import { CredencialesPanel } from "@/components/invitaciones/credenciales-panel";
import {
  ETIQUETA_ROL,
  NOMBRE_MAX,
  type ModoAlta,
  type ResultadoAccion,
  type RolInvitacion,
  type ValoresFormInvitacion,
} from "@/lib/dominio/invitaciones";

type Admin = { id: string; nombre: string };

const labelClass = "text-[10px] tracking-[0.18em] text-text-muted uppercase";
const inputClass =
  "min-h-11 w-full border-0 border-b border-border bg-transparent text-base text-text focus:border-primary";

const MODOS: { id: ModoAlta; titulo: string; descripcion: string }[] = [
  {
    id: "temporal",
    titulo: "Contraseña temporal (sin mail)",
    descripcion:
      "La cuenta queda lista ya mismo y te mostramos una contraseña para mandarle por WhatsApp. Al entrar por primera vez elige una propia.",
  },
  {
    id: "invitar",
    titulo: "Invitación por mail",
    descripcion:
      "Le llega un mail con un link para elegir su contraseña. Necesita el servicio de mails (SMTP) configurado en Supabase; si todavía no lo configuraste, usá la contraseña temporal.",
  },
];

const DESCRIPCION_ROL: Record<RolInvitacion, string> = {
  revendedor: "Solo ve su stock, sus ventas y su ganancia.",
  admin: "Ve toda la app, igual que el resto del equipo.",
  coordinador: "Solo ve a sus revendedoras: cuánto les entregó y cuánto le deben. Puede entregarles botellas.",
};

/**
 * Formulario "Sumar persona" de `/revendedores/invitar`: nombre, email,
 * rol y encargado, con dos formas de alta — contraseña temporal (sin mail,
 * funciona hoy) o invitación por mail (necesita SMTP). La server action
 * `darDeAlta` se importa directo (no se pasa como prop desde el Server
 * Component).
 */
export function AltaForm({ coordinadores }: { coordinadores: Admin[] }) {
  const [estado, accion, enviando] = useActionState(darDeAlta, null);
  const [modo, setModo] = useState<ModoAlta>("temporal");
  const [cerrado, setCerrado] = useState<string | null>(null);
  const [reintento, setReintento] = useState<{ envio: number; resultado: ResultadoAccion } | null>(null);
  const [reintentando, startTransition] = useTransition();

  const reintentoActual = reintento && estado && reintento.envio === estado.envio ? reintento.resultado : null;

  const panel = reintentoActual?.credenciales
    ? { key: `r${estado?.envio}`, credenciales: reintentoActual.credenciales, titulo: "Contraseña nueva" }
    : estado?.credenciales
      ? { key: `a${estado.envio}`, credenciales: estado.credenciales, titulo: "Cuenta creada" }
      : null;

  if (panel && cerrado !== panel.key) {
    return (
      <div className="flex flex-col gap-4">
        {estado?.estado === "aviso" && (
          <p role="alert" className="border-l-2 border-accent pl-3 text-sm text-accent">
            {estado.mensaje}
          </p>
        )}
        <CredencialesPanel
          titulo={panel.titulo}
          credenciales={panel.credenciales}
          onListo={() => setCerrado(panel.key)}
        />
      </div>
    );
  }

  function reintentar() {
    const actual = estado;
    if (!actual?.userId) return;
    const userId = actual.userId;
    startTransition(async () => {
      const resultado =
        actual.reintento === "nueva_temporal"
          ? await nuevaPasswordTemporal(userId)
          : await reenviarInvitacion(userId);
      setReintento({ envio: actual.envio, resultado });
    });
  }

  const mostrarMensaje = estado && cerrado !== `a${estado.envio}` && cerrado !== `r${estado.envio}`;
  const valoresIniciales = estado && estado.estado !== "ok" ? estado.valores : undefined;

  return (
    <form action={accion} className="flex flex-col gap-6">
      <input type="hidden" name="modo" value={modo} />

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>Cómo le damos acceso</legend>
        {MODOS.map((m) => (
          <label
            key={m.id}
            className={`flex gap-3 border p-3.5 ${
              modo === m.id ? "border-primary bg-surface" : "border-border"
            }`}
          >
            <input
              type="radio"
              name="modo_opcion"
              value={m.id}
              checked={modo === m.id}
              onChange={() => setModo(m.id)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[15px] font-medium text-text">{m.titulo}</span>
              <span className="text-[13px] leading-snug text-text-muted">{m.descripcion}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <CamposPersona key={estado?.envio ?? 0} coordinadores={coordinadores} valores={valoresIniciales} />

      {mostrarMensaje && estado.estado !== "ok" && (
        <div role="alert" className="flex flex-col gap-2 border-l-2 border-accent pl-3">
          <p className="text-sm text-accent">{estado.mensaje}</p>

          {estado.sugerirTemporal && modo === "invitar" && (
            <button
              type="button"
              onClick={() => setModo("temporal")}
              className="flex min-h-11 items-center self-start border border-primary px-4 text-[12px] font-medium tracking-[0.12em] text-primary uppercase"
            >
              Usar contraseña temporal
            </button>
          )}

          {estado.estado === "ya_invitado" && estado.userId && !reintentoActual && (
            <button
              type="button"
              onClick={reintentar}
              disabled={reintentando}
              className="flex min-h-11 items-center self-start border border-primary px-4 text-[12px] font-medium tracking-[0.12em] text-primary uppercase disabled:opacity-45"
            >
              {reintentando
                ? "Un momento…"
                : estado.reintento === "nueva_temporal"
                  ? "Generar otra contraseña temporal"
                  : "Reenviar invitación"}
            </button>
          )}

          {reintentoActual && !reintentoActual.credenciales && (
            <p className={`text-sm ${reintentoActual.ok ? "text-text" : "text-accent"}`}>{reintentoActual.mensaje}</p>
          )}
        </div>
      )}

      {mostrarMensaje && estado.estado === "ok" && (
        <p role="status" className="border-l-2 border-mark pl-3 text-sm text-text">
          {estado.mensaje}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        {enviando ? "Guardando…" : modo === "invitar" ? "Mandar invitación" : "Crear cuenta"}
      </button>
    </form>
  );
}

/** Campos de la persona — se remontan en cada respuesta (`key`) para
 * tomar los valores que devolvió la acción si hubo error. */
function CamposPersona({ coordinadores, valores }: { coordinadores: Admin[]; valores?: ValoresFormInvitacion }) {
  const [rol, setRol] = useState<RolInvitacion>(valores?.rol ?? "revendedor");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="nombre" className={labelClass}>
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          autoComplete="off"
          required
          maxLength={NOMBRE_MAX}
          defaultValue={valores?.nombre ?? ""}
          className={inputClass}
          placeholder="Nombre y apellido"
        />
        <p className="text-xs text-text-muted">Es el nombre que va a ver todo el equipo.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          defaultValue={valores?.email ?? ""}
          className={inputClass}
          placeholder="nombre@mail.com"
        />
        <p className="text-xs text-text-muted">Con este email va a entrar a la app.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>Rol</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["revendedor", "admin", "coordinador"] as const).map((r) => (
            <label
              key={r}
              className={`flex gap-3 border p-3.5 ${
                rol === r ? "border-primary bg-surface" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="rol"
                value={r}
                checked={rol === r}
                onChange={() => setRol(r)}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[15px] font-medium text-text">{ETIQUETA_ROL[r]}</span>
                <span className="text-[13px] leading-snug text-text-muted">{DESCRIPCION_ROL[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {rol === "revendedor" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="encargadoId" className={labelClass}>
            Coordinador (opcional)
          </label>
          <select
            id="encargadoId"
            name="encargadoId"
            defaultValue={valores?.encargadoId ?? ""}
            className="min-h-11 w-full max-w-[320px] border border-border bg-surface px-3 text-base text-text focus:border-primary"
          >
            <option value="">Sin coordinador por ahora</option>
            {coordinadores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
          <p className="text-xs text-text-muted">A quién le rinde la plata. Lo podés cambiar después.</p>
        </div>
      )}
    </div>
  );
}
