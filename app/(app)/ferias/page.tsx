import { ListaFerias } from "@/components/ferias/lista-ferias";
import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { LinkBoton } from "@/components/ui/link-boton";
import { listarFeriasConConteo } from "@/lib/data/ferias-admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** `/ferias` — las ferias de revendedoras: abiertas primero, después las cerradas. */
export default async function FeriasPage() {
  const supabase = await createClient();
  const { data: ferias, error } = await listarFeriasConConteo(supabase);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <EncabezadoPantalla
        titulo="Ferias"
        pregunta="¿Qué ferias hay y cómo les fue a las revendedoras?"
        acciones={
          <LinkBoton href="/ferias/nueva" className={`${BOTON_PRIMARIO} flex px-4`}>
            + Nueva feria
          </LinkBoton>
        }
      />
      {error && <p className="text-[15px] text-accent">{error}</p>}
      <ListaFerias ferias={ferias} />
    </div>
  );
}
