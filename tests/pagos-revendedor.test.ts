import { describe, expect, it } from "vitest";

import {
  calcularDeudaConPendientes,
  comprobanteObligatorio,
  DESTINO_CUENTA,
  filtrarPagosPorEstado,
  historialPagos,
  mediosPermitidosPago,
  pagoRevendedorFila,
  textoEstadoPago,
  type PagoHistorial,
  type PagoRevendedorFuente,
  type RendicionHistorial,
} from "@/lib/dominio/pagos-revendedor";

describe("calcularDeudaConPendientes", () => {
  it("solo los pagos pendientes suman a 'pendiente de confirmar'", () => {
    const r = calcularDeudaConPendientes(5000000, [
      { montoCentavos: 1000000, estado: "pendiente" },
      { montoCentavos: 700000, estado: "confirmado" },
      { montoCentavos: 300000, estado: "rechazado" },
      { montoCentavos: 500000, estado: "pendiente" },
    ]);
    expect(r).toEqual({
      debeCentavos: 5000000,
      pendienteCentavos: 1500000,
      aPagarSugeridoCentavos: 3500000,
    });
  });

  it("la precarga nunca es negativa (ya informó todo o más)", () => {
    expect(
      calcularDeudaConPendientes(1000000, [{ montoCentavos: 1500000, estado: "pendiente" }])
        .aPagarSugeridoCentavos,
    ).toBe(0);
  });

  it("con saldo a favor (pagó de más) no sugiere pagar nada", () => {
    const r = calcularDeudaConPendientes(-20000, []);
    expect(r.debeCentavos).toBe(-20000);
    expect(r.aPagarSugeridoCentavos).toBe(0);
  });
});

describe("historialPagos", () => {
  const pago = (p: Partial<PagoHistorial> & { id: string }): PagoHistorial => ({
    montoCentavos: 100000,
    medioPago: "mercado_pago",
    fecha: "2026-09-10",
    createdAt: "2026-09-10T10:00:00+00:00",
    estado: "pendiente",
    motivoRechazo: null,
    rendicionId: null,
    ...p,
  });
  const rendicion = (r: Partial<RendicionHistorial> & { id: string }): RendicionHistorial => ({
    montoCentavos: 200000,
    medioPago: "efectivo",
    fecha: "2026-09-08",
    createdAt: "2026-09-08T10:00:00+00:00",
    ...r,
  });

  it("no repite la rendición que se creó al confirmar un pago", () => {
    const movimientos = historialPagos(
      [pago({ id: "p1", estado: "confirmado", rendicionId: "r1" })],
      [rendicion({ id: "r1", fecha: "2026-09-10" })],
    );
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ id: "p1", origen: "pago", estado: "confirmado" });
  });

  it("una rendición que cargó un admin directo aparece como confirmada", () => {
    const movimientos = historialPagos([], [rendicion({ id: "r9" })]);
    expect(movimientos).toEqual([
      expect.objectContaining({ id: "r9", origen: "rendicion", estado: "confirmado", motivoRechazo: null }),
    ]);
  });

  it("ordena del más reciente al más viejo (fecha y después hora de carga)", () => {
    const movimientos = historialPagos(
      [
        pago({ id: "tarde", fecha: "2026-09-10", createdAt: "2026-09-10T18:00:00+00:00" }),
        pago({ id: "rechazado", estado: "rechazado", motivoRechazo: "No llegó", fecha: "2026-09-01" }),
        pago({ id: "temprano", fecha: "2026-09-10", createdAt: "2026-09-10T08:00:00+00:00" }),
      ],
      [rendicion({ id: "r", fecha: "2026-09-05" })],
    );
    expect(movimientos.map((m) => m.id)).toEqual(["tarde", "temprano", "r", "rechazado"]);
    expect(movimientos[3].motivoRechazo).toBe("No llegó");
  });
});

describe("medios y comprobante", () => {
  it("a un encargado se le puede pagar en efectivo; a Ananja no", () => {
    expect(mediosPermitidosPago({ id: "t", nombre: "Laura" })).toContain("efectivo");
    expect(mediosPermitidosPago(null)).toEqual(["mercado_pago", "banco"]);
  });

  it("el comprobante es obligatorio salvo en efectivo", () => {
    expect(comprobanteObligatorio("efectivo")).toBe(false);
    expect(comprobanteObligatorio("banco")).toBe(true);
    expect(comprobanteObligatorio("mercado_pago")).toBe(true);
    expect(comprobanteObligatorio(null)).toBe(false);
  });
});

// --- Lista admin de pagos (`/comprobantes?tab=pagos`) ---------------------

function pagoFuente(parcial: Partial<PagoRevendedorFuente> = {}): PagoRevendedorFuente {
  return {
    id: "p1",
    monto_centavos: 1_250_000,
    medio_pago: "mercado_pago",
    fecha: "2026-10-01",
    created_at: "2026-10-01T15:00:00Z",
    nota: null,
    estado: "pendiente",
    resuelto_en: null,
    motivo_rechazo: null,
    imagen_path: "revendedores/v1/foto.jpg",
    destinatario_id: "enc1",
    vendedor: { nombre: "Sofi" },
    destinatario: { nombre: "Laura" },
    resolvio: null,
    ...parcial,
  };
}

