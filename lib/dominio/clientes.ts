/**
 * Funciones puras del dominio Clientes — sin I/O, ver
 * `lib/data/clientes.ts` para las lecturas. Usado por
 * `app/(app)/clientes/page.tsx` para armar las filas del listado.
 */

export type ClienteParaFila = {
  id: string;
  nombre: string;
  telefono: string | null;
};

export type ComprobanteParaStatsCliente = {
  cliente_id: string | null;
  monto_centavos: number;
  fecha: string;
};

export type DeudaParaCliente = {
  cliente_id: string | null;
  deuda_centavos: number | null;
};

export type ClienteConStats = {
  id: string;
  nombre: string;
  telefono: string | null;
  totalCentavos: number;
  ultimaCompra: string | null;
  deudaCentavos: number;
};

/**
 * Arma las filas de `/clientes`: total comprado histórico y fecha de
 * última compra (agregando `comprobantes` por `cliente_id`) + deuda
 * (`v_deuda_cliente`, sin N+1). Orden: deudores primero (deuda
 * descendente), después alfabético como desempate estable (US Ventas a
 * crédito, decisión 4 del spec).
 */
export function armarFilasClientes(
  clientes: ClienteParaFila[],
  comprobantes: ComprobanteParaStatsCliente[],
  deudas: DeudaParaCliente[],
): ClienteConStats[] {
  const stats = new Map<string, { total: number; ultima: string | null }>();
  for (const c of comprobantes) {
    if (!c.cliente_id) continue;
    const prev = stats.get(c.cliente_id) ?? { total: 0, ultima: null };
    prev.total += c.monto_centavos;
    if (!prev.ultima || c.fecha > prev.ultima) prev.ultima = c.fecha;
    stats.set(c.cliente_id, prev);
  }

  const deudaPorCliente = new Map<string, number>(
    deudas.map((d) => [d.cliente_id ?? "", d.deuda_centavos ?? 0]),
  );

  return clientes
    .map((cliente) => {
      const s = stats.get(cliente.id);
      return {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        totalCentavos: s?.total ?? 0,
        ultimaCompra: s?.ultima ?? null,
        deudaCentavos: deudaPorCliente.get(cliente.id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.deudaCentavos !== b.deudaCentavos) return b.deudaCentavos - a.deudaCentavos;
      return a.nombre.localeCompare(b.nombre);
    });
}
