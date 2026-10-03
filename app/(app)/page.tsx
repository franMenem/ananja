import { InicioVista } from "@/components/inicio/inicio-vista";
import { cargarInicio } from "@/lib/data/inicio";
import { createClient } from "@/lib/supabase/server";

// Datos en vivo (plata, deudas, stock, tareas): nunca cachear.
export const dynamic = "force-dynamic";

/**
 * Inicio del admin. Todo lo junta `cargarInicio` (`lib/data/inicio.ts`,
 * un solo `getUser` y las fuentes de Tareas reusadas); cómo se ve está en
 * `components/inicio/inicio-vista.tsx`.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const datos = await cargarInicio(supabase);
  return <InicioVista datos={datos} />;
}
