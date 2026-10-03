import { NextResponse } from "next/server";
import webpush from "web-push";

import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { esEndpointPushPermitido } from "@/lib/push-endpoint";
import { esAdminAutenticado } from "@/lib/rol-vendedor";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types";

/**
 * Envía un Web Push a todas las suscripciones registradas — ver
 * contracts/api-routes.md § POST /api/push/send.
 *
 * Hardening (security-audit-2026-09-02.md hallazgo #3): el cliente ya NO
 * manda título/detalle en texto libre. Solo manda `{ tipo, referencia_id }`;
 * el título y el detalle se arman acá, server-side, con `service_role`,
 * a partir de los datos reales de `gastos`/`v_stock_actual` — así ningún
 * usuario autenticado puede mandar contenido arbitrario (spam / ingeniería
 * social) al equipo entero. `referencia_id` debe apuntar a un registro que
 * exista de verdad; para `gasto_nuevo` además debe ser reciente (<2 min),
 * lo que evita reusar un id viejo para mandar pushes fuera de contexto.
 *
 * Desvío aceptado del contrato: exige sesión Supabase válida en vez de
 * `PUSH_INTERNAL_SECRET` (mismo criterio de auth que el resto de las rutas
 * server, ver contracts/api-routes.md § intro — "Todas exigen sesión
 * Supabase válida"). Esta app tiene una única cuenta compartida por
 * dispositivo (contracts/screens.md § /login), así que no hay un "interno"
 * distinto de "usuario": la sesión ya autoriza el envío. Se documenta acá
 * porque el contrato menciona el secret explícitamente.
 *
 * Lee todas las suscripciones con la service role key: `push_subscriptions`
 * no otorga select al cliente autenticado (contracts/database.md), solo
 * insert/delete del propio endpoint.
 */
export const runtime = "nodejs";

type TipoNotificacion = "stock_bajo" | "gasto_nuevo";

