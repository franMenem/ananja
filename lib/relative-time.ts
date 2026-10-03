/**
 * Formateo de fechas relativas en español (Argentina), sin dependencias
 * externas. Usado en el feed de notificaciones (US5).
 */
export function formatRelativoEs(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  const diffMs = ahora.getTime() - fecha.getTime();
  const diffSeg = Math.floor(diffMs / 1000);

  if (diffSeg < 60) return "recién";

  const diffMin = Math.floor(diffSeg / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `hace ${diffHoras} h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias === 1) return "ayer";
  if (diffDias < 7) return `hace ${diffDias} días`;

  const diffSemanas = Math.floor(diffDias / 7);
  if (diffSemanas < 5) {
    return `hace ${diffSemanas} semana${diffSemanas > 1 ? "s" : ""}`;
  }

  const diffMeses = Math.floor(diffDias / 30);
  if (diffMeses < 12) {
    return `hace ${diffMeses} mes${diffMeses > 1 ? "es" : ""}`;
  }

  const diffAnios = Math.floor(diffDias / 365);
  return `hace ${diffAnios} año${diffAnios > 1 ? "s" : ""}`;
}
