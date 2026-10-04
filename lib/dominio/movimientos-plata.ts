/**
 * Dónde cae cada movimiento de plata: en la Cuenta Ananja (Mercado Pago o
 * Banco) o en manos de una persona. Funciones puras, sin Supabase.
 *
 * Es el espejo de cómo cuentan las vistas de la base
 * (`supabase/migrations/0037_plata_en_manos.sql`):
 *  - `v_saldos_caja` (banco / mercado_pago) = `v_cuenta_ananja`.
 *  - `v_saldos_caja` (efectivo) = suma de `v_plata_en_manos` (más el saldo
 *    inicial de la caja efectivo, que no es de nadie).
 *
 * Las pantallas de Caja y de "en manos de" usan `montoEnCuenta` /
 * `montoEnManos` como filtro final de sus listas: así un movimiento aparece
 * en una lista si y solo si mueve el saldo que esa lista muestra (el caso
 * que confundía: un pago de revendedora "se la dio a su encargada, por
 * Mercado Pago" figuraba en Mercado Pago aunque el saldo lo contaba en
 * manos de la encargada).
 *
 * Reglas (una fila por tipo):
 *  - comprobante (`cobrado_centavos`), cobro: suman donde indica su medio —
 *    efectivo = en manos de quien la registró (`vendedor_id`).
 *  - gasto, pago de deuda (`monto_caja_centavos`): restan, mismo criterio.
 *  - ajuste de caja: con su signo, mismo criterio.
 *  - pago de revendedora (rendición): `via = 'encargado'` suma en manos del
 *    tenedor SIN IMPORTAR el medio (el medio solo dice cómo se la dio) —
 *    su `montoCentavos` YA es la parte Ananja (`v_rendiciones_ananja`,
 *    0058_plata_coordinador_costo.sql), no el rendido completo: un
 *    coordinador con margen propio tiene en mano MENOS plata de Ananja
 *    que lo que le rindió su revendedora, y esa diferencia no se cuenta
 *    acá. `directo_cuenta` / `cliente_directo` suman a la cuenta de su
 *    medio, con su monto completo (esos nunca tienen margen de por
 *    medio: van directo a la cuenta real).
 *  - transferencia entre cajas: resta en el origen y suma en el destino;
 *    el lado "efectivo" es la mano de quien la cargó.
 *  - depósito ("pasar a la cuenta"): resta en manos del tenedor y suma a la
 *    cuenta de su medio.
 */

import type { MedioPago } from "@/lib/dominio/caja";
import { etiquetaMedioPago } from "@/lib/etiquetas/medio-pago";
import { diasEntre, fechaArgentinaDeTimestamp } from "@/lib/fechas";
import { fechaPlataEnManoMasVieja } from "@/lib/dominio/tareas";

export type MedioCuenta = Exclude<MedioPago, "efectivo">;
export type ViaRendicion = "encargado" | "directo_cuenta" | "cliente_directo";

export type Lugar =
  | { lugar: "cuenta"; medio: MedioCuenta }
  | { lugar: "manos"; personaId: string | null };

export interface Impacto {
  destino: Lugar;
  /** Centavos con signo: + entra, − sale. */
  montoCentavos: number;
}

/** Los montos van tal cual están en la tabla (positivos salvo `ajuste`). */
export type MovimientoPlata =
  | { tipo: "comprobante"; medioPago: MedioPago; vendedorId: string | null; montoCentavos: number }
  | { tipo: "cobro"; medioPago: MedioPago; vendedorId: string | null; montoCentavos: number }
  | { tipo: "gasto"; medioPago: MedioPago; vendedorId: string | null; montoCentavos: number }
  | { tipo: "pago_deuda"; medioPago: MedioPago; vendedorId: string | null; montoCentavos: number }
  | { tipo: "ajuste"; medioPago: MedioPago; vendedorId: string | null; montoCentavos: number }
  | {
      tipo: "rendicion";
      via: ViaRendicion;
      medioPago: MedioPago;
      tenedorId: string | null;
      montoCentavos: number;
    }
  | {
      tipo: "transferencia";
      origen: MedioPago;
      destino: MedioPago;
      vendedorId: string | null;
      montoCentavos: number;
    }
  | { tipo: "deposito"; medioPago: MedioPago; tenedorId: string | null; montoCentavos: number };

function lugarDeMedio(medio: MedioPago, personaId: string | null): Lugar {
  return medio === "efectivo"
    ? { lugar: "manos", personaId }
    : { lugar: "cuenta", medio };
}

