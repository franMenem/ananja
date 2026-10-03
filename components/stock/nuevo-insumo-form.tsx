"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import {
  TIPO_INSUMO_LABELS,
  UNIDAD_INSUMO_LABELS,
  type TipoInsumo,
  type UnidadInsumo,
} from "@/lib/dominio/insumos";
import { crearInsumo } from "@/lib/insumos";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { MontoInput } from "@/components/monto-input";
import { parseCantidadInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

const TIPOS: TipoInsumo[] = ["materia_prima", "envase", "etiqueta"];
const UNIDADES: UnidadInsumo[] = ["litro", "kilo", "unidad"];

const ERRORES: Record<string, string> = {
  VENDEDOR_NO_REGISTRADO: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
  NOMBRE_INVALIDO: "Poné un nombre.",
};

function mensajeErrorInsumo(codigo: string | undefined): string {
  return traducirErrorRpc(codigo, ERRORES, "No se pudo guardar el insumo. Probá de nuevo.");
}

/**
 * Formulario de "Nuevo insumo" (`/stock/insumos/nuevo`, spec §
 * Pantallas): nombre, tipo, unidad, umbral mínimo opcional. Llama
 * `crear_insumo`.
 */
export function NuevoInsumoForm() {
  const router = useRouter();

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoInsumo>("materia_prima");
  const [unidad, setUnidad] = useState<UnidadInsumo>("unidad");
  const [umbral, setUmbral] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError("Poné un nombre.");
      return;
    }

    const umbralTrim = umbral.trim();
    let umbralNum = 0;
    if (umbralTrim !== "") {
      const umbralParseado = parseCantidadInput(umbralTrim);
      if (umbralParseado === null) {
        setError("Revisá el umbral.");
        return;
      }
      umbralNum = umbralParseado;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: rpcError } = await crearInsumo(supabase, {
        nombre: nombre.trim(),
        tipo,
        unidad,
        umbralMinimo: umbralNum,
      });

      if (rpcError) {
        setSaving(false);
        setError(mensajeErrorInsumo(rpcError.message));
        return;
      }

      router.push("/stock/insumos");
      router.refresh();
    } catch {
      setSaving(false);
      setError(
        "No se pudo conectar. Verificá tu conexión e intentá de nuevo — no perdiste los datos cargados.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pb-8">
      <div>
        <label
          htmlFor="nombre"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Nombre
        </label>
        <input
          id="nombre"
          type="text"
          required
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          placeholder="Ej. Tapa metálica"
          className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
        />
      </div>

      <div>
        <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Tipo
        </span>
        <div className="mt-1.5 grid grid-cols-3 gap-px bg-border">
          {TIPOS.map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setTipo(opcion)}
              aria-pressed={tipo === opcion}
              className={`min-h-[46px] px-2 text-[12px] font-medium transition-colors ${
                tipo === opcion ? "bg-primary text-background" : "bg-surface-raised text-text"
              }`}
            >
              {TIPO_INSUMO_LABELS[opcion]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Unidad
        </span>
        <div className="mt-1.5 grid grid-cols-3 gap-px bg-border">
          {UNIDADES.map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setUnidad(opcion)}
              aria-pressed={unidad === opcion}
              className={`min-h-[46px] px-2 text-[12px] font-medium transition-colors ${
                unidad === opcion ? "bg-primary text-background" : "bg-surface-raised text-text"
              }`}
            >
              {UNIDAD_INSUMO_LABELS[opcion]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <MontoInput
          id="umbral"
          tipo="cantidad"
          label="Umbral mínimo (opcional)"
          value={umbral}
          onChange={setUmbral}
          labelClassName="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          cajaClassName="mt-1.5 flex border border-border bg-surface px-3 focus-within:border-primary"
          inputClassName="min-h-12 w-full min-w-0 bg-transparent text-base text-text focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-accent">
          {error}
        </p>
      )}

      <BotonAccion
        cargando={saving}
        textoCargando="Guardando…"
        type="submit"
        className="min-h-14 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        Guardar insumo
      </BotonAccion>
    </form>
  );
}
