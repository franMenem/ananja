import { describe, expect, it } from "vitest";

import { formatCentavos } from "@/lib/money";

import {
  agruparVentasPropias,
  avisoVentaCoordinadorAdmin,
  avisoVentaCoordinadoraPropia,
  cantidadValidaVentaCoordinador,
  descripcionVentaPropia,
  ERRORES_ELIMINAR_VENTA,
  leerResultadoVentaCoordinador,
  loteInicialVentaCoordinador,
  lotesParaVentaCoordinador,
  mensajeErrorVentaCoordinador,
  montoVentaCoordinador,
  rotuloLoteVenta,
  textoEliminarVentaCoordinadora,
  textoVentaPropiaGuardada,
  type LoteVentaCoordinador,
  type VentaCrudaPropia,
} from "@/lib/dominio/venta-coordinador";

/**
 * "La coordinadora vendió N botellas" (supabase/migrations/0073): reglas de
 * pantalla de la hoja y de la sección "Ventas propias".
 */

const lote = (parcial: Partial<LoteVentaCoordinador> & { loteId: string }): LoteVentaCoordinador => ({
  fecha: "2026-09-01",
  quedan: 10,
  costoAnanjaCentavos: 800_000,
  ...parcial,
});

describe("lotesParaVentaCoordinador", () => {
  const lotes = [
    lote({ loteId: "nuevo", fecha: "2026-09-20" }),
    lote({ loteId: "viejo", fecha: "2026-08-01" }),
    lote({ loteId: "sin-stock", fecha: "2026-07-01", quedan: 0 }),
    lote({ loteId: "sin-costo", fecha: "2026-08-15", costoAnanjaCentavos: null }),
    lote({ loteId: "costo-cero", fecha: "2026-08-16", costoAnanjaCentavos: 0 }),
  ];

  it("solo lotes con stock, del más viejo al más nuevo", () => {
    expect(lotesParaVentaCoordinador(lotes, false).map((l) => l.loteId)).toEqual([
      "viejo",
      "sin-costo",
      "costo-cero",
      "nuevo",
    ]);
  });

  it("para un admin también se descartan los lotes sin costo cargado", () => {
    expect(lotesParaVentaCoordinador(lotes, true).map((l) => l.loteId)).toEqual(["viejo", "nuevo"]);
  });

  it("no modifica la lista original", () => {
    const copia = [...lotes];
    lotesParaVentaCoordinador(lotes, true);
    expect(lotes).toEqual(copia);
  });

  it("preselecciona el más viejo; sin lotes, ninguno", () => {
    expect(loteInicialVentaCoordinador(lotesParaVentaCoordinador(lotes, true))?.loteId).toBe("viejo");
    expect(loteInicialVentaCoordinador([])).toBeNull();
  });

  it("el rótulo dice la fecha del lote y lo que queda", () => {
    expect(rotuloLoteVenta(lote({ loteId: "a", fecha: "2026-09-05", quedan: 12 }))).toBe("Lote del 5/9 · quedan 12");
  });
});

describe("cantidad y montos", () => {
  it("la cantidad va de 1 hasta lo que queda del lote elegido", () => {
    const l = lote({ loteId: "a", quedan: 4 });
    expect(cantidadValidaVentaCoordinador(1, l)).toBe(true);
    expect(cantidadValidaVentaCoordinador(4, l)).toBe(true);
    expect(cantidadValidaVentaCoordinador(5, l)).toBe(false);
    expect(cantidadValidaVentaCoordinador(0, l)).toBe(false);
    expect(cantidadValidaVentaCoordinador(1.5, l)).toBe(false);
    expect(cantidadValidaVentaCoordinador(1, null)).toBe(false);
  });

  it("lo que se suma es N × costo del lote", () => {
    expect(montoVentaCoordinador(3, 800_000)).toBe(2_400_000);
  });

  it("el admin ve antes de guardar qué va a pasar, con el monto", () => {
    expect(
      avisoVentaCoordinadorAdmin({ cantidad: 3, coordinadorNombre: "Coordinadora Uno", costoAnanjaCentavos: 800_000 }),
    ).toBe(`Salen 3 del depósito y se suman ${formatCentavos(2_400_000)} a lo que Coordinadora Uno tiene que pasar a Ananja.`);
  });

  it("la coordinadora no ve costos: el aviso previo no lleva monto", () => {
    expect(avisoVentaCoordinadoraPropia(2)).toBe(
      "Salen 2 del depósito y se suman a lo que tenés que pasar a Ananja.",
    );
  });

  it("después de guardar, a ella se le muestra el monto que devolvió el servidor", () => {
    expect(textoVentaPropiaGuardada(1_600_000)).toBe(
      `Listo. Se sumaron ${formatCentavos(1_600_000)} a lo que tenés que pasar a Ananja.`,
    );
    expect(textoVentaPropiaGuardada(null)).toContain("quedó anotado");
  });

  it("lee la respuesta del servidor sin tirar con datos raros", () => {
    expect(
      leerResultadoVentaCoordinador({ grupo_id: "g", entrega_id: "e", rendicion_id: "r", monto_centavos: 5 }),
    ).toEqual({ grupoId: "g", entregaId: "e", rendicionId: "r", montoCentavos: 5 });
    expect(leerResultadoVentaCoordinador(null)).toEqual({
      grupoId: null,
      entregaId: null,
      rendicionId: null,
      montoCentavos: null,
    });
  });
});

