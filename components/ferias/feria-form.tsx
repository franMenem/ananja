"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MontoInput } from "@/components/monto-input";
import { AccionesForm } from "@/components/ui/acciones-form";
import { AreaTexto, Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
import { mensajeErrorFeria } from "@/lib/dominio/feria";
import { campoNumericoInvalido } from "@/lib/dominio/campo-numerico";
import { feriaCrear, feriaEditar, type DatosFeria } from "@/lib/ferias";
import { hoyISO } from "@/lib/fechas";
import { formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

export type FeriaFormInicial = {
  nombre: string;
  fecha: string;
  lugar: string | null;
  nota: string | null;
  /** `productoId -> centavos` de los precios ya cargados. */
  precios: Record<string, number>;
};

type Props = {
  productos: { id: string; nombre: string }[];
  /** Con `feriaId` edita esa feria; sin él, crea una. */
  feriaId?: string;
  inicial?: FeriaFormInicial;
};

/**
 * Alta y edición de una feria: nombre, fecha, lugar, nota y el precio de feria
 * de cada producto (vacío = sin precio de feria para ese producto).
 */
export function FeriaForm({ productos, feriaId, inicial }: Props) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoyISO());
  const [lugar, setLugar] = useState(inicial?.lugar ?? "");
  const [nota, setNota] = useState(inicial?.nota ?? "");
  const [precios, setPrecios] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      productos.map((p) => [p.id, inicial?.precios[p.id] != null ? formatMontoDisplay(inicial.precios[p.id]) : ""]),
    ),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!nombre.trim()) {
      setError("Poné un nombre para la feria.");
      return;
    }
    const lista: DatosFeria["precios"] = [];
    for (const p of productos) {
      const texto = precios[p.id] ?? "";
      if (texto.trim() === "") continue;
      const centavos = campoNumericoInvalido(texto) ? null : parseMontoInput(texto);
      if (centavos === null || centavos <= 0) {
        setError(`Revisá el precio de ${p.nombre}: tiene que ser mayor a cero.`);
        return;
      }
      lista.push({ productoId: p.id, precioCentavos: centavos });
    }

    const datos: DatosFeria = {
      nombre: nombre.trim(),
      fecha,
      lugar: lugar.trim() || null,
      nota: nota.trim() || null,
      precios: lista,
    };

    setGuardando(true);
    const supabase = createClient();
    const { data, error: rpcError } = feriaId
      ? await feriaEditar(supabase, feriaId, datos)
      : await feriaCrear(supabase, datos);
    setGuardando(false);

    if (rpcError) {
      setError(mensajeErrorFeria(rpcError.message));
      return;
    }
    const id = (data as { feria_id?: string } | null)?.feria_id ?? feriaId;
    router.push(id ? `/ferias/${id}` : "/ferias");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5 pb-8">
      <SeccionForm titulo="¿Qué feria es?">
        <Campo id="feria-nombre" etiqueta="Nombre">
          <Entrada
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Feria de diciembre"
          />
        </Campo>
        <Campo id="feria-fecha" etiqueta="Fecha">
          <Entrada
            type="date"
            required
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="tabular-nums"
          />
        </Campo>
        <Campo id="feria-lugar" etiqueta="Lugar" opcional>
          <Entrada type="text" value={lugar} onChange={(e) => setLugar(e.target.value)} />
        </Campo>
      </SeccionForm>

      <SeccionForm
        titulo="Precio de feria por producto"
        descripcion="Con qué precio se venden las botellas en la feria. Si dejás uno vacío, ese producto no tiene precio de feria."
      >
        {productos.length === 0 ? (
          <p className="text-[15px] text-text-muted">Todavía no hay productos cargados.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {productos.map((p) => (
              <MontoInput
                key={p.id}
                id={`feria-precio-${p.id}`}
                label={p.nombre}
                value={precios[p.id] ?? ""}
                onChange={(v) => setPrecios((prev) => ({ ...prev, [p.id]: v }))}
                placeholder="Sin precio"
              />
            ))}
          </div>
        )}
      </SeccionForm>

      <MasDatos abierto={nota.trim() !== ""}>
        <Campo id="feria-nota" etiqueta="Nota" opcional>
          <AreaTexto value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
        </Campo>
      </MasDatos>

      {error && <MensajeError>{error}</MensajeError>}

      <AccionesForm
        etiqueta={feriaId ? "Guardar cambios" : "Crear feria"}
        cargando={guardando}
        cancelarHref={feriaId ? `/ferias/${feriaId}` : "/ferias"}
      />
    </form>
  );
}
