import Link from "next/link";

import { NotificacionesBanner } from "@/components/notificaciones-banner";
import { ListaTareas } from "@/components/tareas/lista-tareas";
import { hoyISO } from "@/lib/fechas";
import { cargarTareas, completarComprobantes } from "@/lib/data/tareas";
import { obtenerDestinoEfectivo } from "@/lib/data/plata";
import { DESTINO_EFECTIVO_DEFAULT } from "@/lib/dominio/transferencias";
import { grupoDeFecha } from "@/lib/dominio/notificaciones";
import { cargarAvisos } from "@/lib/notificaciones";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";
import type { Tarea } from "@/lib/dominio/tareas";

// Las tareas se calculan sobre datos en vivo — no se pueden cachear.
export const dynamic = "force-dynamic";

/**
 * `/tareas` — una sola lista (sin grupos por sector, pedido de Fran),
 * ordenada por urgencia y después por antigüedad (`lib/tareas.ts`). Solo
 * aparecen las tareas que le tocan a quien mira. "Confirmar" pagos y "Pasar
 * a la cuenta" se resuelven en el lugar; el resto lleva a su pantalla.
 *
 * Debajo de la lista, el bloque "Avisos" (`stock_bajo`/`gasto_nuevo`,
 * `lib/notificaciones.ts`), el banner de permiso de push
 * (`NotificacionesBanner`) y el link discreto "Cambiar contraseña" —
 * pantalla `/notificaciones` retirada 2026-09-16, fundida acá (Avisos se
 * fusiona en Tareas, decisión de Fran); el link de cambio de contraseña
 * voluntario vivía al pie de esa pantalla y no tenía ninguna otra entrada
 * en la app, así que viaja acá con el resto.
 */
export default async function TareasPage() {
  const supabase = await createClient();
  const { vendedor: yo } = await sesionActual();

  const [resultado, destino, avisos] = await Promise.all([
    cargarTareas(supabase, { miVendedorId: yo?.id ?? null, hoy: hoyISO() }).catch(
      (err: unknown) => {
        console.error("TareasPage", err);
        return null;
      },
    ),
    obtenerDestinoEfectivo(supabase),
    cargarAvisos(supabase),
  ]);
  // Si falla, se muestra el error en vez de "Todo al día" sobre datos incompletos.
  const error = resultado ? null : "No se pudieron cargar las tareas.";
  const tareas: Tarea[] = resultado ? await completarComprobantes(supabase, resultado.tareas) : [];

  const urgentes = tareas.filter((t) => t.urgencia === "urgente").length;

  // Agrupado "Hoy / Ayer / fecha" — misma función que usaba /notificaciones,
  // preservando el orden (`cargarAvisos` ya devuelve más nuevo primero).
  const ahora = new Date();
  const gruposAvisos: { titulo: string; items: typeof avisos }[] = [];
  for (const aviso of avisos) {
    const titulo = grupoDeFecha(aviso.created_at, ahora);
    const ultimo = gruposAvisos[gruposAvisos.length - 1];
    if (ultimo?.titulo === titulo) {
      ultimo.items.push(aviso);
    } else {
      gruposAvisos.push({ titulo, items: [aviso] });
    }
  }

  return (
    <div className="@container w-full">
      {/*
        Encabezado y contenido comparten el mismo contenedor (`max-w` +
        `mx-auto`) para que "N pendientes" quede alineado con el borde
        derecho de la lista, no con el de la ventana (antes el encabezado
        ocupaba el ancho completo de <main> mientras el resto topeaba a
        960px). Desde `@3xl` (ancho real del contenido, no del viewport —
        ahí entra el rail) se abre a dos columnas, mismo patrón que
        `components/mi/ganancia-vista.tsx`: tareas como columna principal
        (7fr) y Avisos + instalar app + cambiar contraseña como columna
        lateral más angosta (5fr). Por debajo de `@3xl`, una sola columna
        como antes.
      */}
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 pb-8 @3xl:grid @3xl:max-w-[1400px] @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:items-start @3xl:gap-x-12 @6xl:gap-x-16">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 @3xl:col-span-2">
          <h1 className="font-display hidden text-[38px] leading-[1.05] text-primary lg:block">Tareas</h1>
          {!error && tareas.length > 0 && (
            <p className="text-sm text-text-muted">
              {tareas.length} {tareas.length === 1 ? "pendiente" : "pendientes"}
              {urgentes > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-accent">
                    {urgentes} {urgentes === 1 ? "urgente" : "urgentes"}
                  </span>
                </>
              )}
            </p>
          )}
        </div>

        {/* Columna principal: tareas */}
        <div className="flex flex-col gap-5">
          {error ? (
            <p role="alert" className="py-6 text-sm text-accent">
              {error}
            </p>
          ) : tareas.length === 0 ? (
            <div className="flex flex-col gap-1 py-10 text-center">
              <p className="font-display text-[28px] text-primary">Todo al día</p>
              <p className="text-sm text-text-muted">No hay nada pendiente por ahora.</p>
            </div>
          ) : (
            <ListaTareas tareas={tareas} medioDeposito={destino ?? DESTINO_EFECTIVO_DEFAULT} />
          )}
        </div>

        {/* Columna lateral: avisos, instalar app y cambiar contraseña */}
        <div className="mt-2 flex flex-col gap-5 @3xl:mt-0">
          {gruposAvisos.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                  Avisos
                </span>
                <span className="h-px flex-1 bg-[linear-gradient(to_right,var(--color-border),transparent)]" />
              </div>
              {gruposAvisos.map((grupo) => (
                <div key={grupo.titulo} className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.18em] text-text-muted/70 uppercase">
                    {grupo.titulo}
                  </span>
                  {grupo.items.map((aviso) => (
                    <p key={aviso.id} className="text-sm text-text-muted">
                      {aviso.frase}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}

          <NotificacionesBanner />

          <Link
            href="/cambiar-password"
            className="mb-4 self-start text-xs text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            Cambiar contraseña
          </Link>
        </div>
      </div>
    </div>
  );
}