type EnviarPushBody = {
  tipo?: TipoNotificacion;
  referencia_id?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una referencia de gasto más vieja que esto se rechaza (evita reusar ids). */
const GASTO_MAX_ANTIGUEDAD_MS = 2 * 60 * 1000;

/** Rate limit simple: máx `RATE_LIMIT_MAX` envíos por usuario por minuto. */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

// En memoria del proceso — se resetea en cada cold start de la función
// serverless. Suficiente para un equipo <15 personas: el objetivo es
// frenar un loop/abuso accidental, no una defensa distribuida robusta.
const enviosPorUsuario = new Map<string, number[]>();

function superaRateLimit(userId: string): boolean {
  const ahora = Date.now();
  const enviosRecientes = (enviosPorUsuario.get(userId) ?? []).filter(
    (marca) => ahora - marca < RATE_LIMIT_WINDOW_MS,
  );

  if (enviosRecientes.length >= RATE_LIMIT_MAX) {
    enviosPorUsuario.set(userId, enviosRecientes);
    return true;
  }

  enviosRecientes.push(ahora);
  enviosPorUsuario.set(userId, enviosRecientes);
  return false;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // Push es funcionalidad de admin (notificaciones de gastos/stock) —
  // lista BLANCA: antes bloqueaba solo a `revendedor` (lista negra), lo
  // que dejaba pasar a `coordinador` (0055_coordinador.sql) aunque no
  // tenga esa pantalla (auditoría de seguridad 2026-09-20, ver
  // `lib/rol-vendedor.ts` § `esAdminAutenticado`).
  if (!(await esAdminAutenticado(supabase, user.id))) {
    return NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 403 });
  }

  if (superaRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Demasiadas notificaciones. Esperá un minuto." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as EnviarPushBody | null;
  const tipo = body?.tipo;
  const referenciaId = body?.referencia_id;

  if (tipo !== "stock_bajo" && tipo !== "gasto_nuevo") {
    return NextResponse.json(
      { error: "Tipo de notificación inválido." },
      { status: 400 },
    );
  }

  if (!referenciaId || !UUID_REGEX.test(referenciaId)) {
    return NextResponse.json(
      { error: "referencia_id inválido o ausente." },
      { status: 400 },
    );
  }

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Nunca bloqueante: si falta config de servidor, no se envía nada pero
  // tampoco se rompe el flujo que dispara el push (alta de gasto/comprobante).
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject || !serviceRoleKey) {
    return NextResponse.json({ enviadas: 0, purgadas: 0 }, { status: 200 });
  }

  const { createClient: createServiceClient } = await import(
    "@supabase/supabase-js"
  );
  // `Database` (lib/types.ts) hoy solo describe `public` — el cast es solo
  // de tipos, ver el comentario equivalente en lib/supabase/server.ts.
  const serviceClient = createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { db: { schema: NEGOCIO.schema as "public" } },
  );

  let titulo: string;
  let detalle: string;

  if (tipo === "gasto_nuevo") {
    const { data: gasto, error: gastoError } = await serviceClient
      .from("gastos")
      .select("monto_centavos, categoria_id, created_at")
      .eq("id", referenciaId)
      .maybeSingle();

    if (gastoError || !gasto) {
      return NextResponse.json(
        { error: "El gasto referenciado no existe." },
        { status: 400 },
      );
    }

    const antiguedadMs = Date.now() - new Date(gasto.created_at).getTime();
    if (antiguedadMs < 0 || antiguedadMs > GASTO_MAX_ANTIGUEDAD_MS) {
      return NextResponse.json(
        { error: "La referencia del gasto ya no es válida." },
        { status: 400 },
      );
    }

    const { data: categoria } = await serviceClient
      .from("categorias_gasto")
      .select("nombre")
      .eq("id", gasto.categoria_id)
      .maybeSingle();

    titulo = "Nuevo gasto registrado";
    detalle = `${formatCentavos(gasto.monto_centavos)} · ${categoria?.nombre ?? "Sin categoría"}`;
  } else {
    const { data: producto, error: productoError } = await serviceClient
      .from("v_stock_actual")
      .select("nombre, stock")
      .eq("producto_id", referenciaId)
      .maybeSingle();

    if (productoError || !producto) {
      return NextResponse.json(
        { error: "El producto referenciado no existe." },
        { status: 400 },
      );
    }

    titulo = `Stock bajo: ${producto.nombre}`;
    detalle = `Quedan ${producto.stock} unidades`;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subscripciones, error: fetchError } = await serviceClient
    .from("push_subscriptions")
    .select("*");

  if (fetchError || !subscripciones) {
    return NextResponse.json({ enviadas: 0, purgadas: 0 }, { status: 200 });
  }

  const payload = JSON.stringify({
    tipo,
    titulo,
    detalle,
    icon: `${NEGOCIO.iconos}/icon-192.png`,
    badge: `${NEGOCIO.iconos}/icon-192.png`,
  });

  let enviadas = 0;
  const endpointsAPurgar: string[] = [];

  await Promise.all(
    subscripciones.map(async (sub) => {
      const keys = sub.keys as { p256dh?: string; auth?: string } | null;
      if (!keys?.p256dh || !keys?.auth) return;

      // SSRF (auditoría de seguridad 2026-09-20): `push_subscriptions.endpoint`
      // puede tener filas viejas guardadas antes de que `subscribe`
      // validara el host (ver `lib/push-endpoint.ts`) — se revalida acá
      // también, justo antes del POST server-side, y se purga como
      // cualquier otra suscripción inválida (mismo patrón que 404/410 de
      // abajo) en vez de solo saltearla.
      if (!esEndpointPushPermitido(sub.endpoint)) {
        endpointsAPurgar.push(sub.endpoint);
        return;
      }

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: keys.p256dh, auth: keys.auth },
          },
          payload,
        );
        enviadas += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          endpointsAPurgar.push(sub.endpoint);
        }
      }
    }),
  );

  if (endpointsAPurgar.length > 0) {
    await serviceClient
      .from("push_subscriptions")
      .delete()
      .in("endpoint", endpointsAPurgar);
  }

  return NextResponse.json(
    { enviadas, purgadas: endpointsAPurgar.length },
    { status: 200 },
  );
}