describe("pagoRevendedorFila", () => {
  it("a un encargado: destino es el nombre del encargado", () => {
    const f = pagoRevendedorFila(pagoFuente());
    expect(f).toMatchObject({
      id: "p1",
      quienPago: "Sofi",
      destino: "Laura",
      montoCentavos: 1_250_000,
      medioPago: "mercado_pago",
      fecha: "2026-10-01",
      informadoEn: "2026-10-01T15:00:00Z",
      estado: "pendiente",
      estadoLabel: "Pendiente de confirmar",
      resueltoPor: null,
      resueltoEn: null,
      motivoRechazo: null,
      nota: null,
      imagenPath: "revendedores/v1/foto.jpg",
    });
  });

  it("directo a la Cuenta Ananja cuando destinatario_id es null", () => {
    const f = pagoRevendedorFila(pagoFuente({ destinatario_id: null, destinatario: null }));
    expect(f.destino).toBe(DESTINO_CUENTA);
    expect(DESTINO_CUENTA).toBe("Cuenta Ananja");
  });

  it("confirmado: trae quién y cuándo lo resolvió", () => {
    const f = pagoRevendedorFila(
      pagoFuente({
        estado: "confirmado",
        resolvio: { nombre: "Fran" },
        resuelto_en: "2026-10-02T12:00:00Z",
      }),
    );
    expect(f.estado).toBe("confirmado");
    expect(f.estadoLabel).toBe("Confirmado");
    expect(f.resueltoPor).toBe("Fran");
    expect(f.resueltoEn).toBe("2026-10-02T12:00:00Z");
  });

  it("rechazado: trae el motivo", () => {
    const f = pagoRevendedorFila(
      pagoFuente({
        estado: "rechazado",
        resolvio: { nombre: "Fran" },
        motivo_rechazo: "El monto no coincide",
      }),
    );
    expect(f.estado).toBe("rechazado");
    expect(f.estadoLabel).toBe("Rechazado");
    expect(f.motivoRechazo).toBe("El monto no coincide");
  });

  it("efectivo sin foto y con nota", () => {
    const f = pagoRevendedorFila(
      pagoFuente({ medio_pago: "efectivo", imagen_path: null, nota: "Se lo di en mano" }),
    );
    expect(f.imagenPath).toBeNull();
    expect(f.nota).toBe("Se lo di en mano");
  });

  it("estado desconocido se trata como pendiente", () => {
    expect(pagoRevendedorFila(pagoFuente({ estado: "algo-raro" })).estado).toBe("pendiente");
  });

  it("nombres que no se pudieron resolver caen a un texto genérico", () => {
    const f = pagoRevendedorFila(pagoFuente({ vendedor: null, destinatario: null }));
    expect(f.quienPago).toBe("Una revendedora");
    expect(f.destino).toBe("Su encargado");
  });
});

describe("filtrarPagosPorEstado", () => {
  const filas = [
    pagoRevendedorFila(pagoFuente({ id: "a", estado: "pendiente" })),
    pagoRevendedorFila(pagoFuente({ id: "b", estado: "confirmado" })),
    pagoRevendedorFila(pagoFuente({ id: "c", estado: "rechazado" })),
    pagoRevendedorFila(pagoFuente({ id: "d", estado: "confirmado" })),
  ];

  it("todos devuelve la lista entera y en el mismo orden", () => {
    expect(filtrarPagosPorEstado(filas, "todos").map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("filtra por cada estado conservando el orden", () => {
    expect(filtrarPagosPorEstado(filas, "pendiente").map((f) => f.id)).toEqual(["a"]);
    expect(filtrarPagosPorEstado(filas, "confirmado").map((f) => f.id)).toEqual(["b", "d"]);
    expect(filtrarPagosPorEstado(filas, "rechazado").map((f) => f.id)).toEqual(["c"]);
  });

  it("un estado sin pagos da lista vacía", () => {
    expect(filtrarPagosPorEstado([filas[0]], "rechazado")).toEqual([]);
  });
});

describe("textoEstadoPago", () => {
  it("pendiente: sin 'por …'", () => {
    expect(textoEstadoPago(pagoRevendedorFila(pagoFuente()))).toBe("Pendiente de confirmar");
  });

  it("confirmado y rechazado: dicen quién", () => {
    const resolvio = { nombre: "Fran" };
    expect(
      textoEstadoPago(pagoRevendedorFila(pagoFuente({ estado: "confirmado", resolvio }))),
    ).toBe("Confirmado por Fran");
    expect(
      textoEstadoPago(pagoRevendedorFila(pagoFuente({ estado: "rechazado", resolvio }))),
    ).toBe("Rechazado por Fran");
  });

  it("resuelto sin saber quién: solo el estado", () => {
    expect(textoEstadoPago(pagoRevendedorFila(pagoFuente({ estado: "confirmado" })))).toBe(
      "Confirmado",
    );
  });
});
