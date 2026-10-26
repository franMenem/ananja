"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  TIPO_INSUMO_LABELS,
  UNIDAD_INSUMO_LABELS,
  type TipoInsumo,
  type UnidadInsumo,
} from "@/lib/dominio/insumos";
import { crearInsumo } from "@/lib/insumos";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { MontoInput } from "@/components/monto-input";
import { AccionesForm } from "@/components/ui/acciones-form";
import { Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
import { Segmentos } from "@/components/ui/segmentos";
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <SeccionForm titulo="¿Qué insumo es?">
        <Campo id="nombre" etiqueta="Nombre">
          <Entrada
            type="text"
            required
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ej. Tapa metálica"
          />
        </Campo>

        <Segmentos
          etiqueta="Tipo"
          opciones={TIPOS.map((t) => ({ value: t, label: TIPO_INSUMO_LABELS[t] }))}
          valor={tipo}
          onChange={setTipo}
        />

        <Segmentos
          etiqueta="Unidad"
          opciones={UNIDADES.map((u) => ({ value: u, label: UNIDAD_INSUMO_LABELS[u] }))}
          valor={unidad}
          onChange={setUnidad}
        />
      </SeccionForm>

      <SeccionForm titulo="¿Cuándo te aviso que queda poco?">
        <MontoInput
          id="umbral"
          tipo="cantidad"
          label="Umbral mínimo (opcional)"
          value={umbral}
          onChange={setUmbral}
          hint="Si queda esta cantidad o menos, aparece como “Queda poco”."
        />
      </SeccionForm>

      {error && <MensajeError>{error}</MensajeError>}

      <AccionesForm etiqueta="Guardar insumo" cargando={saving} cancelarHref="/stock/insumos" />
    </form>
  );
}
