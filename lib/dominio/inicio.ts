/**
 * Cálculos puros de Inicio (pantalla principal del admin, rediseño de 4
 * bloques 2026-09-16 — ver `lib/inicio-datos.ts`). Sin Supabase:
 * `lib/inicio-datos.ts` trae las filas y las pasa acá. `resumirClientes`
 * también lo usa `/plata` (deuda de clientes). Mismos números que Plata
 * (`v_cuenta_ananja`, `v_plata_en_manos`) y que Ganancia
 * (`v_margen_ventas`).
 */

export interface PersonaEnManos {
  tenedorId: string;
  nombre: string;
  totalCentavos: number;
  soyYo: boolean;
}

/** "En manos de": solo quien tiene plata (> 0), yo primero y el resto por
 * nombre. Un total negativo (dato roto, ver `/plata`) no se muestra acá. */
export function personasEnManos(
  filas: { tenedor_id: string | null; nombre: string | null; total_centavos: number | null }[],
  miVendedorId: string | null,
): PersonaEnManos[] {
  return filas
    .filter((f) => f.tenedor_id && f.nombre && (f.total_centavos ?? 0) > 0)
    .map((f) => ({
      tenedorId: f.tenedor_id as string,
      nombre: f.nombre as string,
      totalCentavos: f.total_centavos ?? 0,
      soyYo: f.tenedor_id === miVendedorId,
    }))
    .sort((a, b) => Number(b.soyYo) - Number(a.soyYo) || a.nombre.localeCompare(b.nombre));
}

export function resumirClientes(filas: { deuda_centavos: number | null }[]): {
  cantidad: number;
  totalCentavos: number;
} {
  const deudores = filas.filter((f) => (f.deuda_centavos ?? 0) > 0);
  return {
    cantidad: deudores.length,
    totalCentavos: deudores.reduce((acc, f) => acc + (f.deuda_centavos ?? 0), 0),
  };
}

export interface FilaMargenInicio {
  fecha: string;
  ingresoAnanjaCentavos: number | null;
  gananciaEmpresaCentavos: number | null;
  gananciaVendedoresCentavos: number | null;
}

export interface TotalesMes {
  ingresoAnanjaCentavos: number;
  gananciaEmpresaCentavos: number;
  gananciaVendedoresCentavos: number;
}

export interface ResumenVentasMes {
  actual: TotalesMes;
  anterior: TotalesMes;
  /** Variación del ingreso de Ananja vs. el mes anterior, en % entero.
   * `null` si el mes anterior fue 0 (no hay contra qué comparar). */
  variacionIngresoPct: number | null;
}

/** Mes "yyyy-mm" de un año y mes 0-11. */
function periodo(anio: number, mes: number): string {
  return `${anio}-${String(mes + 1).padStart(2, "0")}`;
}

/**
 * Ingreso de Ananja, ganancia de la empresa y de los vendedores del mes
 * (`mes` 0-11) contra el mes anterior, desde `v_margen_ventas`. Las filas sin
 * costo/precio (null) suman 0 — mismo criterio que `/ganancia`.
 */
export function resumirVentasMes(filas: FilaMargenInicio[], anio: number, mes: number): ResumenVentasMes {
  const actualPeriodo = periodo(anio, mes);
  const anteriorPeriodo = mes === 0 ? periodo(anio - 1, 11) : periodo(anio, mes - 1);
  const vacio = (): TotalesMes => ({
    ingresoAnanjaCentavos: 0,
    gananciaEmpresaCentavos: 0,
    gananciaVendedoresCentavos: 0,
  });
  const actual = vacio();
  const anterior = vacio();
  for (const fila of filas) {
    const p = fila.fecha.slice(0, 7);
    const destino = p === actualPeriodo ? actual : p === anteriorPeriodo ? anterior : null;
    if (!destino) continue;
    destino.ingresoAnanjaCentavos += fila.ingresoAnanjaCentavos ?? 0;
    destino.gananciaEmpresaCentavos += fila.gananciaEmpresaCentavos ?? 0;
    destino.gananciaVendedoresCentavos += fila.gananciaVendedoresCentavos ?? 0;
  }
  const variacionIngresoPct =
    anterior.ingresoAnanjaCentavos === 0
      ? null
      : Math.round(
          ((actual.ingresoAnanjaCentavos - anterior.ingresoAnanjaCentavos) /
            anterior.ingresoAnanjaCentavos) *
            100,
        );
  return { actual, anterior, variacionIngresoPct };
}

export function saludoSegunHora(hora: number): string {
  if (hora < 12) return "Buen día";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** Primer día del mes inmediatamente anterior a `anio`-`mes` (mes 0-11) —
 * lo único que necesita `resumirVentasMes` para comparar el mes actual
 * contra el anterior. Diciembre del año previo si `mes` es enero. Exportada
 * para poder testearla sin pasar por Supabase. */
export function inicioMesAnterior(anio: number, mes: number): string {
  return mes === 0 ? `${anio - 1}-12-01` : `${anio}-${String(mes).padStart(2, "0")}-01`;
}
