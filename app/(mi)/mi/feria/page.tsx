import { FeriaMiVista } from "@/components/mi/feria-vista";
import { VolverLink } from "@/components/volver-link";
import { cargarFeriaMi } from "@/lib/data/ferias-mi";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/feria` — la feria abierta donde participa la revendedora: lo que se
 * llevó (pendiente) o el resumen de su cierre (cerrada). El cierre se hace en
 * `/mi/feria/cerrar`.
 */
export default async function MiFeriaPage() {
  const supabase = await createClient();
  const { vendedor } = await sesionActual();
  const { data, error } = vendedor
    ? await cargarFeriaMi(supabase, vendedor.id)
    : { data: null, error: null };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <VolverLink href="/mi" label="inicio" hover={false} corto />
      {error ? <p className="text-[16px] text-accent">{error}</p> : <FeriaMiVista feria={data?.datos ?? null} />}
    </div>
  );
}
