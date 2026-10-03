import { timingSafeEqual } from "crypto";

/**
 * Chequeo de autorización para /api/cron/keepalive (ver
 * docs/ops/supabase-keepalive.md) — separado del route handler para poder
 * testearlo sin request/response reales de Next.
 *
 * Compara el header `authorization` contra `Bearer <secreto>` con
 * `timingSafeEqual` en vez de `===`/`includes`, para no filtrar el
 * secreto por timing. `timingSafeEqual` exige buffers de igual longitud
 * (si no, tira) — por eso el corte por longitud distinta va ANTES, y es
 * en sí mismo seguro: no depende del contenido del secreto, solo de su
 * longitud (pública, no algo a proteger).
 */
export function autorizarCron(
  authHeader: string | null | undefined,
  secretoEsperado: string | null | undefined,
): boolean {
  if (!secretoEsperado || !authHeader) return false;

  const esperado = Buffer.from(`Bearer ${secretoEsperado}`);
  const recibido = Buffer.from(authHeader);
  if (esperado.length !== recibido.length) return false;

  return timingSafeEqual(esperado, recibido);
}
