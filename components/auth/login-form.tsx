"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  esEmailValido,
  mensajeErrorRecuperacion,
  normalizarEmail,
  resolverUrlSitio,
} from "@/lib/dominio/invitaciones";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  /** Aviso que llega por query (`?aviso=link` desde `/auth/confirm`). */
  aviso: string | null;
};

const labelClass = "text-[10px] tracking-[0.18em] text-text-muted uppercase";
const submitClass =
  "mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45";

/**
 * Ingreso con email + contraseña, y "¿Olvidaste tu contraseña?" en la
 * misma pantalla: pide el email y manda el link de recuperación
 * (`resetPasswordForEmail`, redirige a `/auth/confirm` → `/cambiar-password`).
 * El mensaje de éxito es siempre el mismo exista o no el email, para no
 * revelar quién tiene cuenta.
 */
export function LoginForm({ aviso }: LoginFormProps) {
  const router = useRouter();
  const [modo, setModo] = useState<"ingresar" | "recuperar">("ingresar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);

  function cambiarModo(nuevo: "ingresar" | "recuperar") {
    setModo(nuevo);
    setError(null);
    setEnviado(false);
  }

  async function handleIngresar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setLoading(false);
      setError("Email o contraseña incorrectos.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function handleRecuperar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const emailNormalizado = normalizarEmail(email);
    if (!esEmailValido(emailNormalizado)) {
      setError("Ese email no es válido. Revisalo.");
      return;
    }

    setLoading(true);
    const sitio = resolverUrlSitio(process.env.NEXT_PUBLIC_SITE_URL, window.location.origin);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailNormalizado, {
      redirectTo: `${sitio}/auth/confirm?next=/cambiar-password`,
    });
    setLoading(false);

    // Neutro: nunca revela si el email tiene cuenta (ver
    // `mensajeErrorRecuperacion` — el límite por persona se trata como
    // éxito; solo un 429 genérico o un error del servidor muestra algo).
    const mensaje = mensajeErrorRecuperacion(resetError);
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setEnviado(true);
  }

  const avisoTexto =
    aviso === "link" ? "El link venció o ya se usó. Pedí uno nuevo con “¿Olvidaste tu contraseña?”." : null;

  const campoEmail = (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="email" className={labelClass}>
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={`min-h-11 border-0 border-b bg-transparent text-base text-text ${
          email ? "border-primary" : "border-border"
        } focus:border-primary`}
        placeholder={`equipo@${NEGOCIO.id}.co`}
      />
    </div>
  );

  if (modo === "recuperar") {
    return (
      <form onSubmit={handleRecuperar} className="flex flex-col gap-5">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">Recuperar contraseña</span>

        {enviado ? (
          <p role="status" className="border-l-2 border-mark pl-3 text-sm text-text">
            Si ese email tiene una cuenta, te llega un mail con un link para elegir una contraseña nueva.
            Revisá también la carpeta de spam.
          </p>
        ) : (
          <>
            <p className="text-sm text-text-muted">
              Escribí tu email y te mandamos un link para elegir una contraseña nueva.
            </p>
            {campoEmail}
            {error && (
              <p role="alert" className="text-xs text-accent">
                {error}
              </p>
            )}
            <button type="submit" disabled={loading} className={submitClass}>
              {loading ? "Enviando…" : "Mandarme el link"}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => cambiarModo("ingresar")}
          className="flex min-h-11 items-center justify-center text-[12px] tracking-[0.12em] text-primary uppercase underline-offset-4 hover:underline"
        >
          Volver a ingresar
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleIngresar} className="flex flex-col gap-5">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">Cuenta del equipo</span>

      {avisoTexto && (
        <p role="alert" className="border-l-2 border-accent pl-3 text-sm text-accent">
          {avisoTexto}
        </p>
      )}

      {campoEmail}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelClass}>
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`min-h-11 border-0 border-b bg-transparent text-base tracking-[0.1em] text-text ${
            password ? "border-primary" : "border-border"
          } focus:border-primary`}
          placeholder="••••••••"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className={submitClass}>
        {loading ? "Ingresando…" : "Ingresar"}
      </button>

      <button
        type="button"
        onClick={() => cambiarModo("recuperar")}
        className="flex min-h-11 items-center justify-center text-[12px] tracking-[0.12em] text-primary underline-offset-4 hover:underline"
      >
        ¿Olvidaste tu contraseña?
      </button>
    </form>
  );
}
