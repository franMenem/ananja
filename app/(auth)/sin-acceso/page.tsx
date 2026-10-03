import { redirect } from "next/navigation";

import { SinAccesoContent } from "@/components/sin-acceso-content";
import { obtenerMiRevendedor } from "@/lib/revendedores";
import { tieneAccesoValido } from "@/lib/rol-vendedor";
import { createClient } from "@/lib/supabase/server";

/**
 * Pantalla para un usuario con sesión pero sin acceso: sin fila en
 * `vendedores`, o con `activo = false` (fix de seguridad de Task 3 —
 * `lib/rol-vendedor.ts` § `tieneAccesoValido`, `lib/supabase/middleware.ts`).
 * Sin acción posible más que cerrar sesión y avisarle a Ananja/Germá — no
 * hay autoservicio de reactivación (mismo criterio que el resto del
 * alta/baja de vendedores, `supabase/crear-vendedor.sql`).
 *
 * Defensa en profundidad (fix de la revisión de Task 5): si el usuario que
 * llega acá SÍ tiene acceso válido — se activó después de que el
 * middleware lo mandó a `/sin-acceso`, o navegó directo a la URL —
 * redirige a su shell (`/` admin, `/mi` revendedor) en vez de mostrarle
 * "desactivado" por las dudas. Mismo criterio y misma consulta
 * (`obtenerMiRevendedor`, que reusa `lib/rol-vendedor.ts`) que
 * `app/(mi)/layout.tsx`.
 *
 * Rol `pendiente` (0026_roles_pendiente_espacio_revendedor.sql): un alta
 * automática sin aprobar todavía por un admin es distinto de un usuario
 * desactivado — `SinAccesoContent` muestra un mensaje distinto en cada
 * caso.
 */
export default async function SinAccesoPage() {
  const supabase = await createClient();
  const vendedor = await obtenerMiRevendedor(supabase);

  // Calculado ANTES del `if` de abajo a propósito: `tieneAccesoValido` es
  // un type guard (`vendedor is VendedorConRol`) y `redirect()` no
  // retorna (`never`) — TypeScript por eso angosta `vendedor` a `null` en
  // el código que sigue al `if`, así que leer `.activo`/`.rol` ahí da
  // error de tipos aunque en runtime sea válido.
  const pendiente = vendedor !== null && vendedor.activo && vendedor.rol === "pendiente";

  if (tieneAccesoValido(vendedor)) {
    redirect(vendedor.rol === "revendedor" ? "/mi" : "/");
  }

  return <SinAccesoContent pendiente={pendiente} />;
}
