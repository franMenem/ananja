import { notFound, redirect } from "next/navigation";

import { MovimientoForm } from "@/components/stock/movimiento-form";
import { listarProductos } from "@/lib/data/stock";
import { obtenerLotesConStock } from "@/lib/data/lotes";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/types";

export const dynamic = "force-dynamic";

const TIPOS_VALIDOS: Enums<"tipo_movimiento">[] = ["ingreso", "egreso"];

const MOTIVOS_VALIDOS = ["venta", "degustacion", "rotura", "regalo", "otro"] as const;
type MotivoEgreso = (typeof MOTIVOS_VALIDOS)[number];

export default async function StockNuevoPage({
  searchParams,
}: PageProps<"/stock/nuevo">) {
  const params = await searchParams;
  const tipoParam = Array.isArray(params.tipo) ? params.tipo[0] : params.tipo;

  if (tipoParam === "ingreso") {
    redirect("/stock/lotes/nuevo");
  }

  if (!tipoParam || !TIPOS_VALIDOS.includes(tipoParam as never)) {
    notFound();
  }

  // Atajo tipo "registrar degustación" (`/stock/nuevo?tipo=egreso&motivo=degustacion`)
  // — arranca el selector de motivo ya en ese valor.
  const motivoParam = Array.isArray(params.motivo) ? params.motivo[0] : params.motivo;
  const motivoInicial = MOTIVOS_VALIDOS.includes(motivoParam as MotivoEgreso)
    ? (motivoParam as MotivoEgreso)
    : undefined;

  const supabase = await createClient();
  const [{ data: productos }, lotesConStock] = await Promise.all([
    listarProductos(supabase, "asc"),
    obtenerLotesConStock(supabase),
  ]);

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <MovimientoForm
        productos={productos ?? []}
        lotesConStock={lotesConStock}
        motivoInicial={motivoInicial}
      />
    </div>
  );
}
