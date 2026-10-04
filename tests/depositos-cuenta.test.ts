import { describe, expect, it } from "vitest";

import { mensajeEliminarDeposito } from "@/lib/dominio/caja";
import { resolverTenedorInicial } from "@/lib/dominio/plata";

/**
 * `/plata/depositar` ("Pasar a la cuenta"): el select decide a quién se le
 * descuenta la plata, así que el valor inicial nunca puede quedar fuera de
 * las opciones (si no, el navegador muestra otra persona y el depósito se
 * carga a nombre de ella).
 */
describe("resolverTenedorInicial", () => {
  const ids = ["admin-1", "coord-1", "admin-2"];

  it("un ?tenedor= válido (incluso de un coordinador) queda preseleccionado", () => {
    expect(resolverTenedorInicial("coord-1", "admin-2", ids)).toBe("coord-1");
  });

  it("un ?tenedor= que no está en la lista cae en la persona de la sesión", () => {
    expect(resolverTenedorInicial("desconocido", "admin-2", ids)).toBe("admin-2");
  });

  it("sin ?tenedor= usa la persona de la sesión si está en la lista", () => {
    expect(resolverTenedorInicial(undefined, "admin-2", ids)).toBe("admin-2");
  });

  it("si la persona de la sesión tampoco está, usa la primera de la lista", () => {
    expect(resolverTenedorInicial(undefined, "otro", ids)).toBe("admin-1");
    expect(resolverTenedorInicial(undefined, null, ids)).toBe("admin-1");
  });

  it("lista vacía: null", () => {
    expect(resolverTenedorInicial("x", "y", [])).toBeNull();
  });
});

describe("mensajeEliminarDeposito", () => {
  it("dice que la plata vuelve a la persona y sale de la cuenta", () => {
    expect(mensajeEliminarDeposito("Laura", "mercado_pago", 150000)).toBe(
      "Se va a borrar este depósito: $ 1.500,00 vuelven a figurar en manos de Laura y salen de Mercado Pago.",
    );
  });

  it("usa la etiqueta de la cuenta destino", () => {
    expect(mensajeEliminarDeposito("Fran", "banco", 100)).toContain("salen de Banco.");
  });
});
