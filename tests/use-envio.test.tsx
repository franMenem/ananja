// @vitest-environment jsdom
// Máquina de estados del envío de un formulario (components/ui/use-ultimo().ts).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { useEnvio } from "@/components/ui/use-envio";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Envio = ReturnType<typeof useEnvio>;
const sonda: { actual: Envio | null } = { actual: null };
function Sonda({ alRenderizar }: { alRenderizar: (e: Envio) => void }) {
  const e = useEnvio();
  alRenderizar(e);
  return null;
}
const ultimo = () => sonda.actual!;

let root: Root | null = null;
async function montar() {
  const el = document.createElement("div");
  root = createRoot(el);
  await act(async () => {
    root!.render(<Sonda alRenderizar={(e) => (sonda.actual = e)} />);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe("useEnvio", () => {
  it("arranca quieto y sin ocupado", async () => {
    await montar();
    expect(ultimo().estado).toBe("quieto");
    expect(ultimo().ocupado).toBe(false);
  });

  it("empezar() pasa a enviando y es un candado síncrono: el segundo llamado en el mismo tick devuelve false", async () => {
    await montar();
    let primero = false;
    let segundo = true;
    await act(async () => {
      primero = ultimo().empezar();
      segundo = ultimo().empezar();
    });
    expect(primero).toBe(true);
    expect(segundo).toBe(false);
    expect(ultimo().estado).toBe("enviando");
    expect(ultimo().ocupado).toBe(true);
  });

  it("liberar() vuelve a quieto y permite reintentar", async () => {
    await montar();
    await act(async () => {
      ultimo().empezar();
    });
    await act(async () => {
      ultimo().liberar();
    });
    expect(ultimo().estado).toBe("quieto");
    let otra = false;
    await act(async () => {
      otra = ultimo().empezar();
    });
    expect(otra).toBe(true);
  });

  it("completar() deja enviado: sigue ocupado y liberar() (p. ej. en un finally) no lo reactiva", async () => {
    await montar();
    await act(async () => {
      ultimo().empezar();
      ultimo().completar();
      ultimo().liberar();
    });
    expect(ultimo().estado).toBe("enviado");
    expect(ultimo().ocupado).toBe(true);
    let otra = true;
    await act(async () => {
      otra = ultimo().empezar();
    });
    expect(otra).toBe(false);
  });

  it("completar() sin haber empezado no hace nada", async () => {
    await montar();
    await act(async () => {
      ultimo().completar();
    });
    expect(ultimo().estado).toBe("quieto");
  });
});
