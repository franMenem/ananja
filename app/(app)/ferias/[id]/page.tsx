import { DetalleFeria } from "@/components/ferias/detalle-feria";
import { VolverLink } from "@/components/volver-link";
import { listarProductosDeParticipante, obtenerFeria, type ProductoParticipanteRow } from "@/lib/data/ferias";
import { listarRevendedorasActivas } from "@/lib/data/revendedores";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** `/ferias/[id]` — una feria: totales, participantes y sus acciones. */
export default async function FeriaPage({ params }: PageProps<"/ferias/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: completa, error } = await obtenerFeria(supabase, id);

  if (!completa) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/ferias" label="ferias" />
        <p className="text-[16px] text-text-muted">{error ?? "No encontramos esta feria."}</p>
      </div>
    );
  }

  const [revendedoras, porPersona] = await Promise.all([
    listarRevendedorasActivas(supabase),
    Promise.all(
      completa.participantes
        .filter((p) => p.vendedor_id)
        .map(async (p) => [p.vendedor_id as string, (await listarProductosDeParticipante(supabase, id, p.vendedor_id as string)).data] as const),
    ),
  ]);
  const productosPorPersona: Record<string, ProductoParticipanteRow[]> = Object.fromEntries(porPersona);

  return (
    <div className="flex flex-col gap-4">
      <VolverLink href="/ferias" label="ferias" />
      <DetalleFeria
        feria={completa.feria}
        participantes={completa.participantes}
        productosPorPersona={productosPorPersona}
        revendedoras={revendedoras.data}
      />
    </div>
  );
}
