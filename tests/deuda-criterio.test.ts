import { describe, expect, it } from "vitest";

import { calcularEstadoDeuda, deudaSigueDebiendose } from "@/lib/dominio/deudas";
import { filtrarDeudasNegocioPendientes, type DeudaNegocioFila } from "@/lib/dominio/tareas";

/**
 * Tabla completa saldada_en × pagado × restante. `pagado`/`restante` salen de
 * `v_saldo_deuda` (restante = monto − pagado, monto > 0).
 */
const FECHA = "2026-09-01";
const CASOS: {
  saldadaEn: string | null;
  pagado: number;
  restante: number;
  sigueDebiendose: boolean;
  estado: "pendiente" | "parcial" | "saldada";
  nota: string;
}[] = [
  { saldadaEn: null, pagado: 0, restante: 1000, sigueDebiendose: true, estado: "pendiente", nota: "deuda nueva" },
  { saldadaEn: null, pagado: 400, restante: 600, sigueDebiendose: true, estado: "parcial", nota: "pago parcial" },
  { saldadaEn: FECHA, pagado: 1000, restante: 0, sigueDebiendose: false, estado: "saldada", nota: "pagada del todo" },
  { saldadaEn: FECHA, pagado: 0, restante: 1000, sigueDebiendose: false, estado: "saldada", nota: "marcada saldada a mano" },
  { saldadaEn: FECHA, pagado: 400, restante: 600, sigueDebiendose: false, estado: "saldada", nota: "marcada saldada tras un pago parcial" },
  // Único estado donde los criterios viejos diferían: la base ya no lo produce.
  { saldadaEn: null, pagado: 1000, restante: 0, sigueDebiendose: false, estado: "saldada", nota: "saldo 0 sin fecha" },
  // Inalcanzables (monto > 0), pero la regla tiene que ser total.
  { saldadaEn: null, pagado: 0, restante: 0, sigueDebiendose: false, estado: "saldada", nota: "monto 0" },
  { saldadaEn: null, pagado: 1200, restante: -200, sigueDebiendose: false, estado: "saldada", nota: "pagado de más" },
  { saldadaEn: FECHA, pagado: 0, restante: 0, sigueDebiendose: false, estado: "saldada", nota: "monto 0 saldada" },
  { saldadaEn: FECHA, pagado: 1200, restante: -200, sigueDebiendose: false, estado: "saldada", nota: "pagado de más saldada" },
];

describe("deudaSigueDebiendose: criterio único", () => {
  for (const c of CASOS) {
    it(`${c.nota} (saldada_en=${c.saldadaEn ?? "null"}, pagado=${c.pagado}, restante=${c.restante})`, () => {
      expect(deudaSigueDebiendose(c.saldadaEn, c.restante)).toBe(c.sigueDebiendose);
      expect(calcularEstadoDeuda(c.saldadaEn, c.pagado, c.restante)).toBe(c.estado);
      // El estado "saldada" y "ya no se debe" son la misma cosa.
      expect(calcularEstadoDeuda(c.saldadaEn, c.pagado, c.restante) !== "saldada").toBe(c.sigueDebiendose);

      // La tarea "Deudas" usa el mismo predicado.
      const fila: DeudaNegocioFila = {
        deuda_id: "d",
        descripcion: "x",
        fecha: "2026-08-01",
        moneda: "ARS",
        restante_centavos: c.restante,
        saldada_en: c.saldadaEn,
      };
      expect(filtrarDeudasNegocioPendientes([fila])).toHaveLength(c.sigueDebiendose ? 1 : 0);
    });
  }
});