describe("errores", () => {
  it("DEPOSITO_INSUFICIENTE dice cuántas quedan en el lote", () => {
    expect(mensajeErrorVentaCoordinador("DEPOSITO_INSUFICIENTE", JSON.stringify({ disponible: 3, lote_id: "x" }))).toBe(
      "En el depósito hay 3 disponibles para vender en ese lote. Cargá hasta esa cantidad.",
    );
    expect(mensajeErrorVentaCoordinador("DEPOSITO_INSUFICIENTE", '{"disponible":0}')).toBe(
      "En el depósito hay 0 disponibles para vender en ese lote. Cargá hasta esa cantidad.",
    );
    expect(mensajeErrorVentaCoordinador("DEPOSITO_INSUFICIENTE", "roto")).toContain("no hay tantas");
  });

  it("GRUPO_INVALIDO tiene un texto genérico", () => {
    expect(mensajeErrorVentaCoordinador("GRUPO_INVALIDO", null)).toBe("No se pudo guardar. Cerrá y volvé a intentar.");
  });

  it("traduce el resto de los códigos del servidor y cae a un genérico", () => {
    expect(mensajeErrorVentaCoordinador("COSTO_FALTANTE", null)).toContain("todavía no tiene precio cargado");
    expect(mensajeErrorVentaCoordinador("COORDINADOR_INVALIDO", null)).toBe("Esa persona ya no es coordinadora.");
    expect(mensajeErrorVentaCoordinador("FECHA_FUTURA", null)).toBe("La fecha no puede ser posterior a hoy.");
    expect(mensajeErrorVentaCoordinador("NO_AUTORIZADO", null)).toBe("No tenés permiso para esto.");
    expect(mensajeErrorVentaCoordinador("RARO", null)).toBe("No se pudo guardar. Probá de nuevo.");
  });

  it("eliminar: YA_PASO_LA_PLATA tiene su mensaje y los de siempre se conservan", () => {
    expect(ERRORES_ELIMINAR_VENTA.YA_PASO_LA_PLATA).toBe(
      "No se puede eliminar: esa plata ya se pasó (o está avisada) a la cuenta de Ananja.",
    );
    expect(ERRORES_ELIMINAR_VENTA.VENTA_NO_ENCONTRADA).toBe("No encontramos esta venta.");
    expect(ERRORES_ELIMINAR_VENTA.NO_AUTORIZADO).toBe("No tenés permiso para borrar esta venta.");
  });

  it("la confirmación de borrar dice que vuelven al depósito y que se le descuenta", () => {
    const texto = textoEliminarVentaCoordinadora("Coordinadora Uno");
    expect(texto).toContain("vuelven al depósito");
    expect(texto).toContain("se le descuenta a Coordinadora Uno de lo que tiene que pasar a Ananja");
  });
});

describe("agruparVentasPropias", () => {
  const venta = (parcial: Partial<VentaCrudaPropia> & { id: string }): VentaCrudaPropia => ({
    grupo_id: `g-${parcial.id}`,
    fecha: "2026-09-10",
    created_at: "2026-09-10T10:00:00Z",
    producto_id: "p500",
    lote_id: "lote-a",
    cantidad: 3,
    precio_costo_centavos: 800_000,
    ...parcial,
  });
  const productos = new Map([["p500", "Botella 500 ml"]]);
  const lotes = new Map([["lote-a", "2026-08-03"]]);

  it("una fila por venta, con el monto N × costo y el lote rotulado por fecha", () => {
    const [v] = agruparVentasPropias([venta({ id: "1" })], productos, lotes);
    expect(v).toMatchObject({
      ventaId: "1",
      productoNombre: "Botella 500 ml",
      cantidad: 3,
      loteFecha: "2026-08-03",
      montoCentavos: 2_400_000,
    });
    expect(descripcionVentaPropia(v)).toBe("3 × Botella 500 ml · Lote del 3/8");
  });

  it("suma las filas del mismo grupo (una venta partida) y deja el id de la primera", () => {
    const filas = agruparVentasPropias(
      [
        venta({ id: "1", grupo_id: "g", cantidad: 2 }),
        venta({ id: "2", grupo_id: "g", cantidad: 3, precio_costo_centavos: 900_000 }),
      ],
      productos,
      lotes,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ ventaId: "1", cantidad: 5, montoCentavos: 2 * 800_000 + 3 * 900_000 });
  });

  it("la más nueva primero (fecha, después created_at)", () => {
    const filas = agruparVentasPropias(
      [
        venta({ id: "vieja", fecha: "2026-09-01" }),
        venta({ id: "tarde", fecha: "2026-09-10", created_at: "2026-09-10T15:00:00Z" }),
        venta({ id: "temprano", fecha: "2026-09-10", created_at: "2026-09-10T09:00:00Z" }),
      ],
      productos,
      lotes,
    );
    expect(filas.map((f) => f.ventaId)).toEqual(["tarde", "temprano", "vieja"]);
  });

  it("producto o lote desconocido no rompe", () => {
    const [v] = agruparVentasPropias([venta({ id: "1", producto_id: "x", lote_id: "l-raro" })], productos, lotes);
    expect(v.productoNombre).toBe("?");
    expect(descripcionVentaPropia(v)).toBe("3 × ? · Lote");
    const [sinLote] = agruparVentasPropias([venta({ id: "2", lote_id: null })], productos, lotes);
    expect(descripcionVentaPropia(sinLote)).toBe("3 × Botella 500 ml");
  });
});