/** Todos los saldos que mueve un movimiento, con signo. */
export function impactosDe(m: MovimientoPlata): Impacto[] {
  switch (m.tipo) {
    case "comprobante":
    case "cobro":
    case "ajuste":
      return [{ destino: lugarDeMedio(m.medioPago, m.vendedorId), montoCentavos: m.montoCentavos }];
    case "gasto":
    case "pago_deuda":
      return [{ destino: lugarDeMedio(m.medioPago, m.vendedorId), montoCentavos: -m.montoCentavos }];
    case "rendicion":
      if (m.via === "encargado") {
        return [{ destino: { lugar: "manos", personaId: m.tenedorId }, montoCentavos: m.montoCentavos }];
      }
      // La base no permite directo a la cuenta en efectivo (MEDIO_INVALIDO);
      // si existiera, `v_saldos_caja` no la contaría en ningún lado.
      if (m.medioPago === "efectivo") return [];
      return [{ destino: { lugar: "cuenta", medio: m.medioPago }, montoCentavos: m.montoCentavos }];
    case "transferencia":
      return [
        { destino: lugarDeMedio(m.origen, m.vendedorId), montoCentavos: -m.montoCentavos },
        { destino: lugarDeMedio(m.destino, m.vendedorId), montoCentavos: m.montoCentavos },
      ];
    case "deposito":
      return [
        { destino: { lugar: "manos", personaId: m.tenedorId }, montoCentavos: -m.montoCentavos },
        ...(m.medioPago === "efectivo"
          ? []
          : [{ destino: { lugar: "cuenta", medio: m.medioPago } as Lugar, montoCentavos: m.montoCentavos }]),
      ];
  }
}

function sumar(impactos: Impacto[], coincide: (l: Lugar) => boolean): number | null {
  const propios = impactos.filter((i) => coincide(i.destino));
  if (propios.length === 0) return null;
  return propios.reduce((acc, i) => acc + i.montoCentavos, 0);
}

/** Cuánto mueve el saldo de Mercado Pago / Banco, o `null` si no lo toca
 * (entonces NO va en esa lista). */
export function montoEnCuenta(m: MovimientoPlata, medio: MedioCuenta): number | null {
  return sumar(impactosDe(m), (l) => l.lugar === "cuenta" && l.medio === medio);
}

/** Cuánto mueve la plata en manos de una persona, o `null` si no la toca. */
export function montoEnManos(m: MovimientoPlata, personaId: string): number | null {
  return sumar(impactosDe(m), (l) => l.lugar === "manos" && l.personaId === personaId);
}

/** `true` si el movimiento pasa plata de un lugar a otro (transferencia o
 * depósito): en una lista general se muestra como "⇄", sin signo. */
export function esMovimientoInterno(m: MovimientoPlata): boolean {
  return m.tipo === "transferencia" || m.tipo === "deposito";
}

export function textoLugar(l: Lugar, nombreDe: (id: string | null) => string): string {
  if (l.lugar === "cuenta") return etiquetaMedioPago(l.medio);
  return `En manos de ${nombreDe(l.personaId)}`;
}

/** "Dónde" en palabras, para la columna de la lista general de Caja. */
export function textoDonde(m: MovimientoPlata, nombreDe: (id: string | null) => string): string {
  const impactos = impactosDe(m);
  if (impactos.length === 0) return "—";
  if (impactos.length === 1) return textoLugar(impactos[0].destino, nombreDe);
  const origen = impactos.find((i) => i.montoCentavos < 0) ?? impactos[0];
  const destino = impactos.find((i) => i.montoCentavos > 0) ?? impactos[1];
  const corto = (l: Lugar) =>
    l.lugar === "cuenta" ? textoLugar(l, nombreDe) : nombreDe(l.personaId);
  return `${corto(origen.destino)} → ${corto(destino.destino)}`;
}

/** Título de un pago de revendedora, dicho según dónde quedó la plata. */
export function describirRendicion(args: {
  via: ViaRendicion;
  medioPago: MedioPago;
  revendedora: string;
  tenedor: string;
}): string {
  const { via, medioPago, revendedora, tenedor } = args;
  if (via === "encargado") {
    return `Pago de ${revendedora} recibido por ${tenedor} · por ${etiquetaMedioPago(medioPago)}`;
  }
  if (via === "cliente_directo") {
    return `Un cliente de ${revendedora} pagó directo a la cuenta`;
  }
  return `Pago de ${revendedora} directo a la cuenta`;
}

export function describirDeposito(tenedor: string): string {
  return `${tenedor} pasó a la cuenta`;
}

