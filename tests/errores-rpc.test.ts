import { describe, expect, it } from "vitest";

import { ERRORES_RPC_COMUNES, traducirErrorRpc } from "@/lib/dominio/errores-rpc";

describe("traducirErrorRpc", () => {
  const diccionario = {
    NO_AUTORIZADO: "No tenés permiso para cambiar esta venta.",
    VENTA_NO_ENCONTRADA: "No encontramos esta venta.",
  };

  it("devuelve el mensaje del diccionario si el código matchea", () => {
    expect(traducirErrorRpc("VENTA_NO_ENCONTRADA", diccionario, "default")).toBe(
      "No encontramos esta venta.",
    );
  });

  it("cae al mensaje por defecto si el código no está en el diccionario", () => {
    expect(traducirErrorRpc("ALGO_QUE_NO_EXISTE", diccionario, "default")).toBe("default");
  });

  it("cae al mensaje por defecto con código null/undefined/vacío", () => {
    expect(traducirErrorRpc(null, diccionario, "default")).toBe("default");
    expect(traducirErrorRpc(undefined, diccionario, "default")).toBe("default");
    expect(traducirErrorRpc("", diccionario, "default")).toBe("default");
  });

  it("un diccionario de dominio puede pisar el texto de ERRORES_RPC_COMUNES para el mismo código", () => {
    // NO_AUTORIZADO tiene texto genérico en el común, pero cada dominio
    // arma el suyo propio con su propio texto — traducirErrorRpc no mezcla
    // los dos diccionarios, así que el texto que gana es siempre el que le
    // pasa el caller.
    expect(diccionario.NO_AUTORIZADO).not.toBe(ERRORES_RPC_COMUNES.NO_AUTORIZADO);
    expect(traducirErrorRpc("NO_AUTORIZADO", diccionario, "default")).toBe(
      "No tenés permiso para cambiar esta venta.",
    );
  });
});
