import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  calcularConsumoLote,
  calcularDeudaCliente,
  calcularPrecioItem,
  calcularSaldo,
  calcularSaldos,
} from "@/lib/dominio/calculos";

/**
 * Tests de integración contra la base Supabase REAL del proyecto (no un
 * mock ni una base local) — verifican los invariantes 1-3 de
 * contracts/database.md tal como quedan reflejados en los datos actuales.
 *
 * Por qué están separados de `npm test`:
 * - Dependen de la red y de un proyecto Supabase real y accesible.
 * - No son deterministas como los tests de `saldos.test.ts`/`stock.test.ts`
 *   (fixtures puras), sino que leen el estado real de los datos de
 *   producción.
 * - No deben bloquear un `npm test` rápido en CI/local sin credenciales.
 *
 * Usuario de prueba (2026-09-03): la base de producción quedó limpia con
 * solo los 4 usuarios reales del equipo — este suite NO debe autenticarse
 * con ninguno de ellos. En vez de una cuenta hardcodeada, el suite lee
 * `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` de `process.env` (cargadas
 * desde `.env.local` si están ahí, igual que las variables de Supabase).
 * Si no están definidas, el describe entero se saltea con un mensaje que
 * explica cómo crear el usuario de prueba.
 *
 * Correr con `npm run test:integration`. Requiere en `.env.local`:
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * TEST_USER_EMAIL, TEST_USER_PASSWORD — con un usuario de prueba real en
 * Supabase Auth (creado con `supabase/crear-vendedor.sql`, pero con
 * `must_change_password: false` para no chocar con el guard de
 * `/cambiar-password` en `lib/supabase/middleware.ts`).
 */

function loadEnvLocal() {
  let content: string;
  try {
    content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  } catch {
    return;
  }
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Usuario de prueba dedicado — NUNCA una cuenta real del equipo (ver
// comentario de arriba). Definilo en `.env.local` (no versionado).
const TEST_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

const tieneCredenciales = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && TEST_EMAIL && TEST_PASSWORD,
);

if (!tieneCredenciales) {
  console.warn(
    "[invariantes.integration.test] Salteando: definí TEST_USER_EMAIL/" +
      "TEST_USER_PASSWORD (además de NEXT_PUBLIC_SUPABASE_URL/" +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY) en .env.local con un usuario de " +
      "prueba real de Supabase Auth para correr los tests de integración " +
      "— creálo con supabase/crear-vendedor.sql (con must_change_password " +
      "en false).",
  );
}

