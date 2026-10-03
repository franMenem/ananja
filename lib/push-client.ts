/**
 * Disparo de Web Push desde el cliente (US5). Se invoca después de un
 * alta exitosa (gasto o comprobante con alertas de stock) — ver
 * contracts/database.md § crear_gasto / crear_comprobante.
 *
 * Hardening (security-audit-2026-09-02.md hallazgo #3): el cliente nunca
 * manda título/detalle en texto libre — solo el tipo y el id del registro
 * real (`gasto_id` o `producto_id`) que originó la alerta. El servidor
 * arma el mensaje consultando la base con service role.
 *
 * Regla de oro: NUNCA rompe el flujo principal. Cualquier error de red o
 * de servidor se ignora en silencio; el registro ya se guardó igual.
 */
export type TipoNotificacionPush = "stock_bajo" | "gasto_nuevo";

export async function notificarPush(
  tipo: TipoNotificacionPush,
  referenciaId: string,
): Promise<void> {
  try {
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, referencia_id: referenciaId }),
    });
  } catch {
    // Falla de red u otro error: se ignora, el push es best-effort.
  }
}
