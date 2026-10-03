import { redirect } from "next/navigation";

import { MiShell } from "@/components/mi/mi-shell";
import { puedeUsarShellMi, tieneAccesoValido } from "@/lib/rol-vendedor";
import { sesionActual } from "@/lib/sesion-actual";

/**
 * Shell exclusivo de quien puede operar en `/mi`
 *: un `rol = 'revendedor'`, un admin con su propio espacio de
 * revendedor habilitado (`revende`, ver
 * `0026_roles_pendiente_espacio_revendedor.sql`), o un coordinador
 * (`0055_coordinador.sql` — reparte botellas a sus revendedoras, sin
 * stock propio ni ventas) — sin el rail de admin
 * (`components/app-rail.tsx`): cabecera simple + tab bar en mobile, rail
 * propio (`components/mi-rail.tsx`) en escritorio (ver
 * `components/mi/mi-shell.tsx`). Qué se ve ADENTRO de `/mi` (stock propio
 * vs. lista de revendedoras) lo decide cada página según el rol — `MiShell`
 * es el mismo para los tres.
 * `lib/supabase/middleware.ts` (`decidirRedireccion`) ya garantiza que
 * solo alguien con `puedeUsarShellMi()` llega a renderizar este layout (y
 * que un admin sin espacio propio nunca cae en `/mi/*`), redirigiendo con
 * la misma consulta (`lib/rol-vendedor.ts`, resuelta una sola vez por
 * request vía `sesionActual()`, `lib/sesion-actual.ts`) que este layout
 * reusa acá como defensa en profundidad — la RLS de cada tabla sigue
 * siendo la capa real de seguridad.
 */
export default async function MiLayout({ children }: LayoutProps<"/">) {
  const { vendedor } = await sesionActual();

  // `tieneAccesoValido` trata `activo = false` y `rol = 'pendiente'`
  // igual que "sin fila" (fix de seguridad de Task 3 + rol `pendiente` de
  // 0026, ver `lib/rol-vendedor.ts`) — el middleware ya manda a
  // `/sin-acceso` en esos casos antes de llegar acá; este chequeo es
  // defensa en profundidad, así que replica el mismo destino en vez de
  // "/" para no dejar a nadie sin acceso en un layout que debería ser
  // inalcanzable.
  if (!tieneAccesoValido(vendedor)) {
    redirect("/sin-acceso");
  }
  if (!puedeUsarShellMi(vendedor)) {
    redirect("/");
  }

  return <MiShell>{children}</MiShell>;
}