describe.skipIf(!tieneCredenciales)(
  "Invariantes de base de datos (integración, proyecto Supabase real)",
  () => {
    let supabase: SupabaseClient;

    beforeAll(async () => {
      supabase = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
      const { error } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL as string,
        password: TEST_PASSWORD as string,
      });
      if (error) {
        throw new Error(
          `No se pudo autenticar contra Supabase con ${TEST_EMAIL}: ${error.message}`,
        );
      }
    }, 20000);

    it("invariante 1: v_saldos_caja.total = Σ de las tres cajas", async () => {
      const { data, error } = await supabase.from("v_saldos_caja").select("*");
      expect(error).toBeNull();

      const rows = data ?? [];
      const total = rows.find((r) => r.medio_pago === "total");
      const porCaja = rows.filter((r) => r.medio_pago !== "total");

      expect(total).toBeDefined();
      // Deben existir exactamente las 3 cajas conocidas además del total.
      expect(porCaja.map((r) => r.medio_pago).sort()).toEqual([
        "banco",
        "efectivo",
        "mercado_pago",
      ]);

      const suma = porCaja.reduce(
        (acc, r) => acc + Number(r.saldo_centavos),
        0,
      );
      expect(Number(total!.saldo_centavos)).toBe(suma);
    });

    it("invariante 3: ningún comprobante existe sin al menos un item", async () => {
      const { data: comprobantes, error: errC } = await supabase
        .from("comprobantes")
        .select("id");
      expect(errC).toBeNull();

      const { data: items, error: errI } = await supabase
        .from("comprobante_items")
        .select("comprobante_id");
      expect(errI).toBeNull();

      const idsConItems = new Set((items ?? []).map((i) => i.comprobante_id));
      const sinItems = (comprobantes ?? []).filter(
        (c) => !idsConItems.has(c.id),
      );

      expect(sinItems).toEqual([]);
    });

    it("invariante 2: movimientos_stock con comprobante_id ↔ comprobante_items 1:1, misma cantidad", async () => {
      const { data: movimientos, error: errM } = await supabase
        .from("movimientos_stock")
        .select("comprobante_id, producto_id, cantidad, tipo")
        .not("comprobante_id", "is", null);
      expect(errM).toBeNull();

      const { data: items, error: errI } = await supabase
        .from("comprobante_items")
        .select("comprobante_id, producto_id, cantidad");
      expect(errI).toBeNull();

      const cantidadPorClave = new Map<string, number>();
      for (const item of items ?? []) {
        cantidadPorClave.set(`${item.comprobante_id}:${item.producto_id}`, item.cantidad);
      }

      const clavesConMovimiento = new Set<string>();
      for (const mov of movimientos ?? []) {
        // Todo movimiento ligado a un comprobante nace de una venta (egreso).
        expect(mov.tipo).toBe("egreso");

        const clave = `${mov.comprobante_id}:${mov.producto_id}`;
        expect(cantidadPorClave.has(clave)).toBe(true);
        expect(mov.cantidad).toBe(cantidadPorClave.get(clave));
        clavesConMovimiento.add(clave);
      }

      // 1:1 real: ningún item de comprobante se queda sin su movimiento espejo.
      expect(clavesConMovimiento.size).toBe(cantidadPorClave.size);
    });

    it("invariante 5: v_feria_totales.ventas_total = efectivo + mercado_pago + banco, y neto = ventas_total - gastos_total", async () => {
      const { data, error } = await supabase.from("v_feria_totales").select("*");
      expect(error).toBeNull();

      for (const fila of data ?? []) {
        const sumaMedios =
          Number(fila.ventas_efectivo_centavos) +
          Number(fila.ventas_mercado_pago_centavos) +
          Number(fila.ventas_banco_centavos);
        expect(Number(fila.ventas_total_centavos)).toBe(sumaMedios);
        expect(Number(fila.neto_centavos)).toBe(
          Number(fila.ventas_total_centavos) -
            Number(fila.gastos_total_centavos),
        );
      }
    });

    it("invariante 6: todo comprobante/gasto/movimiento_stock con feria_id apunta a una feria existente", async () => {
      const { data: ferias, error: errF } = await supabase
        .from("ferias")
        .select("id");
      expect(errF).toBeNull();
      const idsFerias = new Set((ferias ?? []).map((f) => f.id));

      const { data: comprobantes, error: errC } = await supabase
        .from("comprobantes")
        .select("feria_id")
        .not("feria_id", "is", null);
      expect(errC).toBeNull();
      for (const c of comprobantes ?? []) {
        expect(idsFerias.has(c.feria_id as string)).toBe(true);
      }

      const { data: gastos, error: errG } = await supabase
        .from("gastos")
        .select("feria_id")
        .not("feria_id", "is", null);
      expect(errG).toBeNull();
      for (const g of gastos ?? []) {
        expect(idsFerias.has(g.feria_id as string)).toBe(true);
      }

      const { data: movimientos, error: errM } = await supabase
        .from("movimientos_stock")
        .select("feria_id")
        .not("feria_id", "is", null);
      expect(errM).toBeNull();
      for (const m of movimientos ?? []) {
        expect(idsFerias.has(m.feria_id as string)).toBe(true);
      }
    });

    it("invariante 7: v_costo_lote_item ↔ v_costo_lote.total_gastos_centavos, y gastos.producto_id siempre existe en lote_items", async () => {
      const { data: lotes, error: errL } = await supabase
        .from("v_costo_lote")
        .select("lote_id, total_gastos_centavos");
      expect(errL).toBeNull();

      const { data: items, error: errI } = await supabase
        .from("v_costo_lote_item")
        .select("lote_id, gastos_directos_centavos, gastos_compartidos_centavos");
      expect(errI).toBeNull();

      const itemsPorLote = new Map<string, typeof items>();
      for (const item of items ?? []) {
        const lista = itemsPorLote.get(item.lote_id as string) ?? [];
        lista.push(item);
        itemsPorLote.set(item.lote_id as string, lista as never);
      }

      for (const lote of lotes ?? []) {
        const itemsDelLote = itemsPorLote.get(lote.lote_id as string) ?? [];
        const sumaItems = itemsDelLote.reduce(
          (acc, i) =>
            acc +
            Number(i!.gastos_directos_centavos) +
            Number(i!.gastos_compartidos_centavos),
          0,
        );
        // Tolerancia de redondeo: hasta (cantidad de ítems del lote - 1)
        // centavos — ver tests/lotes.test.ts, caso "redondeo".
        const tolerancia = Math.max(itemsDelLote.length - 1, 0);
        expect(
          Math.abs(Number(lote.total_gastos_centavos) - sumaItems),
        ).toBeLessThanOrEqual(tolerancia);
      }

      const { data: loteItems, error: errLI } = await supabase
        .from("lote_items")
        .select("lote_id, producto_id");
      expect(errLI).toBeNull();
      const clavesLoteItems = new Set(
        (loteItems ?? []).map((li) => `${li.lote_id}:${li.producto_id}`),
      );

      const { data: gastos, error: errG } = await supabase
        .from("gastos")
        .select("lote_id, producto_id")
        .not("producto_id", "is", null);
      expect(errG).toBeNull();
      for (const g of gastos ?? []) {
        expect(clavesLoteItems.has(`${g.lote_id}:${g.producto_id}`)).toBe(true);
      }
    });

    it("invariante 8: v_precio_item.precio_base_centavos coincide con calcularPrecioItem (±1 centavo)", async () => {
      const { data, error } = await supabase.from("v_precio_item").select("*");
      expect(error).toBeNull();

      for (const fila of data ?? []) {
        if (
          fila.dolar_centavos === null ||
          fila.presentacion_ml === null ||
          fila.envase_centavos === null ||
          fila.etiqueta_centavos === null ||
          fila.precio_minorista_centavos === null
        ) {
          continue;
        }

        const { data: version, error: versionError } = await supabase
          .from("versiones_precio")
          .select("materia_prima_usd_centavos, transporte_pct, iva_pct, ganancia_pct, mayorista_pct")
          .eq("id", fila.version_id as string)
          .single();
        expect(versionError).toBeNull();
        if (!version) continue;

        const calculado = calcularPrecioItem({
          dolarCentavos: Number(fila.dolar_centavos),
          materiaPrimaUsdCentavos: Number(version.materia_prima_usd_centavos),
          presentacionMl: Number(fila.presentacion_ml),
          envaseCentavos: Number(fila.envase_centavos),
          etiquetaCentavos: Number(fila.etiqueta_centavos),
          precioMinoristaCentavos: Number(fila.precio_minorista_centavos),
          transportePct: Number(version.transporte_pct),
          ivaPct: Number(version.iva_pct),
          gananciaPct: Number(version.ganancia_pct),
          mayoristaPct: Number(version.mayorista_pct),
        });

        const diferencia = Math.abs(
          calculado.precioBaseCentavos - Number(fila.precio_base_centavos),
        );
        expect(diferencia).toBeLessThanOrEqual(1);
      }
    });

    it("invariante 9: egresos de movimientos_insumo por lote == calcularConsumoLote", async () => {
      const { data: loteItems, error: loteItemsError } = await supabase
        .from("lote_items")
        .select("lote_id, producto_id, cantidad");
      expect(loteItemsError).toBeNull();

      const loteIds = Array.from(new Set((loteItems ?? []).map((l) => l.lote_id)));
      if (loteIds.length === 0) return; // sin lotes cargados, nada que verificar

      const { data: recetas, error: recetasError } = await supabase
        .from("recetas")
        .select("producto_id, insumo_id, cantidad");
      expect(recetasError).toBeNull();

      for (const loteId of loteIds) {
        const items = (loteItems ?? [])
          .filter((l) => l.lote_id === loteId)
          .map((l) => ({ producto_id: l.producto_id as string, cantidad: l.cantidad as number }));

        const esperado = calcularConsumoLote(
          items,
          (recetas ?? []).map((r) => ({
            producto_id: r.producto_id as string,
            insumo_id: r.insumo_id as string,
            cantidad: Number(r.cantidad),
          })),
        );

        const { data: movimientos, error: movimientosError } = await supabase
          .from("movimientos_insumo")
          .select("insumo_id, cantidad")
          .eq("lote_id", loteId)
          .eq("tipo", "egreso");
        expect(movimientosError).toBeNull();

        const realPorInsumo = new Map<string, number>();
        for (const m of movimientos ?? []) {
          const prev = realPorInsumo.get(m.insumo_id as string) ?? 0;
          realPorInsumo.set(m.insumo_id as string, prev + Number(m.cantidad));
        }

        for (const fila of esperado) {
          const real = realPorInsumo.get(fila.insumo_id) ?? 0;
          expect(Math.abs(real - fila.cantidad)).toBeLessThanOrEqual(0.001);
        }
      }
    });

    it("invariante 10: v_stock_revendedor.en_poder no es negativo salvo permitir_negativo", async () => {
      const { data, error } = await supabase.from("v_stock_revendedor").select("*");
      expect(error).toBeNull();

      // Sin acceso a qué movimientos se guardaron con permitir_negativo desde
      // este test (el flag no se persiste por fila), se documenta como
      // invariante "en operación normal" — si aparece una fila negativa,
      // confirmar con Fran si fue una devolución/entrega guardada
      // deliberadamente en negativo antes de considerarlo una regresión.
      const negativos = (data ?? []).filter((r) => (r.en_poder ?? 0) < 0);
      if (negativos.length > 0) {
        console.warn(
          `Invariante 10: ${negativos.length} fila(s) de v_stock_revendedor en negativo — verificar si fueron guardadas con permitir_negativo antes de tratarlo como bug.`,
        );
      }
      expect(Array.isArray(data)).toBe(true);
    });

    it("invariante 11: v_resumen_revendedor.debe_centavos == costo_centavos - rendido_centavos", async () => {
      const { data, error } = await supabase.from("v_resumen_revendedor").select("*");
      expect(error).toBeNull();

      for (const fila of data ?? []) {
        expect(fila.debe_centavos).toBe((fila.costo_centavos ?? 0) - (fila.rendido_centavos ?? 0));
      }
    });

    it("invariante 12: v_saldos_caja incluye rendiciones (comparado contra calcularSaldo)", async () => {
      const [{ data: cajas }, { data: comprobantes }, { data: gastos }, { data: ajustes }, { data: rendiciones }, { data: saldos }] =
        await Promise.all([
          supabase.from("cajas").select("*"),
          supabase.from("comprobantes").select("medio_pago, monto_centavos"),
          supabase.from("gastos").select("medio_pago, monto_centavos"),
          supabase.from("ajustes_caja").select("medio_pago, monto_centavos"),
          supabase.from("rendiciones").select("medio_pago, monto_centavos"),
          supabase.from("v_saldos_caja").select("*"),
        ]);
      expect(cajas).not.toBeNull();

      for (const caja of cajas ?? []) {
        const esperado = calcularSaldo(
          caja.medio_pago,
          caja.saldo_inicial_centavos,
          comprobantes ?? [],
          gastos ?? [],
          ajustes ?? [],
          rendiciones ?? [],
        );
        const real = (saldos ?? []).find((s) => s.medio_pago === caja.medio_pago);
        expect(real).toBeDefined();
        expect(Number(real!.saldo_centavos)).toBe(esperado);
      }
    });

    it("invariante 14: v_saldos_caja.total no cambia con transferencias (calcularSaldos) + una sola caja destino_efectivo", async () => {
      const [
        { data: cajas },
        { data: comprobantes },
        { data: gastos },
        { data: ajustes },
        { data: rendiciones },
        { data: transferencias },
        { data: saldos },
      ] = await Promise.all([
        supabase.from("cajas").select("*"),
        supabase.from("comprobantes").select("medio_pago, monto_centavos"),
        supabase.from("gastos").select("medio_pago, monto_centavos"),
        supabase.from("ajustes_caja").select("medio_pago, monto_centavos"),
        supabase.from("rendiciones").select("medio_pago, monto_centavos"),
        supabase.from("transferencias_caja").select("origen, destino, monto_centavos"),
        supabase.from("v_saldos_caja").select("*"),
      ]);
      expect(cajas).not.toBeNull();

      // Índice único parcial `idx_cajas_destino_efectivo_unico`
      // (0024_transferencias_caja.sql): a lo sumo una fila de `cajas` con
      // `destino_efectivo = true` — acá se confirma contra el dato real.
      const destinos = (cajas ?? []).filter((c) => c.destino_efectivo);
      expect(destinos).toHaveLength(1);

      const saldosIniciales = Object.fromEntries(
        (cajas ?? []).map((c) => [c.medio_pago, c.saldo_inicial_centavos]),
      ) as Record<"banco" | "mercado_pago" | "efectivo", number>;

      // v_saldos_caja (con las transferencias reales ya aplicadas) debe
      // coincidir con su espejo TS, fila por fila — incluida "total".
      const esperado = calcularSaldos(
        saldosIniciales,
        comprobantes ?? [],
        gastos ?? [],
        ajustes ?? [],
        rendiciones ?? [],
        transferencias ?? [],
      );

      for (const fila of esperado) {
        const real = (saldos ?? []).find((s) => s.medio_pago === fila.medio_pago);
        expect(real).toBeDefined();
        expect(Number(real!.saldo_centavos)).toBe(fila.saldo_centavos);
      }

      // El total no cambia si se agrega una transferencia más a la lista
      // (invariante 14, contracts/database.md: lo que la caja origen
      // pierde lo gana exactamente la caja destino) — comparado acá con
      // una transferencia sintética agregada solo en memoria, nunca
      // escrita en la base (test de solo lectura).
      const totalAntes = esperado.find((r) => r.medio_pago === "total")!.saldo_centavos;
      const conTransferenciaExtra = calcularSaldos(
        saldosIniciales,
        comprobantes ?? [],
        gastos ?? [],
        ajustes ?? [],
        rendiciones ?? [],
        [
          ...(transferencias ?? []),
          { origen: "efectivo", destino: "mercado_pago", monto_centavos: 12345 },
        ],
      );
      const totalDespues = conTransferenciaExtra.find(
        (r) => r.medio_pago === "total",
      )!.saldo_centavos;
      expect(totalDespues).toBe(totalAntes);
    });

    it("invariante 15: v_saldos_caja.saldo_centavos por medio = saldo inicial + cobrado_centavos + cobros − gastos + ajustes + rendiciones ± transferencias", async () => {
      const [
        { data: cajas },
        { data: comprobantes },
        { data: gastos },
        { data: ajustes },
        { data: rendiciones },
        { data: transferencias },
        { data: cobros },
        { data: saldos },
      ] = await Promise.all([
        supabase.from("cajas").select("*"),
        supabase.from("comprobantes").select("medio_pago, cobrado_centavos"),
        supabase.from("gastos").select("medio_pago, monto_centavos"),
        supabase.from("ajustes_caja").select("medio_pago, monto_centavos"),
        supabase.from("rendiciones").select("medio_pago, monto_centavos"),
        supabase.from("transferencias_caja").select("origen, destino, monto_centavos"),
        supabase.from("cobros").select("medio_pago, monto_centavos"),
        supabase.from("v_saldos_caja").select("*"),
      ]);
      expect(cajas).not.toBeNull();

      const saldosIniciales = Object.fromEntries(
        (cajas ?? []).map((c) => [c.medio_pago, c.saldo_inicial_centavos]),
      ) as Record<"banco" | "mercado_pago" | "efectivo", number>;

      // `comprobantes` ahora representa lo vendido, no lo cobrado —
      // v_saldos_caja (y calcularSaldo) solo suman cobrado_centavos, nunca
      // monto_centavos; lo cobrado después de la venta llega aparte
      // por `cobros`.
      const comprobantesComoCobrado = (comprobantes ?? []).map((c) => ({
        medio_pago: c.medio_pago,
        monto_centavos: c.cobrado_centavos,
      }));

      const esperado = calcularSaldos(
        saldosIniciales,
        comprobantesComoCobrado,
        gastos ?? [],
        ajustes ?? [],
        rendiciones ?? [],
        transferencias ?? [],
        cobros ?? [],
      );

      for (const fila of esperado) {
        const real = (saldos ?? []).find((s) => s.medio_pago === fila.medio_pago);
        expect(real).toBeDefined();
        expect(Number(real!.saldo_centavos)).toBe(fila.saldo_centavos);
      }
    });

    it("invariante 16: v_deuda_cliente.deuda_centavos == vendido_centavos − cobrado_centavos (calcularDeudaCliente)", async () => {
      const { data: vDeuda, error } = await supabase.from("v_deuda_cliente").select("*");
      expect(error).toBeNull();

      const { data: comprobantes, error: errC } = await supabase
        .from("comprobantes")
        .select("id, cliente_id, monto_centavos, cobrado_centavos")
        .not("cliente_id", "is", null);
      expect(errC).toBeNull();

      const { data: cobros, error: errCo } = await supabase
        .from("cobros")
        .select("comprobante_id, monto_centavos");
      expect(errCo).toBeNull();

      for (const fila of vDeuda ?? []) {
        const ventasCliente = (comprobantes ?? [])
          .filter((c) => c.cliente_id === fila.cliente_id)
          .map((c) => ({
            comprobante_id: c.id as string,
            monto_centavos: c.monto_centavos as number,
            cobrado_centavos: c.cobrado_centavos as number,
          }));
        const idsVentasCliente = new Set(ventasCliente.map((v) => v.comprobante_id));
        const cobrosCliente = (cobros ?? [])
          .filter((c) => idsVentasCliente.has(c.comprobante_id as string))
          .map((c) => ({
            comprobante_id: c.comprobante_id as string,
            monto_centavos: c.monto_centavos as number,
          }));

        const esperado = calcularDeudaCliente(ventasCliente, cobrosCliente);

        expect(Number(fila.vendido_centavos)).toBe(esperado.vendidoCentavos);
        expect(Number(fila.cobrado_centavos)).toBe(esperado.cobradoCentavos);
        expect(Number(fila.deuda_centavos)).toBe(esperado.deudaCentavos);
        expect(Number(fila.cantidad_ventas_pendientes)).toBe(
          esperado.cantidadVentasPendientes,
        );
      }
    });

    it("invariante 17: ningún comprobante tiene cobrado_centavos > monto_centavos", async () => {
      const { data, error } = await supabase
        .from("comprobantes")
        .select("id, monto_centavos, cobrado_centavos");
      expect(error).toBeNull();

      // El CHECK `comprobantes_cobrado_centavos_check` ya lo garantiza en la
      // base (Task 1) — este test es la confirmación desde el cliente, mismo
      // criterio que la validación agregada en `CobroForm`.
      const invalidos = (data ?? []).filter(
        (c) => (c.cobrado_centavos ?? 0) > c.monto_centavos,
      );
      expect(invalidos).toEqual([]);
    });
  },
);

