"use client";

import { useActionState, useState, useTransition } from "react";

import {
  darDeAlta,
  nuevaPasswordTemporal,
  reenviarInvitacion,
} from "@/app/(app)/revendedores/invitar/actions";
import { CredencialesPanel } from "@/components/invitaciones/credenciales-panel";
import { AccionesForm } from "@/components/ui/acciones-form";
import { Aviso } from "@/components/ui/aviso";
import { CLASE_ETIQUETA, Campo, Entrada, MensajeError, Selector } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
import {
  ETIQUETA_ROL,
  NOMBRE_MAX,
  type ModoAlta,
  type ResultadoAccion,
  type RolInvitacion,
  type ValoresFormInvitacion,
} from "@/lib/dominio/invitaciones";

type Admin = { id: string; nombre: string };

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
          <Aviso role="alert">
            <p>{estado.mensaje}</p>
          </Aviso>
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
    <form action={accion} className="flex flex-col gap-5">
      <input type="hidden" name="modo" value={modo} />

      <SeccionForm titulo="Cómo le damos acceso">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Cómo le damos acceso</legend>
          {MODOS.map((m) => (
            <OpcionRadio
              key={m.id}
              name="modo_opcion"
              value={m.id}
              elegida={modo === m.id}
              onElegir={() => setModo(m.id)}
              titulo={m.titulo}
              descripcion={m.descripcion}
            />
          ))}
        </fieldset>
      </SeccionForm>

      <CamposPersona key={estado?.envio ?? 0} coordinadores={coordinadores} valores={valoresIniciales} />

      {mostrarMensaje && estado.estado !== "ok" && (
        <div role="alert" className="flex flex-col gap-3">
          <MensajeError>{estado.mensaje}</MensajeError>

          {estado.sugerirTemporal && modo === "invitar" && (
            <button
              type="button"
              onClick={() => setModo("temporal")}
              className="flex min-h-12 items-center self-start rounded-xl border border-primary px-4 text-[15px] font-semibold text-primary"
            >
              Usar contraseña temporal
            </button>
          )}

          {estado.estado === "ya_invitado" && estado.userId && !reintentoActual && (
            <button
              type="button"
              onClick={reintentar}
              disabled={reintentando}
              className="flex min-h-12 items-center self-start rounded-xl border border-primary px-4 text-[15px] font-semibold text-primary disabled:opacity-45"
            >
              {reintentando
                ? "Un momento…"
                : estado.reintento === "nueva_temporal"
                  ? "Generar otra contraseña temporal"
                  : "Reenviar invitación"}
            </button>
          )}

          {reintentoActual && !reintentoActual.credenciales && (
            <p className={`text-[16px] ${reintentoActual.ok ? "text-text" : "text-accent"}`}>{reintentoActual.mensaje}</p>
          )}
        </div>
      )}

      {mostrarMensaje && estado.estado === "ok" && (
        <p role="status" className="rounded-xl bg-success-tint px-3 py-3 text-[16px] font-semibold text-secondary">
          {estado.mensaje}
        </p>
      )}

      <AccionesForm
        etiqueta={modo === "invitar" ? "Mandar invitación" : "Crear cuenta"}
        cargando={enviando}
        textoCargando="Guardando…"
        cancelarHref="/revendedores"
        fija
      />
    </form>
  );
}

/** Una opción de un grupo de radios, como tarjeta de 48px o más. */
function OpcionRadio({
  name,
  value,
  elegida,
  onElegir,
  titulo,
  descripcion,
}: {
  name: string;
  value: string;
  elegida: boolean;
  onElegir: () => void;
  titulo: string;
  descripcion: string;
}) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer gap-3 rounded-xl border p-3.5 ${
        elegida ? "border-primary bg-primary-2" : "border-[#d0cec8] bg-surface"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={elegida}
        onChange={onElegir}
        className="mt-0.5 size-5 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[16px] font-semibold text-text">{titulo}</span>
        <span className="text-[14px] leading-snug text-text-muted">{descripcion}</span>
      </span>
    </label>
  );
}

/** Campos de la persona — se remontan en cada respuesta (`key`) para
 * tomar los valores que devolvió la acción si hubo error. */
function CamposPersona({ coordinadores, valores }: { coordinadores: Admin[]; valores?: ValoresFormInvitacion }) {
  const [rol, setRol] = useState<RolInvitacion>(valores?.rol ?? "revendedor");

  return (
    <SeccionForm titulo="¿Quién es?">
      <Campo id="nombre" etiqueta="Nombre" ayuda="Es el nombre que va a ver todo el equipo.">
        <Entrada
          name="nombre"
          type="text"
          autoComplete="off"
          required
          maxLength={NOMBRE_MAX}
          defaultValue={valores?.nombre ?? ""}
          placeholder="Nombre y apellido"
        />
      </Campo>

      <Campo id="email" etiqueta="Email" ayuda="Con este email va a entrar a la app.">
        <Entrada
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          required
          defaultValue={valores?.email ?? ""}
          placeholder="nombre@mail.com"
        />
      </Campo>

      <fieldset className="flex flex-col gap-2">
        <legend className={`${CLASE_ETIQUETA} mb-1`}>Rol</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["revendedor", "admin", "coordinador"] as const).map((r) => (
            <OpcionRadio
              key={r}
              name="rol"
              value={r}
              elegida={rol === r}
              onElegir={() => setRol(r)}
              titulo={ETIQUETA_ROL[r]}
              descripcion={DESCRIPCION_ROL[r]}
            />
          ))}
        </div>
      </fieldset>

      {rol === "revendedor" && (
        <Campo
          id="encargadoId"
          etiqueta="Encargado"
          opcional
          ayuda="A quién le rinde la plata. Lo podés cambiar después."
        >
          <Selector name="encargadoId" defaultValue={valores?.encargadoId ?? ""}>
            <option value="">Sin encargado por ahora</option>
            {coordinadores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
      )}
    </SeccionForm>
  );
}
