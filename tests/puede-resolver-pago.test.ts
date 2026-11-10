import { describe, expect, it } from "vitest";

import { puedeSerEncargado } from "@/lib/rol-vendedor";
import { puedeResolverPagoRevendedor } from "@/lib/dominio/pagos-revendedor";

/**
 * Referencia escrita DIRECTO desde `confirmar_pago_revendedor` /
 * `rechazar_pago_revendedor` (0055_coordinador.sql): el RPC solo rechaza con
 * NO_AUTORIZADO cuando el pago es ajeno, el destinatario es un ADMIN ACTIVO
 * y ese destinatario no es quien llama.
 */
function reglaRpc(args: {
  pagoVendedorId: string;
  destinatarioId: string | null;
  destinatario: { rol: string; activo: boolean } | null;
  yo: string;
}): boolean {
  const destinatarioAdminActivo = args.destinatario?.activo === true && args.destinatario.rol === "admin";
  if (args.pagoVendedorId !== args.yo) {
    if (destinatarioAdminActivo && args.destinatarioId !== args.yo) return false;
  }
  return true;
}

const ROLES = ["admin", "coordinador", "revendedor", "pendiente"];
const YO = "yo";
const OTRO = "otro";

describe("puedeResolverPagoRevendedor espeja la RPC", () => {
  const destinatarios: { id: string | null; d: { rol: string; activo: boolean } | null; nombre: string }[] = [
    { id: null, d: null, nombre: "a la cuenta" },
    ...[YO, OTRO].flatMap((id) =>
      ROLES.flatMap((rol) =>
        [true, false].map((activo) => ({ id, d: { rol, activo }, nombre: `${id}:${rol}:${activo ? "activo" : "inactivo"}` })),
      ),
    ),
  ];

  for (const dest of destinatarios) {
    for (const pagoVendedorId of [YO, OTRO]) {
      it(`pago de ${pagoVendedorId} → ${dest.nombre}`, () => {
        const esperado = reglaRpc({ pagoVendedorId, destinatarioId: dest.id, destinatario: dest.d, yo: YO });
        // Los dos consumidores arman estos booleanos igual: tarea
        // (lib/data/tareas.ts) y página (tareas/pagos/[id]).
        const real = puedeResolverPagoRevendedor({
          pagoVendedorId,
          destinatarioId: dest.id,
          destinatarioPuedeSerEncargado: puedeSerEncargado(dest.d),
          destinatarioEsCoordinador: dest.d?.rol === "coordinador",
          miVendedorId: YO,
        });
        expect(real).toBe(esperado);
      });
    }
  }

  it("el caso que la gente espera: encargada admin activa distinta de mí → no me toca", () => {
    expect(
      puedeResolverPagoRevendedor({
        pagoVendedorId: "revendedora",
        destinatarioId: OTRO,
        destinatarioPuedeSerEncargado: true,
        destinatarioEsCoordinador: false,
        miVendedorId: YO,
      }),
    ).toBe(false);
  });

  it("sin fila de vendedor (miVendedorId null) solo ve lo que le toca a cualquier admin", () => {
    const base = {
      pagoVendedorId: "r",
      destinatarioId: OTRO,
      destinatarioPuedeSerEncargado: true,
      destinatarioEsCoordinador: false,
      miVendedorId: null,
    };
    expect(puedeResolverPagoRevendedor(base)).toBe(false);
    expect(puedeResolverPagoRevendedor({ ...base, destinatarioId: null })).toBe(true);
    expect(puedeResolverPagoRevendedor({ ...base, destinatarioPuedeSerEncargado: false })).toBe(true);
  });
});