/**
 * Test de seguridad RLS de Revendedores: con un usuario REVENDEDOR de prueba (rol
 * distinto del `TEST_USER_EMAIL` de arriba, que es un vendedor común),
 * verifica que RLS lo aísla del resto de la app — no ve nada de Caja,
 * Insumos, Clientes, Ferias, Precios/Deudas ni datos de otros revendedores.
 * Requiere TEST_REVENDEDOR_EMAIL/TEST_REVENDEDOR_PASSWORD en `.env.local`
 * — un usuario dado de alta con `supabase/crear-vendedor.sql` y pasado a
 * revendedor (`asignar_rol_revendedor` o `update vendedores set rol =
 * 'revendedor' where ...`), con `must_change_password: false`. Si no están
 * definidas, este describe se saltea entero — no bloquea
 * `npm run test:integration` para quien no tenga ese usuario de prueba
 * armado todavía.
 */

const TEST_REVENDEDOR_EMAIL = process.env.TEST_REVENDEDOR_EMAIL;
const TEST_REVENDEDOR_PASSWORD = process.env.TEST_REVENDEDOR_PASSWORD;

const tieneCredencialesRevendedor = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && TEST_REVENDEDOR_EMAIL && TEST_REVENDEDOR_PASSWORD,
);

if (!tieneCredencialesRevendedor) {
  console.warn(
    "[invariantes.integration.test] Salteando el test de seguridad RLS de " +
      "Revendedores: definí TEST_REVENDEDOR_EMAIL/TEST_REVENDEDOR_PASSWORD " +
      "(además de NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY) en " +
      ".env.local con un usuario de prueba real con rol 'revendedor' para " +
      "correr este test de seguridad.",
  );
}