/**
 * Ingresos a la mano de una persona, para calcular desde cuándo tiene la
 * plata (`fechaPlataEnManoMasVieja` de `lib/tareas.ts`). Mismo criterio que
 * Tareas: ventas y cobros en efectivo, pagos de revendedoras recibidos y
 * transferencias hacia efectivo (los ajustes no cuentan), fechados por el
 * día en que se registraron (`fechaDe(createdAt)`).
 */
export function ingresosEnManos(
  filas: { mov: MovimientoPlata; createdAt: string }[],
  personaId: string,
  fechaDe: (createdAt: string) => string,
): { fecha: string; montoCentavos: number }[] {
  return filas.flatMap((f) => {
    if (f.mov.tipo === "ajuste") return [];
    const monto = montoEnManos(f.mov, personaId);
    return monto !== null && monto > 0 ? [{ fecha: fechaDe(f.createdAt), montoCentavos: monto }] : [];
  });
}

/**
 * "Hace cuántos días" tiene cada persona su plata en mano (bloque "En
 * manos de" de `/plata`): solo para quien tiene saldo positivo — un
 * negativo es un dato roto, no una antigüedad real (ver
 * `app/(app)/plata/page.tsx`). Envuelve `ingresosEnManos` +
 * `fechaPlataEnManoMasVieja` (`lib/tareas.ts`) + `diasEntre`
 * (`lib/fechas.ts`), ya usados igual en Tareas — pura, sin Supabase: la
 * page ya trajo `filasEnManos` (`cargarMovimientosPlata`).
 */
export function diasEnManoPorPersona(
  personas: { tenedor_id: string; total_centavos: number }[],
  filasEnManos: { mov: MovimientoPlata; createdAt: string }[],
  hoy: string,
): Map<string, number | null> {
  const conPlata = personas.filter((p) => p.total_centavos > 0);
  return new Map(
    conPlata.map((p) => {
      const desde = fechaPlataEnManoMasVieja(
        ingresosEnManos(filasEnManos, p.tenedor_id, fechaArgentinaDeTimestamp),
        p.total_centavos,
      );
      return [p.tenedor_id, desde ? diasEntre(desde, hoy) : null] as const;
    }),
  );
}

/** Un movimiento listo para mostrar en una lista de Caja o de "en manos de".
 * Extraído de `cargarMovimientosPlata` (`lib/data/plata.ts`) — es la forma
 * de salida de esa lectura, pero la arman `itemsGenerales`/las páginas sin
 * tocar Supabase, así que el tipo vive acá (dominio) y la lectura lo
 * importa, no al revés. */
export interface FilaMovimiento {
  key: string;
  id: string;
  fecha: string;
  createdAt: string;
  mov: MovimientoPlata;
  titulo: string;
  detalle: string | null;
  /** Dónde cae: "Mercado Pago", "En manos de Laura", "Laura → Banco". */
  donde: string;
  href: string | null;
  /** Solo ajustes: datos para editar/borrar (`AjusteCajaAcciones`). */
  ajuste: { medioPago: MedioPago; nota: string; montoCentavos: number } | null;
  /** Solo depósitos: datos para eliminar (`EliminarDepositoAccion`; el id es `id`). */
  deposito: { medioPago: MedioPago; montoCentavos: number; tenedor: string } | null;
}

/** Cuántas filas más trae cada "Ver más" de la lista general de `/plata`. */
export const PASO_MOVIMIENTOS = 20;

/**
 * Arma los ítems de la lista GENERAL de movimientos (`/plata`, "Últimos
 * movimientos"): monto en valor absoluto salvo que sea un movimiento
 * interno (transferencia/depósito, que se muestra neutro con "⇄"), y
 * siempre mostrando dónde cae. Compartido entre la carga inicial
 * (`app/(app)/plata/page.tsx`) y el "Ver más" client-side
 * (`components/plata/movimientos-paginados.tsx`) para no duplicar la
 * regla en dos lugares.
 */
export function itemsGenerales(
  filas: FilaMovimiento[],
): { fila: FilaMovimiento; montoCentavos: number; neutro: boolean; mostrarDonde: boolean }[] {
  return filas.map((fila) => ({
    fila,
    montoCentavos: esMovimientoInterno(fila.mov)
      ? Math.abs(impactosDe(fila.mov)[0]?.montoCentavos ?? 0)
      : (impactosDe(fila.mov)[0]?.montoCentavos ?? 0),
    neutro: esMovimientoInterno(fila.mov),
    mostrarDonde: true,
  }));
}
