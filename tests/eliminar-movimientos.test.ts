import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { cargarMovimientosPlata } from "@/lib/data/plata";
import { puedeEliminarDeuda, puedeReabrirDeuda } from "@/lib/dominio/deudas";
import {
  lugarEnPalabras,
  mensajeEliminarMovimiento,
  mensajeErrorEliminarRendicion,
  opcionEliminarRendicion,
} from "@/lib/dominio/eliminar-movimientos";
import { esAjusteInsumoEliminable, mensajeEliminarAjusteInsumo } from "@/lib/dominio/insumos";
import type { Database } from "@/lib/types";

type Fila = Record<string, unknown>;

function fakeSupabase(tablas: Record<string, Fila[]>) {
  const from = vi.fn((tabla: string) => {
    const resultado = { data: tablas[tabla] ?? [], error: null };
    const encadenable: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (r: (v: unknown) => unknown) => Promise.resolve(resultado).then(r);
          return () => encadenable;
        },
      },
    );
    return encadenable;
  });
  return { from, storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) } } as unknown as SupabaseClient<Database>;
}

const base = { fecha: "2026-10-01", created_at: "2026-10-01T15:00:00Z" };

describe("cargarMovimientosPlata — qué se puede eliminar desde cada fila", () => {
  const supabase = fakeSupabase({
    vendedores: [
      { id: "ana", nombre: "Ana" },
      { id: "rev", nombre: "Rita" },
    ],
    comprobantes: [{ id: "v1", medio_pago: "efectivo", vendedor_id: "ana", cobrado_centavos: 1000_00, ...base }],
    cobros: [{ id: "c1", monto_centavos: 500_00, medio_pago: "efectivo", vendedor_id: "ana", comprobantes: null, ...base }],
    gastos: [{ id: "g1", medio_pago: "banco", vendedor_id: "ana", monto_centavos: 200_00, ...base }],
    pagos_deuda: [
      {
        id: "p1",
        monto_centavos: 100_00,
        monto_caja_centavos: 120_000_00,
        medio_pago: "mercado_pago",
        vendedor_id: "ana",
        deudas: { descripcion: "Aceite", moneda: "USD" },
        ...base,
      },
    ],
    ajustes_caja: [{ id: "a1", medio_pago: "banco", vendedor_id: "ana", monto_centavos: 50_00, nota: "x", ...base }],
    rendiciones: [
      { id: "r1", via: "directo_cuenta", medio_pago: "banco", vendedor_id: "rev", tenedor_id: null, monto_centavos: 300_00, nota: null, venta_grupo_id: null, ...base },
      { id: "r2", via: "encargado", medio_pago: "efectivo", vendedor_id: "rev", tenedor_id: "ana", monto_centavos: 90_00, nota: null, venta_grupo_id: "g1", ...base },
    ],
    transferencias_caja: [
      { id: "t1", origen: "efectivo", destino: "banco", monto_centavos: 70_00, nota: null, vendedor_id: "ana", ...base },
    ],
  });

  it("cobro, pago de deuda y transferencia traen su acción Eliminar con el lugar en palabras", async () => {
    const filas = await cargarMovimientosPlata(supabase, { tipo: "todo", limite: 50 });
    const porKey = (k: string) => filas.find((f) => f.key === k);

    expect(porKey("cobro-c1")?.eliminar).toEqual({
      tipo: "cobro",
      montoCentavos: 500_00,
      lugar: "la plata en manos de Ana",
    });
    expect(porKey("pago_deuda-p1")?.eliminar).toEqual({
      tipo: "pago_deuda",
      moneda: "USD",
      montoCentavos: 100_00,
      montoCajaCentavos: 120_000_00,
      lugar: "Mercado Pago",
    });
    expect(porKey("transferencia-t1")?.eliminar).toMatchObject({
      tipo: "transferencia",
      origenLugar: "la plata en manos de Ana",
      destino: "banco",
    });
  });

  it("rendición, venta y gasto no se eliminan ahí: dicen dónde se corrigen", async () => {
    const filas = await cargarMovimientosPlata(supabase, { tipo: "todo", limite: 50 });
    const porKey = (k: string) => filas.find((f) => f.key === k);

    expect(porKey("rendicion-r1")?.corregirEn).toBeNull();
    expect(porKey("rendicion-r1")?.eliminar).toEqual({
      tipo: "rendicion",
      revendedora: "Rita",
      montoCentavos: 300_00,
      lugar: "Banco",
    });
    expect(porKey("rendicion-r2")?.eliminar).toBeNull();
    expect(porKey("rendicion-r2")?.corregirEn).toEqual({
      texto: "Se corrige borrando la venta de Rita",
      href: "/revendedores/rev",
    });
    expect(porKey("comprobante-v1")?.corregirEn?.href).toBe("/comprobantes/v1");
    expect(porKey("gasto-g1")?.corregirEn?.href).toBe("/gastos/g1");
  });

  it("ajuste y depósito siguen con sus propias acciones, sin duplicar", async () => {
    const filas = await cargarMovimientosPlata(supabase, { tipo: "todo", limite: 50 });
    const ajuste = filas.find((f) => f.key === "ajuste-a1");
    expect(ajuste?.ajuste).not.toBeNull();
    expect(ajuste?.eliminar).toBeNull();
    expect(ajuste?.corregirEn).toBeNull();
  });
});