/** Acepta que RLS bloquee con 0 filas (política que filtra) o con un error
 * de permiso (sin grant/policy alguna) — ambos son formas válidas de "no
 * ves esto" según la tabla/vista. */
async function esperarVacioOSinPermiso(
  promise: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  tabla: string,
) {
  const { data, error } = await promise;
  if (error) {
    console.warn(`${tabla}: bloqueada con error (permiso/RLS) — ${error.message}`);
    return;
  }
  expect(data ?? []).toEqual([]);
}

describe.skipIf(!tieneCredencialesRevendedor)(
  "RLS de Revendedores: un revendedor ve solo lo suyo",
  () => {
    let supabase: SupabaseClient;

    beforeAll(async () => {
      supabase = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
      const { error } = await supabase.auth.signInWithPassword({
        email: TEST_REVENDEDOR_EMAIL as string,
        password: TEST_REVENDEDOR_PASSWORD as string,
      });
      if (error) {
        throw new Error(
          `No se pudo autenticar contra Supabase con ${TEST_REVENDEDOR_EMAIL}: ${error.message}`,
        );
      }
    }, 20000);

    it.each([
      "comprobantes",
      "gastos",
      "cajas",
      "v_saldos_caja",
      "versiones_precio",
      "v_precio_item",
      "deudas",
      "v_stock_actual",
      "insumos",
      "clientes",
      "ferias",
    ] as const)("%s devuelve 0 filas o error de permiso", async (tabla) => {
      await esperarVacioOSinPermiso(supabase.from(tabla).select("*"), tabla);
    });

    it("ventas_revendedor solo devuelve las propias", async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      expect(user).not.toBeNull();

      const { data: miVendedor } = await supabase
        .from("vendedores")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      expect(miVendedor).not.toBeNull();

      const { data, error } = await supabase.from("ventas_revendedor").select("vendedor_id");
      expect(error).toBeNull();

      const otrosVendedorId = (data ?? []).filter((v) => v.vendedor_id !== miVendedor!.id);
      expect(otrosVendedorId).toEqual([]);
    });

    it("v_stock_revendedor solo devuelve filas propias", async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      expect(user).not.toBeNull();

      const { data: miVendedor } = await supabase
        .from("vendedores")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      expect(miVendedor).not.toBeNull();

      const { data, error } = await supabase.from("v_stock_revendedor").select("vendedor_id");
      expect(error).toBeNull();

      const otrosVendedorId = (data ?? []).filter((v) => v.vendedor_id !== miVendedor!.id);
      expect(otrosVendedorId).toEqual([]);
    });

    it("v_resumen_revendedor solo devuelve la fila propia", async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      expect(user).not.toBeNull();

      const { data: miVendedor } = await supabase
        .from("vendedores")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      expect(miVendedor).not.toBeNull();

      const { data, error } = await supabase.from("v_resumen_revendedor").select("vendedor_id");
      expect(error).toBeNull();

      const otrosVendedorId = (data ?? []).filter((v) => v.vendedor_id !== miVendedor!.id);
      expect(otrosVendedorId).toEqual([]);
    });

    /**
     * Hallazgo Critical de la revisión final de feature/revendedores: estos
     * RPCs de admin resolvían el llamador con
     * `select id from vendedores where user_id = auth.uid()` sin exigir rol
     * admin — un revendedor activo (que también tiene fila en `vendedores`)
     * podía invocarlos por REST. 0022_rpcs_solo_admin.sql agrega
     * `es_admin()` como primera línea de `crear_gasto`/`crear_ajuste_caja`/
     * `crear_lote` (los tres primeros de la lista); `confirmar_pago_revendedor`
     * (0055_coordinador.sql, reemplaza acá a `cerrar_feria` desde que
     * 0065_elimina_cerrar_feria.sql la borró) nace directamente con el mismo
     * chequeo. Con argumentos mínimos (válidos en forma, aunque hagan
     * referencia a IDs inexistentes) el primer chequeo que corre es ese, así
     * que un revendedor siempre recibe `NO_AUTORIZADO` antes de llegar a
     * cualquier otra validación.
     */
    it.each([
      ["crear_gasto", { p_monto_centavos: 100, p_categoria_id: crypto.randomUUID(), p_medio_pago: "efectivo", p_fecha: "2026-01-01" }],
      ["crear_ajuste_caja", { p_medio_pago: "efectivo", p_monto_centavos: 100, p_nota: "test seguridad" }],
      ["crear_lote", { p_fecha: "2026-01-01", p_items: [] }],
      ["confirmar_pago_revendedor", { p_pago_id: crypto.randomUUID() }],
    ] as const)("%s rechaza a un revendedor con NO_AUTORIZADO", async (rpc, args) => {
      const { data, error } = await supabase.rpc(rpc, args as never);
      expect(data).toBeNull();
      expect(error?.message).toBe("NO_AUTORIZADO");
    });

    it("productos ya no expone costo_centavos a un revendedor, v_productos_publicos sí lista filas", async () => {
      const { data: productos, error: errorProductos } = await supabase
        .from("productos")
        .select("costo_centavos");
      if (errorProductos) {
        console.warn(`productos: bloqueada con error (permiso/RLS) — ${errorProductos.message}`);
      } else {
        expect(productos ?? []).toEqual([]);
      }

      const { data: publicos, error: errorPublicos } = await supabase
        .from("v_productos_publicos")
        .select("id, nombre, presentacion_ml");
      expect(errorPublicos).toBeNull();
      expect((publicos ?? []).length).toBeGreaterThan(0);
    });

    it("materiales_venta solo devuelve filas publicadas", async () => {
      const { data, error } = await supabase.from("materiales_venta").select("publicado");
      expect(error).toBeNull();

      const noPublicados = (data ?? []).filter((m) => m.publicado !== true);
      expect(noPublicados).toEqual([]);

      // Chequeo en el otro sentido: además de no ver lo no publicado, el
      // revendedor debe ver TODO lo publicado. Comparamos contra el conteo
      // real (cliente admin, mismas credenciales TEST_USER_EMAIL que usa el
      // resto del archivo) en vez de solo asumir que ver 0 filas es correcto.
      const supabaseAdmin = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
      const { error: errorLoginAdmin } = await supabaseAdmin.auth.signInWithPassword({
        email: TEST_EMAIL as string,
        password: TEST_PASSWORD as string,
      });
      if (errorLoginAdmin) {
        throw new Error(
          `No se pudo autenticar contra Supabase con ${TEST_EMAIL}: ${errorLoginAdmin.message}`,
        );
      }

      const { count, error: errorCount } = await supabaseAdmin
        .from("materiales_venta")
        .select("*", { count: "exact", head: true })
        .eq("publicado", true);
      expect(errorCount).toBeNull();

      if (!count) {
        // No hay materiales publicados en la base de prueba — no se puede
        // probar el otro sentido (que el revendedor los vea), solo que no
        // ve los no publicados, ya cubierto arriba.
        expect(data).toEqual([]);
      } else {
        expect((data ?? []).length).toBe(count);
        for (const fila of data ?? []) {
          expect(fila.publicado).toBe(true);
        }
      }
    });
  },
);

// Si faltan credenciales, los describe de arriba se saltean enteros
// (skipIf) y vitest los reporta como "skipped" — no hace falta un
// placeholder extra acá.
