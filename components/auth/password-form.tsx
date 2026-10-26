"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { guardarPasswordNueva } from "@/app/(auth)/cambiar-password/actions";
import { PASSWORD_MIN_LENGTH, validarPassword } from "@/lib/dominio/invitaciones";
import { resetVendedorActualCache } from "@/lib/vendedor-actual";

type PasswordFormProps = {
  /** Rótulo chico arriba del formulario ("Contraseña nueva"). */
  etiqueta: string;
  textoBoton: string;
  /** Ruta a la que va después de guardar (el proxy corrige si no le
   * corresponde por rol). */
  destino: string;
  /** Muestra el campo "Contraseña actual" desde el principio (cambio
   * voluntario desde una sesión común). Solo visual: la que decide si hace
   * falta es la server action, y si la pide el campo aparece igual. */
  pedirPasswordActual?: boolean;
};

/**
 * Formulario "elegí tu contraseña" compartido por `/bienvenida` (primer
 * acceso desde una invitación) y `/cambiar-password` (contraseña temporal,
 * link de recuperación o cambio voluntario). Mínimo de largo, confirmación
 * y botón mostrar/ocultar.
 *
 * Guardar pasa TODO por la server action `guardarPasswordNueva`
 * (`app/(auth)/cambiar-password/actions.ts`): cambia la contraseña con la
 * sesión de la persona y, solo si eso sale bien, apaga con la service role
 * los dos flags que fuerzan esta pantalla (`must_change_password` y el de
 * bienvenida) en `app_metadata` — nunca desde acá con
 * `supabase.auth.updateUser({ data: {...} })`, que es un `user_metadata`
 * que la propia persona podía reescribir sola (el agujero de seguridad que
 * resolvió esa migración a `app_metadata`, ver el comentario de la acción).
 */
export function PasswordForm({ etiqueta, textoBoton, destino, pedirPasswordActual = false }: PasswordFormProps) {
  const router = useRouter();
  const [pedirActual, setPedirActual] = useState(pedirPasswordActual);
  const [passwordActual, setPasswordActual] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const invalida = validarPassword(password, confirmacion);
    if (invalida) {
      setError(invalida);
      return;
    }

    setLoading(true);
    const resultado = await guardarPasswordNueva(password, confirmacion, pedirActual ? passwordActual : undefined);

    if (!resultado.ok) {
      setLoading(false);
      if (resultado.pedirActual) setPedirActual(true);
      setError(resultado.mensaje ?? "No se pudo guardar la contraseña. Probá de nuevo.");
      return;
    }

    resetVendedorActualCache();
    router.replace(destino);
    router.refresh();
  }

  const inputType = visible ? "text" : "password";
  const inputClass = (valor: string) =>
    `min-h-11 w-full border-0 border-b bg-transparent pr-2 text-base text-text ${
      visible ? "" : ""
    } ${valor ? "border-primary" : "border-border"} focus:border-primary`;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] text-text-muted">{etiqueta}</span>
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="flex min-h-11 items-center text-[14px] text-primary underline-offset-4 hover:underline"
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {pedirActual && (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password-actual"
            className="block text-[15px] font-semibold text-text"
          >
            Contraseña actual
          </label>
          <input
            id="password-actual"
            name="password-actual"
            type={inputType}
            autoComplete="current-password"
            required
            value={passwordActual}
            onChange={(event) => setPasswordActual(event.target.value)}
            className={inputClass(passwordActual)}
            placeholder="••••••••"
          />
          <p className="text-[14px] text-text-muted">
            Si la olvidaste, cerrá sesión y usá “¿Olvidaste tu contraseña?”.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="block text-[15px] font-semibold text-text">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type={inputType}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass(password)}
          placeholder="••••••••"
        />
        <p className="text-[14px] text-text-muted">Mínimo {PASSWORD_MIN_LENGTH} caracteres.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmacion" className="block text-[15px] font-semibold text-text">
          Repetí la contraseña
        </label>
        <input
          id="confirmacion"
          name="confirmacion"
          type={inputType}
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={confirmacion}
          onChange={(event) => setConfirmacion(event.target.value)}
          className={inputClass(confirmacion)}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p role="alert" className="text-[14px] text-accent">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[16px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        {loading ? "Guardando…" : textoBoton}
      </button>
    </form>
  );
}
