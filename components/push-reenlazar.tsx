"use client";

import { useEffect } from "react";

import { reenlazarSuscripcionPush } from "@/lib/push-client";

/**
 * Vuelve a atar a la persona con la sesión abierta la suscripción de push
 * de este dispositivo (hallazgo F7, migración 0076) una vez al abrir el
 * shell de admin — que se monta en todas las pantallas de admin, no solo en
 * una. Solo el shell de admin (`app/(app)/layout.tsx`): las revendedoras no
 * reciben estos avisos. No renderiza nada.
 */
export function PushReenlazar() {
  useEffect(() => {
    void reenlazarSuscripcionPush();
  }, []);

  return null;
}
