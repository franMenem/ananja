/**
 * Etiqueta de un cobro ("Cobro de <cliente>"), armada igual que
 * `describirTransferencia` (`lib/dominio/transferencias.ts`) — compartida
 * por el historial de Caja (general y por medio) para no duplicar el
 * formateo. Las escrituras (`registrarCobro`/`eliminarCobro`) viven en
 * `lib/cobros.ts`.
 */
export function describirCobro(cliente: string): string {
  return `Cobro de ${cliente}`;
}
