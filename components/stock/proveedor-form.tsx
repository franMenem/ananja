"use client";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import {
  formasProveedor,
  mensajeErrorProveedor,
  normalizarNombreProveedor,
  PROVEEDOR_NOMBRE_MAX,
} from "@/lib/dominio/proveedor";
import { guardarProveedor } from "@/lib/proveedor";
import { createClient } from "@/lib/supabase/client";

type ProveedorFormProps = {
  /** Nombre guardado hoy (`null` si todavía no se cargó ninguno). */
  nombreInicial: string | null;
};

/**
 * Pantalla "Nombre del proveedor" (`/stock/proveedor`): un solo campo.
 * Vacío = la app dice "el proveedor". Guarda con la RPC `guardar_proveedor`
 * (migración 0069) y hace `router.refresh()` para que el layout de `/stock`
 * vuelva a leer el nombre y todos los textos se actualicen sin recargar.
 */
export function ProveedorForm({ nombreInicial }: ProveedorFormProps) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial ?? "");
  const [guardado, setGuardado] = useState<string | null>(normalizarNombreProveedor(nombreInicial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const limpio = normalizarNombreProveedor(nombre);
  const sinCambios = limpio === guardado;
  const vistaPrevia = formasProveedor(limpio);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setExito(null);

    setSaving(true);
    try {
      const supabase = createClient();
      // Vacío = volver al valor por defecto: la RPC recibe '' (el generador
      // de tipos no admite null en sus argumentos).
      const { error: rpcError } = await guardarProveedor(supabase, limpio ?? "");
      if (rpcError) {
        setError(mensajeErrorProveedor(rpcError));
        return;
      }
      setGuardado(limpio);
      setNombre(limpio ?? "");
      setExito(
        limpio
          ? "Listo, guardamos el nombre. Ya se ve en toda la app."
          : "Listo, volvimos a «el proveedor».",
      );
      router.refresh();
    } catch {
      setError("No se pudo conectar. Verificá tu conexión e intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label
          htmlFor="proveedor-nombre"
          className="block text-[15px] font-semibold text-text"
        >
          Nombre del proveedor
        </label>
        <input
          id="proveedor-nombre"
          type="text"
          value={nombre}
          maxLength={PROVEEDOR_NOMBRE_MAX}
          autoComplete="off"
          onChange={(event) => {
            setNombre(event.target.value);
            setExito(null);
          }}
          className="mt-1.5 min-h-12 w-full border border-[#d0cec8] bg-surface px-3 text-[16px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-xl"
        />
        <p className="mt-1.5 text-[14px] leading-[1.5] text-text-muted">
          Si lo dejás vacío, la app dice «el proveedor».
        </p>
      </div>

      <div className="flex flex-col gap-1 border-l-2 border-border bg-surface-raised p-4">
        <span className="text-[14px] text-text-muted">
          Así se va a ver
        </span>
        <p className="text-[16px] leading-[1.5] text-text">
          &ldquo;+ Pedido {vistaPrevia.a}&rdquo; · &ldquo;{vistaPrevia.sujeto} te cobra los
          envases sin IVA&rdquo;
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[14px] text-accent">
          {error}
        </p>
      )}
      {exito && (
        <p role="status" className="text-[14px] text-secondary">
          {exito}
        </p>
      )}

      <BotonAccion
        cargando={saving}
        textoCargando="Guardando…"
        type="submit"
        disabled={sinCambios}
        className={`${BOTON_PRIMARIO} px-4`}
      >
        Guardar
      </BotonAccion>
    </form>
  );
}
