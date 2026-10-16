import { NextResponse } from "next/server";

import { esEndpointPushPermitido } from "@/lib/push-endpoint";
import { esFuncionPushSinMigrar } from "@/lib/push-suscripciones";
import { esAdminAutenticado } from "@/lib/rol-vendedor";
import { createClient } from "@/lib/supabase/server";

/**
 * Registra (o reemplaza) una suscripción de Web Push del dispositivo actual
 * — ver contracts/api-routes.md § POST /api/push/subscribe.
 *
 * La suscripción queda atada a quien llama (`vendedor_id`, hallazgo F7,
 * migración 0076) por `guardar_suscripcion_push`: el dueño sale de la
 * sesión, nunca del body. `reenlazar: true` lo manda solo el reenlace
 * silencioso del shell de admin (`lib/push-client.ts`): vuelve a atar una
 * suscripción que ya existía.
 *
 * Código desplegado antes de la migración (la función no existe todavía):
 * se inserta como hasta ahora, sin dueño; y un reenlace no toca la tabla.
 */
export const runtime = "nodejs";

type PushSubscriptionPayload = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  reenlazar?: boolean;
};

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

  const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
  }

  // SSRF (auditoría de seguridad 2026-09-20): `endpoint` lo manda el
  // cliente y más tarde `/api/push/send` hace POST server-side a esa URL
  // (`webpush.sendNotification`) — sin esto, cualquier sesión admin podría
  // guardar una URL interna/arbitraria y usar el servidor como proxy.
  if (!esEndpointPushPermitido(endpoint)) {
    return NextResponse.json({ error: "Endpoint de push no permitido." }, { status: 400 });
  }

  const { error: rpcError } = await supabase.rpc("guardar_suscripcion_push", {
    p_endpoint: endpoint,
    p_keys: { p256dh, auth },
  });

  if (!rpcError) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  if (!esFuncionPushSinMigrar(rpcError)) {
    if (rpcError.message?.includes("NO_AUTORIZADO")) {
      return NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 403 });
    }
    if (rpcError.message?.includes("SUSCRIPCION_INVALIDA")) {
      return NextResponse.json({ error: "Suscripción inválida." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "No se pudo guardar la suscripción." },
      { status: 500 },
    );
  }

  // La migración 0076 todavía no se aplicó: no hay dueño que atar. El
  // reenlace silencioso no tiene nada que hacer (evita un 500 en cada
  // apertura de la app); el alta normal sigue como antes de 0076.
  if (body?.reenlazar === true) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { error: insertError } = await supabase
    .from("push_subscriptions")
    .insert({ endpoint, keys: { p256dh, auth } });

  if (insertError) {
    // "Upsert por endpoint" (contracts/database.md): `push_subscriptions`
    // solo otorga insert/delete al cliente autenticado, sin grant de
    // update — así que si el endpoint ya existe (claves rotadas) se
    // reemplaza borrando la fila anterior y reinsertando.
    if (insertError.code === "23505") {
      const { error: deleteError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);

      if (deleteError) {
        return NextResponse.json(
          { error: "No se pudo actualizar la suscripción." },
          { status: 500 },
        );
      }

      const { error: reinsertError } = await supabase
        .from("push_subscriptions")
        .insert({ endpoint, keys: { p256dh, auth } });

      if (reinsertError) {
        return NextResponse.json(
          { error: "No se pudo guardar la suscripción." },
          { status: 500 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "No se pudo guardar la suscripción." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
