"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccionesForm } from "@/components/ui/acciones-form";
import { Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
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
      <SeccionForm titulo="¿Cómo se llama?">
        <Campo
          id="proveedor-nombre"
          etiqueta="Nombre del proveedor"
          ayuda="Si lo dejás vacío, la app dice «el proveedor»."
        >
          <Entrada
            type="text"
            value={nombre}
            maxLength={PROVEEDOR_NOMBRE_MAX}
            autoComplete="off"
            onChange={(event) => {
              setNombre(event.target.value);
              setExito(null);
            }}
          />
        </Campo>

        <div className="flex flex-col gap-1 rounded-xl bg-background p-3">
          <span className="text-[14px] font-semibold text-text-muted">Así se va a ver</span>
          <p className="text-[16px] leading-snug text-text">
            &ldquo;+ Pedido {vistaPrevia.a}&rdquo; · &ldquo;{vistaPrevia.sujeto} te cobra los
            envases sin IVA&rdquo;
          </p>
        </div>
      </SeccionForm>

      {error && <MensajeError>{error}</MensajeError>}
      {exito && (
        <p role="status" className="text-[15px] font-semibold text-secondary">
          {exito}
        </p>
      )}

      <AccionesForm
        etiqueta="Guardar nombre"
        cargando={saving}
        disabled={sinCambios}
        cancelarHref="/stock"
      />
    </form>
  );
}
