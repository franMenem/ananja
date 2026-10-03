import { describe, expect, it } from "vitest";
import {
  agruparMargenVendedorPorPeriodo,
  atribuirCostoFifo,
  calcularFilaMargen,
  calcularGananciaAnanjaPorPeriodo,
  colorGanancia,
  filaGananciaDelPeriodo,
  filtrarGastosOperativos,
  formatMargen,
  mapearFilasMargenVentas,
  margenVendedoresDePeriodo,
  notaUnidadesSinCosto,
  resumirMargenAnanja,
  type CostoLotePorProducto,
  type DemandaSinLoteInput,
  type FilaGananciaAnanjaPeriodo,
  type FilaMargenInput,
  type FilaMargenPeriodo,
  type LoteCapacidadInput,
} from "@/lib/dominio/margen";

/**
 * Espejo de supabase/migrations/0031_margen_ventas.sql — margen de venta
 * por unidad (Ananja / vendedor), atribución FIFO de costo para ventas sin
 * lote, y resultado neto por feria. Los casos numéricos usan un
 * ejemplo inventado: 30 botellas de 500 ml del lote con costo $5.000,00 y
 * costo Ananja $6.500,00 vendidas a $10.465,00.
 */

const LOTE_A: CostoLotePorProducto = {
  costoProduccionUnitarioCentavos: 500000, // $5.000,00
  costoAnanjaUnitarioCentavos: 650000, // $6.500,00 = round(500000 * 1.30)
};