describe("carteles de confirmación", () => {
  it("el cobro dice que la deuda de la venta vuelve a subir", () => {
    const m = mensajeEliminarMovimiento({ tipo: "cobro", montoCentavos: 500_00, lugar: "Banco" });
    expect(m).toContain("deja de figurar en Banco");
    expect(m).toContain("La deuda de la venta vuelve a subir");
  });

  it("el pago de deuda devuelve la plata a la caja y reabre la deuda", () => {
    const m = mensajeEliminarMovimiento({
      tipo: "pago_deuda",
      moneda: "USD",
      montoCentavos: 100_00,
      montoCajaCentavos: 120_000_00,
      lugar: "Mercado Pago",
    });
    expect(m).toContain("vuelven a figurar en Mercado Pago");
    expect(m).toContain("la deuda vuelve a quedar pendiente");
  });

  it("la transferencia devuelve la plata al origen y la saca del destino", () => {
    const m = mensajeEliminarMovimiento({
      tipo: "transferencia",
      montoCentavos: 70_00,
      origenLugar: "la plata en manos de Ana",
      destino: "banco",
    });
    expect(m).toContain("vuelve a figurar en la plata en manos de Ana");
    expect(m).toContain("deja de figurar en Banco");
  });

  it("lugarEnPalabras distingue efectivo de cuenta", () => {
    expect(lugarEnPalabras("efectivo", "Ana")).toBe("la plata en manos de Ana");
    expect(lugarEnPalabras("mercado_pago", "Ana")).toBe("Mercado Pago");
  });

  it("el ajuste de insumo dice cómo queda el stock", () => {
    expect(mensajeEliminarAjusteInsumo("ingreso", 5, "kilo", "Sal")).toContain("el stock de Sal baja 5 kg");
    expect(mensajeEliminarAjusteInsumo("egreso", 5, "kilo", "Sal")).toContain("el stock de Sal sube 5 kg");
  });
});

