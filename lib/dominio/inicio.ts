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

// ─── Hoy (rediseño 2026-10, fase 3) ─────────────────────────────────────────
// Las cifras de "Cómo estamos" salen de las MISMAS funciones que usan las
// pantallas de origen (/plata, /stock, /ganancia): si una cambia, cambia
// la otra.

/** Plata en manos de personas, tal cual la cuenta `/plata`: quien tiene algo
 * que contar (≠ 0, con id y nombre). `cantidad` son esas personas. */
export function resumirPlataEnManos(
  filas: { tenedor_id: string | null; nombre: string | null; total_centavos: number | null }[],
): { totalCentavos: number; cantidad: number } {
  const personas = filas.filter((f) => Boolean(f.tenedor_id && f.nombre) && (f.total_centavos ?? 0) !== 0);
  return {
    totalCentavos: personas.reduce((acc, f) => acc + (f.total_centavos ?? 0), 0),
    cantidad: personas.length,
  };
}

/** "Le deben a Ananja": revendedoras con saldo > 0 (`v_deuda_vendedor`) más
 * clientes (`v_deuda_cliente`). Misma cifra que el bloque de `/plata`. */
export function totalLeDeben(
  deudaVendedor: { vendedor_id: string | null; nombre: string | null; saldo_centavos: number | null }[],
  deudaCliente: { deuda_centavos: number | null }[],
): number {
  const revendedoras = deudaVendedor
    .filter((d) => Boolean(d.vendedor_id && d.nombre) && (d.saldo_centavos ?? 0) > 0)
    .reduce((acc, d) => acc + (d.saldo_centavos ?? 0), 0);
  return revendedoras + resumirClientes(deudaCliente).totalCentavos;
}

/** Botellas en el depósito: Σ `v_stock_actual.stock` (lo que muestra `/stock`). */
export function totalBotellasDeposito(filas: { stock: number | null }[]): number {
  return filas.reduce((acc, f) => acc + (f.stock ?? 0), 0);
}

/** Variación porcentual entera de `actual` contra `anterior`. `null` si el
 * anterior no es positivo (no hay contra qué comparar con sentido). */
export function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

/** Mes "yyyy-mm" de un año y mes 0-11. */
export function periodoDeMes(anio: number, mes: number): string {
  return periodo(anio, mes);
}

/** Mes "yyyy-mm" inmediatamente anterior a `anio`/`mes` (0-11). */
export function periodoMesAnterior(anio: number, mes: number): string {
  return mes === 0 ? periodo(anio - 1, 11) : periodo(anio, mes - 1);
}

// ─── Plata (rediseño 2026-10, fase 4) ───────────────────────────────────────

/** Lo que Ananja debe, para el encabezado de "Ananja debe" de `/plata`:
 * pedidos por pagar y deudas en pesos suman juntos; las deudas en dólares no
 * se pueden sumar a pesos, así que van aparte. */
export function totalAnanjaDebe(
  pedidos: { saldoCentavos: number }[],
  deudas: { moneda: "USD" | "ARS"; restanteCentavos: number }[],
): { pesosCentavos: number; usdCentavos: number } {
  let pesosCentavos = pedidos.reduce((acc, p) => acc + p.saldoCentavos, 0);
  let usdCentavos = 0;
  for (const d of deudas) {
    if (d.moneda === "USD") usdCentavos += d.restanteCentavos;
    else pesosCentavos += d.restanteCentavos;
  }
  return { pesosCentavos, usdCentavos };
}