describe("calcularFilaMargen — ejemplo numérico", () => {
  it("30 botellas con precio unitario cargado: margen Ananja $1.500,00/botella, margen vendedor $3.965,00/botella", () => {
    const input: FilaMargenInput = {
      origen: "comprobante",
      documentoId: "c1",
      fecha: "2026-01-05",
      vendedorId: "admin",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 30,
      precioUnitarioVentaCentavos: 1046500, // $10.465,00
      precioCostoRealCentavos: null,
      costoEstimado: false,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    expect(fila.margenAnanjaCentavos).toBe(150000 * 30); // $1.500,00 × 30 = 45.000,00
    expect(fila.margenVendedorCentavos).toBe(396500 * 30); // $3.965,00 × 30 = 118.950,00
    expect(fila.ingresoAnanjaCentavos).toBe(650000 * 30);
    expect(fila.costoEstimado).toBe(false);
  });

  it("venta sin precio unitario cargado: margen vendedor null, margen Ananja se sigue calculando", () => {
    const input: FilaMargenInput = {
      origen: "comprobante",
      documentoId: "c2",
      fecha: "2026-01-06",
      vendedorId: "admin",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 2,
      precioUnitarioVentaCentavos: null,
      precioCostoRealCentavos: null,
      costoEstimado: false,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    expect(fila.margenVendedorCentavos).toBeNull();
    expect(fila.margenAnanjaCentavos).toBe(150000 * 2);
  });

  it("venta de revendedor a precio costo: ingreso Ananja usa el precio_costo real, margen vendedor 0", () => {
    const input: FilaMargenInput = {
      origen: "revendedor",
      documentoId: "v1",
      fecha: "2026-01-08",
      vendedorId: "revendedora",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 3,
      precioUnitarioVentaCentavos: 650000,
      precioCostoRealCentavos: 650000,
      costoEstimado: true,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    expect(fila.ingresoAnanjaCentavos).toBe(650000 * 3);
    expect(fila.margenVendedorCentavos).toBe(0);
    expect(fila.margenAnanjaCentavos).toBe(150000 * 3);
  });

  it("revendedor: ingreso, margen de Ananja y margen del vendedor usan el costo aprobado, no el costo Ananja teórico del lote", () => {
    const input: FilaMargenInput = {
      origen: "revendedor",
      documentoId: "v2",
      fecha: "2026-01-08",
      vendedorId: "revendedora",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 10,
      precioUnitarioVentaCentavos: 900000,
      // precio_costo_centavos histórico del revendedor, distinto del costo
      // Ananja teórico del lote (650000) — revendedor_precios se fija a
      // mano, no se deriva de v_costo_lote_desglose.
      precioCostoRealCentavos: 600000,
      costoEstimado: true,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    // 0040: las tres columnas usan el monto REAL que le debe a Ananja, así
    // "Ganancia de los vendedores" coincide con "Tu ganancia" de /mi.
    expect(fila.ingresoAnanjaCentavos).toBe(600000 * 10);
    expect(fila.margenAnanjaCentavos).toBe((600000 - 500000) * 10);
    expect(fila.margenVendedorCentavos).toBe((900000 - 600000) * 10);
    // El costo Ananja teórico del lote se sigue informando tal cual.
    expect(fila.costoAnanjaUnitarioCentavos).toBe(650000);
  });

  it("sin costo de lote disponible (lote null o sin costear): todo lo derivado del costo queda null", () => {
    const input: FilaMargenInput = {
      origen: "comprobante",
      documentoId: "c9",
      fecha: "2026-01-11",
      vendedorId: "admin",
      feriaId: null,
      productoId: "botella-500",
      loteId: null,
      cantidad: 3,
      precioUnitarioVentaCentavos: 900000,
      precioCostoRealCentavos: null,
      costoEstimado: true,
    };

    const fila = calcularFilaMargen(input, null);

    expect(fila.costoProduccionUnitarioCentavos).toBeNull();
    expect(fila.costoAnanjaUnitarioCentavos).toBeNull();
    expect(fila.ingresoAnanjaCentavos).toBeNull();
    expect(fila.margenAnanjaCentavos).toBeNull();
    expect(fila.margenVendedorCentavos).toBeNull();
  });
});

describe("calcularFilaMargen — foto de comprobante (0052_costo_vigente_lote.sql § Parte A)", () => {
  it("con foto: ingreso/margen de Ananja y margen del vendedor usan la foto, no el costo Ananja en vivo del lote", () => {
    const input: FilaMargenInput = {
      origen: "comprobante",
      documentoId: "c10",
      fecha: "2026-02-01",
      vendedorId: "admin",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 5,
      precioUnitarioVentaCentavos: 1046500,
      precioCostoRealCentavos: null,
      costoEstimado: false,
      // Foto tomada al vender, antes de que el lote se actualizara — menor
      // al costo Ananja EN VIVO del lote (650000, LOTE_A) para simular una
      // "actualización de costos del depósito" posterior.
      costoLoteUnitarioCentavos: 550000,
      // Foto de costo de PRODUCCIÓN — también menor a la EN VIVO (500000).
      costoProduccionFotoCentavos: 550000,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    // Ingreso/margen del vendedor: la foto (550000), no el costo Ananja en
    // vivo (650000) — la venta no se mueve retroactivamente.
    expect(fila.ingresoAnanjaCentavos).toBe(550000 * 5);
    expect(fila.margenVendedorCentavos).toBe((1046500 - 550000) * 5);
    // Margen de Ananja: foto de Ananja (550000) − foto de PRODUCCIÓN
    // (550000) — BLOCKER corregido en la rev. 2: antes restaba la
    // producción EN VIVO (500000), así que el margen se seguía moviendo
    // aunque el ingreso ya estuviera congelado.
    expect(fila.margenAnanjaCentavos).toBe((550000 - 550000) * 5);
    // BUG2 corregido en la rev. 3: las columnas "costo unitario" de salida
    // también muestran LA FOTO de esta venta, no el costo en vivo del lote
    // — antes mostraban siempre 650000/500000 (en vivo) aunque la venta
    // tuviera foto propia, así que varias ventas con fotos DISTINTAS
    // terminaban mostrando todas el mismo número después de actualizar el
    // lote.
    expect(fila.costoAnanjaUnitarioCentavos).toBe(550000);
    expect(fila.costoProduccionUnitarioCentavos).toBe(550000);
  });

  it("con foto de Ananja pero SIN foto de producción (dato viejo, 0044 pre-0052): margen de Ananja usa la producción en vivo, la columna de Ananja usa la foto", () => {
    const input: FilaMargenInput = {
      origen: "comprobante",
      documentoId: "c10b",
      fecha: "2026-02-01",
      vendedorId: "admin",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 2,
      precioUnitarioVentaCentavos: 1046500,
      precioCostoRealCentavos: null,
      costoEstimado: false,
      costoLoteUnitarioCentavos: 550000,
      costoProduccionFotoCentavos: null,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    expect(fila.costoAnanjaUnitarioCentavos).toBe(550000);
    expect(fila.costoProduccionUnitarioCentavos).toBe(500000);
    expect(fila.margenAnanjaCentavos).toBe((550000 - 500000) * 2);
  });

  it("sin foto (null/ausente): se comporta exactamente como antes de 0052 — costo Ananja en vivo", () => {
    const input: FilaMargenInput = {
      origen: "comprobante",
      documentoId: "c11",
      fecha: "2026-02-01",
      vendedorId: "admin",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 5,
      precioUnitarioVentaCentavos: 1046500,
      precioCostoRealCentavos: null,
      costoEstimado: false,
      costoLoteUnitarioCentavos: null,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    expect(fila.ingresoAnanjaCentavos).toBe(650000 * 5);
    expect(fila.margenAnanjaCentavos).toBe(150000 * 5);
    expect(fila.margenVendedorCentavos).toBe((1046500 - 650000) * 5);
    expect(fila.costoAnanjaUnitarioCentavos).toBe(650000);
    expect(fila.costoProduccionUnitarioCentavos).toBe(500000);
  });

  it("origen revendedor: costoLoteUnitarioCentavos sigue significando lo de siempre (foto de la entrega), no la foto de comprobante", () => {
    const input: FilaMargenInput = {
      origen: "revendedor",
      documentoId: "v3",
      fecha: "2026-02-01",
      vendedorId: "revendedora",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 4,
      precioUnitarioVentaCentavos: 900000,
      precioCostoRealCentavos: 600000,
      costoEstimado: true,
      costoLoteUnitarioCentavos: 550000,
      costoProduccionFotoCentavos: 450000,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    // 0058_plata_coordinador_costo.sql: le cobraron 600000 pero el costo
    // Ananja de la foto es 550000 — Ananja se queda con el MENOR de los
    // dos (min(600000, 550000) = 550000), no con todo lo cobrado.
    expect(fila.ingresoAnanjaCentavos).toBe(550000 * 4);
    // La ganancia de LA REVENDEDORA sigue con lo cobrado sin clampear
    // (900000 − 600000): el margen de más que cobró su encargado es plata
    // real de él, no desaparece — solo no cuenta para Ananja.
    expect(fila.margenVendedorCentavos).toBe((900000 - 600000) * 4);
    // BUG2: la columna de salida muestra LA FOTO (550000/450000), no un
    // valor derivado del ingreso.
    expect(fila.costoAnanjaUnitarioCentavos).toBe(550000);
    expect(fila.costoProduccionUnitarioCentavos).toBe(450000);
  });

  it("con un encargado (admin o coordinador) que cobra de más sobre el costo del lote, esa diferencia NO es ganancia de Ananja", () => {
    const conCostoLoteMenorAlCobrado: FilaMargenInput = {
      origen: "revendedor",
      documentoId: "v-con-margen-encargado",
      fecha: "2026-02-01",
      vendedorId: "revendedora",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 4,
      precioUnitarioVentaCentavos: 900000,
      // Le cobraron 600000 pero el costo Ananja del lote (foto) era 550000
      // — 0058_plata_coordinador_costo.sql, BLOCKER 1 de la revisión
      // adversarial de esa migración: esos 50000 de diferencia por botella
      // son ganancia de quien se la cobró (un coordinador con margen
      // propio, por ejemplo), NO de Ananja.
      precioCostoRealCentavos: 600000,
      costoEstimado: false,
      costoLoteUnitarioCentavos: 550000,
      costoProduccionFotoCentavos: 450000,
    };

    const fila = calcularFilaMargen(conCostoLoteMenorAlCobrado, LOTE_A);

    // Ananja se queda SOLO con el costo del lote, no con lo cobrado.
    expect(fila.ingresoAnanjaCentavos).toBe(550000 * 4);
    expect(fila.margenAnanjaCentavos).toBe((550000 - 450000) * 4);
    // Sigue sin existir una columna de "ganancia del encargado" — no se
    // reparte ni se muestra en ningún lado (mismo criterio que Plata).
    expect(fila).not.toHaveProperty("margenEncargadoCentavos");
  });

  it("venta por debajo del costo Ananja (cobrado < foto): NO se clampea hacia arriba, Ananja se queda con lo poco que cobró", () => {
    const input: FilaMargenInput = {
      origen: "revendedor",
      documentoId: "v-bajo-costo",
      fecha: "2026-02-01",
      vendedorId: "revendedora",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 2,
      precioUnitarioVentaCentavos: 650000,
      // Le cobraron MENOS que el costo Ananja de la foto (550000) — el
      // clamp es `min`, así que no hay ningún límite hacia arriba: Ananja
      // recibe lo poco que efectivamente se cobró, igual que antes.
      precioCostoRealCentavos: 500000,
      costoEstimado: false,
      costoLoteUnitarioCentavos: 550000,
      costoProduccionFotoCentavos: 450000,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    expect(fila.ingresoAnanjaCentavos).toBe(500000 * 2);
    expect(fila.margenAnanjaCentavos).toBe((500000 - 450000) * 2);
  });

  it("revendedor sin foto de costo (lote incompleto al entregar): sin nada contra qué clampear, se usa lo cobrado tal cual", () => {
    const input: FilaMargenInput = {
      origen: "revendedor",
      documentoId: "v-sin-foto",
      fecha: "2026-02-01",
      vendedorId: "revendedora",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 4,
      precioUnitarioVentaCentavos: 900000,
      precioCostoRealCentavos: 600000,
      costoEstimado: false,
      // Sin foto (lote incompleto al momento de entregar, 0044/0052) — el
      // costo Ananja EN VIVO del lote (650000, LOTE_A) es mayor a lo
      // cobrado (600000): si se clampeara contra el costo en vivo en vez
      // de no clampear en absoluto, esto rompería "lo ya vendido no se
      // mueve" (BLOCKER 1) — sin foto, sencillamente no hay nada que
      // clampear.
      costoLoteUnitarioCentavos: null,
    };

    const fila = calcularFilaMargen(input, LOTE_A);

    expect(fila.ingresoAnanjaCentavos).toBe(600000 * 4);
    expect(fila.margenVendedorCentavos).toBe((900000 - 600000) * 4);
  });

  it("BUG2 (regresión) — dos ventas con fotos de Ananja DISTINTAS muestran costos unitarios DISTINTOS, no el mismo valor en vivo", () => {
    const base = {
      fecha: "2026-02-01",
      vendedorId: "admin",
      feriaId: null,
      productoId: "botella-500",
      loteId: "lote-a",
      cantidad: 1,
      precioUnitarioVentaCentavos: null,
      precioCostoRealCentavos: null,
      costoEstimado: false,
    } as const;

    const ventaVieja = calcularFilaMargen(
      { ...base, origen: "comprobante", documentoId: "c-vieja", costoLoteUnitarioCentavos: 640000 },
      LOTE_A,
    );
    const ventaNueva = calcularFilaMargen(
      { ...base, origen: "comprobante", documentoId: "c-nueva", costoLoteUnitarioCentavos: 900000 },
      LOTE_A,
    );

    // Antes del fix las dos hubieran mostrado el mismo costo Ananja EN VIVO
    // del lote (650000) sin importar su propia foto.
    expect(ventaVieja.costoAnanjaUnitarioCentavos).toBe(640000);
    expect(ventaNueva.costoAnanjaUnitarioCentavos).toBe(900000);
    expect(ventaVieja.costoAnanjaUnitarioCentavos).not.toBe(ventaNueva.costoAnanjaUnitarioCentavos);
  });
});

describe("atribuirCostoFifo", () => {
  const loteA: LoteCapacidadInput = {
    loteId: "lote-a",
    productoId: "botella-500",
    fecha: "2026-01-01",
    createdAt: "2026-01-01T00:00:00Z",
    producido: 44,
    asignadoDirecto: 36, // 30 + 2 + 4 asignadas a mano en otros comprobantes
  };

  it("venta sin lote (costo estimado FIFO): resuelve al único lote con capacidad remanente", () => {
    const demanda: DemandaSinLoteInput[] = [
      {
        origen: "comprobante",
        documentoId: "c3",
        fecha: "2026-01-07",
        createdAt: "2026-01-07T00:00:00Z",
        ordenId: "c3-item",
        productoId: "botella-500",
        cantidad: 5,
        vendedorId: "admin",
        feriaId: null,
        precioUnitarioVentaCentavos: 1300000,
        precioCostoRealCentavos: null,
      },
    ];

    const resultado = atribuirCostoFifo([loteA], demanda);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].loteId).toBe("lote-a");
    expect(resultado[0].cantidad).toBe(5);
  });

  it("reparte una venta entre dos lotes cuando cruza el límite de capacidad (FIFO: el más viejo primero)", () => {
    const loteViejo: LoteCapacidadInput = {
      loteId: "lote-viejo",
      productoId: "botella-500",
      fecha: "2026-01-01",
      createdAt: "2026-01-01T00:00:00Z",
      producido: 10,
      asignadoDirecto: 7, // quedan 3 de capacidad
    };
    const loteNuevo: LoteCapacidadInput = {
      loteId: "lote-nuevo",
      productoId: "botella-500",
      fecha: "2026-02-01",
      createdAt: "2026-02-01T00:00:00Z",
      producido: 20,
      asignadoDirecto: 0,
    };
    const demanda: DemandaSinLoteInput[] = [
      {
        origen: "comprobante",
        documentoId: "c-split",
        fecha: "2026-02-05",
        createdAt: "2026-02-05T00:00:00Z",
        ordenId: "c-split-item",
        productoId: "botella-500",
        cantidad: 5, // 3 al lote viejo (todo lo que le queda) + 2 al nuevo
        vendedorId: "admin",
        feriaId: null,
        precioUnitarioVentaCentavos: null,
        precioCostoRealCentavos: null,
      },
    ];

    const resultado = atribuirCostoFifo([loteViejo, loteNuevo], demanda);

    expect(resultado).toHaveLength(2);
    expect(resultado.find((r) => r.loteId === "lote-viejo")?.cantidad).toBe(3);
    expect(resultado.find((r) => r.loteId === "lote-nuevo")?.cantidad).toBe(2);
  });

  it("demanda que supera la capacidad conocida: el remanente queda con loteId null (costo estimado sin resolver)", () => {
    const loteChico: LoteCapacidadInput = {
      loteId: "lote-chico",
      productoId: "botella-500",
      fecha: "2026-01-01",
      createdAt: "2026-01-01T00:00:00Z",
      producido: 10,
      asignadoDirecto: 8, // quedan 2
    };
    const demanda: DemandaSinLoteInput[] = [
      {
        origen: "revendedor",
        documentoId: "v-overflow",
        fecha: "2026-01-10",
        createdAt: "2026-01-10T00:00:00Z",
        ordenId: "v-overflow",
        productoId: "botella-500",
        cantidad: 5,
        vendedorId: "revendedora",
        feriaId: null,
        precioUnitarioVentaCentavos: 900000,
        precioCostoRealCentavos: 900000,
      },
    ];

    const resultado = atribuirCostoFifo([loteChico], demanda);

    expect(resultado).toHaveLength(2);
    const conLote = resultado.find((r) => r.loteId === "lote-chico");
    const sinLote = resultado.find((r) => r.loteId === null);
    expect(conLote?.cantidad).toBe(2);
    expect(sinLote?.cantidad).toBe(3);
  });

  it("ventas_revendedor y comprobante_items sin lote comparten el mismo pool FIFO, ordenado por fecha", () => {
    const lote: LoteCapacidadInput = {
      loteId: "lote-unico",
      productoId: "botella-500",
      fecha: "2026-01-01",
      createdAt: "2026-01-01T00:00:00Z",
      producido: 10,
      asignadoDirecto: 0,
    };
    const demanda: DemandaSinLoteInput[] = [
      {
        origen: "comprobante",
        documentoId: "c-primero",
        fecha: "2026-01-02",
        createdAt: "2026-01-02T00:00:00Z",
        ordenId: "c-primero-item",
        productoId: "botella-500",
        cantidad: 7,
        vendedorId: "admin",
        feriaId: null,
        precioUnitarioVentaCentavos: null,
        precioCostoRealCentavos: null,
      },
      {
        origen: "revendedor",
        documentoId: "v-segundo",
        fecha: "2026-01-03",
        createdAt: "2026-01-03T00:00:00Z",
        ordenId: "v-segundo",
        productoId: "botella-500",
        cantidad: 5,
        vendedorId: "revendedora",
        feriaId: null,
        precioUnitarioVentaCentavos: 900000,
        precioCostoRealCentavos: 900000,
      },
    ];

    const resultado = atribuirCostoFifo([lote], demanda);

    // El comprobante (más viejo) se lleva las primeras 7 unidades del lote
    // completo; a la venta del revendedor (más nueva) solo le quedan 3.
    const filaComprobante = resultado.find((r) => r.documentoId === "c-primero");
    const filaRevendedor = resultado.find((r) => r.documentoId === "v-segundo");
    expect(filaComprobante?.cantidad).toBe(7);
    expect(filaComprobante?.loteId).toBe("lote-unico");
    expect(filaRevendedor?.cantidad).toBe(3);
    expect(filaRevendedor?.loteId).toBe("lote-unico");

    const overflow = resultado.filter((r) => r.documentoId === "v-segundo" && r.loteId === null);
    expect(overflow[0]?.cantidad).toBe(2);
  });
});

describe("resumirMargenAnanja — null nunca es 0 (revisión adversarial de 0031)", () => {
  it("todas las filas costeadas: suma normal, algunCostoCargado true, sin unidades sin costo", () => {
    const resumen = resumirMargenAnanja([
      { cantidad: 30, margenAnanjaCentavos: 150000 * 30, costoEstimado: false },
      { cantidad: 3, margenAnanjaCentavos: 150000 * 3, costoEstimado: true },
    ]);
    expect(resumen).toEqual({
      margenAnanjaCentavos: 150000 * 33,
      algunCostoCargado: true,
      unidadesSinCosto: 0,
      algunCostoEstimado: true,
    });
  });

  it("ninguna fila costeada: margen 0 pero algunCostoCargado false — la UI no debe mostrar '$ 0'", () => {
    const resumen = resumirMargenAnanja([
      { cantidad: 10, margenAnanjaCentavos: null, costoEstimado: false },
      { cantidad: 5, margenAnanjaCentavos: null, costoEstimado: true },
    ]);
    expect(resumen).toEqual({
      margenAnanjaCentavos: 0,
      algunCostoCargado: false,
      unidadesSinCosto: 15,
      algunCostoEstimado: false,
    });
  });

  it("mezcla: solo las filas costeadas suman, las sin costo se cuentan aparte", () => {
    const resumen = resumirMargenAnanja([
      { cantidad: 4, margenAnanjaCentavos: 100000, costoEstimado: false },
      { cantidad: 6, margenAnanjaCentavos: null, costoEstimado: false },
    ]);
    expect(resumen).toEqual({
      margenAnanjaCentavos: 100000,
      algunCostoCargado: true,
      unidadesSinCosto: 6,
      algunCostoEstimado: false,
    });
  });

  it("sin filas: resumen en cero, sin costo cargado", () => {
    expect(resumirMargenAnanja([])).toEqual({
      margenAnanjaCentavos: 0,
      algunCostoCargado: false,
      unidadesSinCosto: 0,
      algunCostoEstimado: false,
    });
  });
});

describe("calcularGananciaAnanjaPorPeriodo — /ganancia", () => {
  const FILAS: FilaMargenPeriodo[] = [
    {
      fecha: "2026-01-05",
      vendedorId: "admin",
      cantidad: 30,
      margenAnanjaCentavos: 100000,
      margenVendedorCentavos: 200000,
      precioUnitarioVentaCentavos: 1046500,
      costoEstimado: false,
    },
    {
      fecha: "2026-01-20",
      vendedorId: "revendedora",
      cantidad: 3,
      margenAnanjaCentavos: 50000,
      margenVendedorCentavos: 0,
      precioUnitarioVentaCentavos: 650000,
      costoEstimado: true,
    },
    {
      fecha: "2026-02-01",
      vendedorId: "admin",
      cantidad: 2,
      margenAnanjaCentavos: 30000,
      margenVendedorCentavos: null,
      precioUnitarioVentaCentavos: null,
      costoEstimado: false,
    },
    // Sin costo de lote resuelto (`null`): no suma al margen, cuenta como
    // "unidad sin costo" — NUNCA como $0.
    {
      fecha: "2026-02-02",
      vendedorId: "admin",
      cantidad: 5,
      margenAnanjaCentavos: null,
      margenVendedorCentavos: 40000,
      precioUnitarioVentaCentavos: 900000,
      costoEstimado: true,
    },
  ];

  const GASTOS_OPERATIVOS = [
    { fecha: "2026-01-10", montoCentavos: 20000 },
    { fecha: "2026-02-15", montoCentavos: 100000 },
  ];

  it("agrupa por mes: margen menos gastos operativos, marca el mes con algún costo estimado", () => {
    const filas = calcularGananciaAnanjaPorPeriodo(FILAS, GASTOS_OPERATIVOS, "mes");

    const enero = filas.find((f) => f.periodo === "2026-01")!;
    expect(enero.margenAnanjaCentavos).toBe(150000); // 100.000 + 50.000
    expect(enero.algunCostoCargado).toBe(true);
    expect(enero.unidadesSinCosto).toBe(0);
    expect(enero.gastosOperativosCentavos).toBe(20000);
    expect(enero.gananciaAnanjaCentavos).toBe(130000);
    expect(enero.algunCostoEstimado).toBe(true); // la fila de la revendedora

    const febrero = filas.find((f) => f.periodo === "2026-02")!;
    expect(febrero.margenAnanjaCentavos).toBe(30000); // la fila null no suma
    expect(febrero.algunCostoCargado).toBe(true); // la del día 1 sí tenía costo
    expect(febrero.unidadesSinCosto).toBe(5); // las 5 botellas de la fila sin costo del día 2
    expect(febrero.gastosOperativosCentavos).toBe(100000);
    expect(febrero.gananciaAnanjaCentavos).toBe(-70000); // negativo: gastos > margen
    expect(febrero.algunCostoEstimado).toBe(false); // la única estimada de feb tiene margen null, no cuenta
  });

  it("agrupa por año: mismo criterio, un solo período", () => {
    const filas = calcularGananciaAnanjaPorPeriodo(FILAS, GASTOS_OPERATIVOS, "anio");
    expect(filas).toHaveLength(1);
    expect(filas[0].periodo).toBe("2026");
    expect(filas[0].margenAnanjaCentavos).toBe(180000);
    expect(filas[0].unidadesSinCosto).toBe(5);
    expect(filas[0].gastosOperativosCentavos).toBe(120000);
    expect(filas[0].gananciaAnanjaCentavos).toBe(60000);
  });

  it("un período con gastos pero sin ninguna venta también aparece, con margen en 0 y algunCostoCargado false", () => {
    const filas = calcularGananciaAnanjaPorPeriodo([], [{ fecha: "2026-03-01", montoCentavos: 5000 }], "mes");
    expect(filas).toEqual([
      {
        periodo: "2026-03",
        margenAnanjaCentavos: 0,
        algunCostoCargado: false,
        unidadesSinCosto: 0,
        algunCostoEstimado: false,
        gastosOperativosCentavos: 5000,
        gananciaAnanjaCentavos: -5000,
      },
    ]);
  });

  it("un período donde NINGUNA venta tiene costo cargado: margen 0 con algunCostoCargado false y unidadesSinCosto > 0 — nunca '$ 0' silencioso", () => {
    const filas = calcularGananciaAnanjaPorPeriodo(
      [
        {
          fecha: "2026-04-01",
          vendedorId: "admin",
          cantidad: 40,
          margenAnanjaCentavos: null,
          margenVendedorCentavos: null,
          precioUnitarioVentaCentavos: null,
          costoEstimado: false,
        },
      ],
      [],
      "mes",
    );
    expect(filas[0].margenAnanjaCentavos).toBe(0);
    expect(filas[0].algunCostoCargado).toBe(false);
    expect(filas[0].unidadesSinCosto).toBe(40);
  });

  it("orden descendente: el período más reciente primero", () => {
    const filas = calcularGananciaAnanjaPorPeriodo(FILAS, GASTOS_OPERATIVOS, "mes");
    expect(filas.map((f) => f.periodo)).toEqual(["2026-02", "2026-01"]);
  });
});

describe("agruparMargenVendedorPorPeriodo / margenVendedoresDePeriodo — /ganancia", () => {
  const FILAS: FilaMargenPeriodo[] = [
    {
      fecha: "2026-01-05",
      vendedorId: "admin",
      cantidad: 30,
      margenAnanjaCentavos: 100000,
      margenVendedorCentavos: 200000,
      precioUnitarioVentaCentavos: 1046500,
      costoEstimado: false,
    },
    {
      fecha: "2026-01-08",
      vendedorId: "admin",
      cantidad: 2,
      margenAnanjaCentavos: 20000,
      margenVendedorCentavos: 50000,
      precioUnitarioVentaCentavos: 900000,
      costoEstimado: false,
    },
    {
      fecha: "2026-01-20",
      vendedorId: "revendedora",
      cantidad: 3,
      margenAnanjaCentavos: 50000,
      margenVendedorCentavos: 300000,
      precioUnitarioVentaCentavos: 650000,
      costoEstimado: true,
    },
    // Sin precio de venta cargado (`null`): estado normal, no aporta nada
    // (ni margen ni "unidad sin costo" — no hay nada raro acá).
    {
      fecha: "2026-01-22",
      vendedorId: "admin",
      cantidad: 4,
      margenAnanjaCentavos: 10000,
      margenVendedorCentavos: null,
      precioUnitarioVentaCentavos: null,
      costoEstimado: false,
    },
    // Precio SÍ cargado pero margen null (lote sin costo Ananja cargado):
    // es una unidad sin costo real, tiene que contarse.
    {
      fecha: "2026-01-25",
      vendedorId: "admin",
      cantidad: 6,
      margenAnanjaCentavos: null,
      margenVendedorCentavos: null,
      precioUnitarioVentaCentavos: 900000,
      costoEstimado: true,
    },
  ];

  it("suma el margen del vendedor por período, una fila por vendedor, y cuenta las unidades sin costo por separado", () => {
    const porMes = agruparMargenVendedorPorPeriodo(FILAS, "mes");
    const filas = margenVendedoresDePeriodo(porMes, "2026-01");

    expect(filas).toEqual([
      {
        vendedorId: "revendedora",
        margenVendedorCentavos: 300000,
        algunCostoCargado: true,
        unidadesSinCosto: 0,
        algunCostoEstimado: true,
      },
      {
        vendedorId: "admin",
        margenVendedorCentavos: 250000, // 200.000 + 50.000
        algunCostoCargado: true,
        unidadesSinCosto: 6, // la fila del día 25, con precio pero sin costo
        algunCostoEstimado: false,
      },
    ]);
  });

  it("un período sin ningún vendedor con algo que aportar devuelve []", () => {
    const porMes = agruparMargenVendedorPorPeriodo(FILAS, "mes");
    expect(margenVendedoresDePeriodo(porMes, "2026-02")).toEqual([]);
  });

  it("un vendedor con TODAS sus filas sin costo (pero con precio cargado): aparece con margen 0 y algunCostoCargado false", () => {
    const porMes = agruparMargenVendedorPorPeriodo(
      [
        {
          fecha: "2026-03-01",
          vendedorId: "revendedora",
          cantidad: 8,
          margenAnanjaCentavos: null,
          margenVendedorCentavos: null,
          precioUnitarioVentaCentavos: 900000,
          costoEstimado: true,
        },
      ],
      "mes",
    );
    const filas = margenVendedoresDePeriodo(porMes, "2026-03");
    expect(filas).toEqual([
      {
        vendedorId: "revendedora",
        margenVendedorCentavos: 0,
        algunCostoCargado: false,
        unidadesSinCosto: 8,
        algunCostoEstimado: false,
      },
    ]);
  });
});

describe("filaGananciaDelPeriodo", () => {
  const FILA: FilaGananciaAnanjaPeriodo = {
    periodo: "2026-09",
    margenAnanjaCentavos: 100000,
    algunCostoCargado: true,
    unidadesSinCosto: 0,
    algunCostoEstimado: false,
    gastosOperativosCentavos: 20000,
    gananciaAnanjaCentavos: 80000,
  };

  it("devuelve la fila del período pedido", () => {
    expect(filaGananciaDelPeriodo([FILA], "2026-09")).toEqual(FILA);
  });

  it("un período sin fila devuelve un default en cero (no undefined)", () => {
    expect(filaGananciaDelPeriodo([FILA], "2026-10")).toEqual({
      periodo: "2026-10",
      margenAnanjaCentavos: 0,
      algunCostoCargado: false,
      unidadesSinCosto: 0,
      algunCostoEstimado: false,
      gastosOperativosCentavos: 0,
      gananciaAnanjaCentavos: 0,
    });
  });
});

describe("colorGanancia", () => {
  it("negativo: bordó; cero o positivo: texto normal", () => {
    expect(colorGanancia(-1)).toBe("text-accent");
    expect(colorGanancia(0)).toBe("text-text");
    expect(colorGanancia(100)).toBe("text-text");
  });
});

describe("formatMargen", () => {
  it("con costo cargado, formatea el monto", () => {
    expect(formatMargen(150000, true)).toBe("$ 1.500,00");
  });

  it("sin costo cargado, avisa en vez de mostrar $ 0", () => {
    expect(formatMargen(0, false)).toBe("Sin costos cargados");
  });
});

describe("notaUnidadesSinCosto", () => {
  it("0 unidades: no hace falta la nota", () => {
    expect(notaUnidadesSinCosto(0)).toBeNull();
  });

  it("singular", () => {
    expect(notaUnidadesSinCosto(1)).toBe("1 botella sin costo cargado, no contada");
  });

  it("plural", () => {
    expect(notaUnidadesSinCosto(5)).toBe("5 botellas sin costo cargado, no contadas");
  });
});

describe("mapearFilasMargenVentas", () => {
  it("pasa de snake_case a camelCase y normaliza el origen", () => {
    const filas = mapearFilasMargenVentas([
      {
        origen: "revendedor",
        fecha: "2026-09-01",
        vendedor_id: "v1",
        cantidad: 3,
        margen_ananja_centavos: 1000,
        margen_vendedor_centavos: 2000,
        precio_unitario_venta_centavos: 5000,
        costo_estimado: true,
      },
    ]);
    expect(filas).toEqual([
      {
        origen: "revendedor",
        fecha: "2026-09-01",
        vendedorId: "v1",
        cantidad: 3,
        margenAnanjaCentavos: 1000,
        margenVendedorCentavos: 2000,
        precioUnitarioVentaCentavos: 5000,
        costoEstimado: true,
      },
    ]);
  });

  it("cualquier origen distinto de 'revendedor' se normaliza a 'comprobante'", () => {
    expect(
      mapearFilasMargenVentas([
        {
          origen: "comprobante",
          fecha: "2026-09-01",
          vendedor_id: "v1",
          cantidad: 1,
          margen_ananja_centavos: null,
          margen_vendedor_centavos: null,
          precio_unitario_venta_centavos: null,
          costo_estimado: null,
        },
      ])[0].origen,
    ).toBe("comprobante");
  });

  it("costo_estimado null se normaliza a false", () => {
    expect(
      mapearFilasMargenVentas([
        {
          origen: null,
          fecha: "2026-09-01",
          vendedor_id: "v1",
          cantidad: 1,
          margen_ananja_centavos: null,
          margen_vendedor_centavos: null,
          precio_unitario_venta_centavos: null,
          costo_estimado: null,
        },
      ])[0].costoEstimado,
    ).toBe(false);
  });

  it("descarta filas sin fecha, vendedor_id o cantidad", () => {
    expect(
      mapearFilasMargenVentas([
        {
          origen: "comprobante",
          fecha: null,
          vendedor_id: "v1",
          cantidad: 1,
          margen_ananja_centavos: null,
          margen_vendedor_centavos: null,
          precio_unitario_venta_centavos: null,
          costo_estimado: null,
        },
      ]),
    ).toEqual([]);
  });
});

describe("filtrarGastosOperativos", () => {
  it("descarta los gastos de costo de producción, mapea el resto", () => {
    const resultado = filtrarGastosOperativos([
      { fecha: "2026-09-01", monto_centavos: 1000, categorias_gasto: { es_costo_produccion: true } },
      { fecha: "2026-09-02", monto_centavos: 2000, categorias_gasto: { es_costo_produccion: false } },
      { fecha: "2026-09-03", monto_centavos: 3000, categorias_gasto: null },
    ]);
    expect(resultado).toEqual([
      { fecha: "2026-09-02", montoCentavos: 2000 },
      { fecha: "2026-09-03", montoCentavos: 3000 },
    ]);
  });
});

