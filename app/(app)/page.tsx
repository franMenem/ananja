import { Suspense } from "react";

import {
  EsqueletoGananciaInicio,
  InicioVista,
  TarjetaGananciaInicio,
} from "@/components/inicio/inicio-vista";
import { InformarTareasPendientes } from "@/components/tareas-badge";
import { cargarGananciaInicio, cargarInicio, type GananciaInicio } from "@/lib/data/inicio";
import { createClient } from "@/lib/supabase/server";

// Datos en vivo (plata, deudas, stock, tareas): nunca cachear.
export const dynamic = "force-dynamic";

/** La ganancia espera su propia lectura, dentro de `<Suspense>`. */
async function GananciaDelMes({ promesa }: { promesa: Promise<GananciaInicio | null> }) {
  return <TarjetaGananciaInicio ganancia={await promesa} />;
}

/**
 * Inicio del admin. Todo lo junta `cargarInicio` (`lib/data/inicio.ts`,
 * un solo `getUser` y las fuentes de Tareas reusadas); cómo se ve está en
 * `components/inicio/inicio-vista.tsx`.
 *
 * La ganancia del mes (`v_margen_ventas`, la lectura más lenta) se lanza al
 * mismo tiempo pero NO se espera: el resto de Inicio sale en cuanto está, y
 * la tarjeta llega por streaming dentro de `<Suspense>` con un esqueleto de
 * su mismo tamaño. `cargarGananciaInicio` nunca rechaza (devuelve `null`).
 */
export default async function HomePage() {
  const supabase = await createClient();
  const ganancia = cargarGananciaInicio(supabase);
  const datos = await cargarInicio(supabase);
  return (
    <>
      {/* El número de tareas ya está calculado: el badge no lo pide de nuevo. */}
      {!datos.errorTareas && <InformarTareasPendientes cantidad={datos.totalTareasBadge} />}
      <InicioVista
        datos={datos}
        ganancia={
          <Suspense fallback={<EsqueletoGananciaInicio />}>
            <GananciaDelMes promesa={ganancia} />
          </Suspense>
        }
      />
    </>
  );
}
