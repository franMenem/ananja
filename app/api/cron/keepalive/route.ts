import { NextResponse } from "next/server";

import { autorizarCron } from "@/lib/cron/autorizar";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Keep-alive del proyecto Supabase (plan free) — ver
 * docs/ops/supabase-keepalive.md. Lo llaman Vercel Cron (diario,
 * `vercel.json`) y un GitHub Action de respaldo cada 6 h
 * (.github/workflows/supabase-keepalive.yml), cada uno con su propio
 * `?source=`.
 *
 * Hace un INSERT real (no solo un SELECT) en la tabla dedicada
 * `keepalive` — con solo lecturas siguieron llegando avisos de pausa en
 * la primera implementación de este mecanismo (proyecto Ascendant, ver
 * el doc de arriba), así que hace falta escritura real. También borra
 * las filas de más de 30 días para que la tabla no crezca sin límite
 * (esa misma limpieza es, de nuevo, otra escritura).
 *
 * Nunca toca ninguna otra tabla.
 */
export const dynamic = "force-dynamic";

const LIMITE_DIAS = 30;
const FUENTES_VALIDAS = new Set(["vercel", "github", "manual"]);

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;

  // Falta de configuración, no un intento de acceso no autorizado: 500
  // para que se note en los logs como error de deploy, distinto del 401
  // de abajo.
  if (!secreto) {
    return NextResponse.json(
      { ok: false, error: "Falta CRON_SECRET en el entorno." },
      { status: 500 },
    );
  }

  if (!autorizarCron(request.headers.get("authorization"), secreto)) {
    return NextResponse.json({ ok: false, error: "NO_AUTORIZADO" }, {
      status: 401,
    });
  }

  const { searchParams } = new URL(request.url);
  const fuenteParam = searchParams.get("source");
  // Vercel Cron no manda query string, así que sin `?source=` el default
  // es "vercel" (el disparador más frecuente hoy); el GitHub Action manda
  // `?source=github` explícito.
  const source = FUENTES_VALIDAS.has(fuenteParam ?? "")
    ? (fuenteParam as "vercel" | "github" | "manual")
    : "vercel";

  const supabase = createAdminClient();

  const { error: insertError } = await supabase
    .from("keepalive")
    .insert({ source });

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: insertError.message },
      { status: 500 },
    );
  }

  const corte = new Date(
    Date.now() - LIMITE_DIAS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error: deleteError } = await supabase
    .from("keepalive")
    .delete()
    .lt("pinged_at", corte);

  if (deleteError) {
    return NextResponse.json(
      { ok: false, error: deleteError.message },
      { status: 500 },
    );
  }

  const { error: countError } = await supabase
    .from("keepalive")
    .select("*", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json(
      { ok: false, error: countError.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, source, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
