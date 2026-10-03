import { NextResponse } from "next/server";

import { cargarTareas } from "@/lib/data/tareas";
import { hoyISO } from "@/lib/fechas";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";
import { contarTareasPendientes } from "@/lib/dominio/tareas";

// Cuenta en vivo — no se puede cachear ni en el edge ni en el navegador
// (`Cache-Control` más abajo hace lo mismo del lado del cliente).
export const dynamic = "force-dynamic";

/**
 * Cuenta el badge de Tareas del lado del servidor: MISMA lógica que usaba
 * `TareasBadgeProvider` (`components/tareas-badge.tsx`) — antes corría
 * entera en el navegador, ~15 consultas livianas en cada cambio de ruta
 * (con un piso de 20 s) —, ahora en una sola consulta HTTP. Reusa
 * `cargarTareas`/`contarTareasPendientes` (`lib/tareas-datos.ts`,
 * `lib/tareas.ts`) en vez de duplicar las reglas: el número tiene que salir
 * IDÉNTICO al que ya calculan `/tareas` (`tareas.length`) e Inicio —
 * decisión de Fran (2026-09-21): el badge muestra el total, sin filtrar
 * informativas ni la plata en mano de otra persona.
 *
 * Cliente Supabase de servidor (`createClient`, sesión real de la cookie,
 * RLS intacta) — nada de service role, esto es solo un conteo de lectura.
 * `sesionActual()` reusa el usuario/vendedor que el proxy ya resolvió para
 * este request cuando puede (`lib/sesion-actual.ts`); si no hay sesión
 * (`userId` null), 401 — en la práctica el proxy (`lib/supabase/middleware.ts`)
 * ya redirige a `/login` antes de llegar acá cuando no hay cookie de
 * sesión (mismo comportamiento que `/api/ocr-monto` y `/api/push/*`), así
 * que este 401 es defensa en profundidad más que el camino esperado.
 */
export async function GET() {
  const { userId, vendedor } = await sesionActual();
  if (!userId) {
    return NextResponse.json({ error: "NO_AUTENTICADO" }, { status: 401 });
  }

  try {
    const supabase = await createClient();
    const { tareas } = await cargarTareas(supabase, {
      miVendedorId: vendedor?.id ?? null,
      hoy: hoyISO(),
    });

    return NextResponse.json(
      { count: contarTareasPendientes(tareas) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("api/tareas-count", error);
    return NextResponse.json({ error: "ERROR_TAREAS" }, { status: 500 });
  }
}