describe("eliminar un pago de revendedora (0092)", () => {
  it("el cartel dice quién vuelve a deber y dónde deja de figurar la plata", () => {
    const m = mensajeEliminarMovimiento({
      tipo: "rendicion",
      revendedora: "Rita",
      montoCentavos: 300_00,
      lugar: "la plata en manos de Ana",
    });
    expect(m).toContain("Rita vuelve a deber");
    expect(m).toContain("deja de figurar en la plata en manos de Ana");
  });

  const base = {
    ventaGrupoId: null,
    revendedora: "Rita",
    montoCentavos: 100_00,
    via: "encargado" as const,
    medioPago: "mercado_pago" as const,
    tenedor: "Ana",
  };

  it("un pago a un encargado figura siempre en la plata en manos de ese encargado", () => {
    expect(opcionEliminarRendicion(base)).toEqual({
      puede: true,
      accion: { tipo: "rendicion", revendedora: "Rita", montoCentavos: 100_00, lugar: "la plata en manos de Ana" },
    });
  });

  it("un pago directo a la cuenta figura en esa cuenta", () => {
    const o = opcionEliminarRendicion({ ...base, via: "directo_cuenta" });
    expect(o.puede && o.accion.tipo === "rendicion" && o.accion.lugar).toBe("Mercado Pago");
  });

  it("la rendición de una venta de coordinadora no se elimina acá", () => {
    expect(opcionEliminarRendicion({ ...base, ventaGrupoId: "g1" })).toEqual({
      puede: false,
      motivo: "Se corrige borrando la venta de Rita",
    });
  });

  it("traduce cada código usando el detalle de la RPC", () => {
    const det = (o: object) => JSON.stringify(o);
    expect(
      mensajeErrorEliminarRendicion("PLATA_YA_DEPOSITADA", det({ tenedor: "Ana", en_mano_centavos: -50_00, pendiente_centavos: 0 })),
    ).toContain("Ana ya pasó a la Cuenta Ananja");
    expect(
      mensajeErrorEliminarRendicion("PLATA_YA_DEPOSITADA", det({ tenedor: "Ana", en_mano_centavos: 10_00, pendiente_centavos: 40_00 })),
    ).toContain("tiene avisado un depósito");
    expect(mensajeErrorEliminarRendicion("CAJA_SIN_SALDO", det({ medio: "banco", disponible: 0 }))).toContain(
      "Banco quedaría en negativo",
    );
    expect(mensajeErrorEliminarRendicion("DIFERENCIA_YA_PAGADA", det({ encargado: "Teresa", saldo_centavos: -1 }))).toContain(
      "a Teresa ya se le pagó",
    );
    expect(mensajeErrorEliminarRendicion("RENDICION_DE_VENTA", null)).toContain("borrando esa venta");
    expect(mensajeErrorEliminarRendicion("PLATA_YA_DEPOSITADA", "no es json")).toContain("ya se pasó a la Cuenta Ananja");
    expect(mensajeErrorEliminarRendicion(undefined, null)).toBe("No se pudo eliminar. Probá de nuevo.");
  });
});

describe("reglas espejo de la base (0091)", () => {
  it("puedeEliminarDeuda: ni de pedido ni con pagos", () => {
    expect(puedeEliminarDeuda({ loteId: null, pagadoCentavos: 0 })).toBe(true);
    expect(puedeEliminarDeuda({ loteId: "l1", pagadoCentavos: 0 })).toBe(false);
    expect(puedeEliminarDeuda({ loteId: null, pagadoCentavos: 1 })).toBe(false);
  });

  it("puedeReabrirDeuda: saldada, a mano y no cubierta por pagos", () => {
    const d = { loteId: null, saldadaEn: "2026-10-01", pagadoCentavos: 0, montoCentavos: 100 };
    expect(puedeReabrirDeuda(d)).toBe(true);
    expect(puedeReabrirDeuda({ ...d, saldadaEn: null })).toBe(false);
    expect(puedeReabrirDeuda({ ...d, loteId: "l1" })).toBe(false);
    expect(puedeReabrirDeuda({ ...d, pagadoCentavos: 100 })).toBe(false);
    expect(puedeReabrirDeuda({ ...d, pagadoCentavos: 40 })).toBe(true);
  });

  it("esAjusteInsumoEliminable: sin compra ni pedido", () => {
    expect(esAjusteInsumoEliminable({ gasto_id: null, lote_id: null })).toBe(true);
    expect(esAjusteInsumoEliminable({ gasto_id: "g", lote_id: null })).toBe(false);
    expect(esAjusteInsumoEliminable({ gasto_id: null, lote_id: "l" })).toBe(false);
  });
});
