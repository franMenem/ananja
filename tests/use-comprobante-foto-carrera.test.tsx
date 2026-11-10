// @vitest-environment jsdom
//
// Bug: `uploadFile` no tenía guardia de secuencia: subir A (lento), elegir B,
// terminar B y después A dejaba la ruta de A con la vista previa de B.
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const subidas: { file: File; resolve: (p: string) => void; reject: (e: Error) => void }[] = [];
vi.mock("@/lib/storage", () => ({
  getSignedUrl: async () => null,
  subirComprobante: (file: File) =>
    new Promise<string>((resolve, reject) => subidas.push({ file, resolve, reject })),
}));

import { useComprobanteFoto, type UseComprobanteFotoResult } from "@/components/comprobante-form/use-comprobante-foto";
import { SeccionFoto } from "@/components/comprobante-form/seccion-foto";

let seq = 0;
const ocr = { prepararNuevoArchivo: () => ++seq, runOcr: async () => {} };

const ultimo: { actual: UseComprobanteFotoResult | null } = { actual: null };
function Harness() {
  const r = useComprobanteFoto(null, ocr);
  useEffect(() => {
    ultimo.actual = r;
  });
  return null;
}
const hook = new Proxy({} as UseComprobanteFotoResult, {
  get: (_t, k) => ultimo.actual![k as keyof UseComprobanteFotoResult],
});

let mounted: { root: Root; container: HTMLDivElement }[] = [];
afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  subidas.length = 0;
});

function montar() {
  const container = document.createElement("div");
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(<Harness />));
}

function elegir(nombre: string) {
  const file = new File(["x"], nombre, { type: "image/png" });
  act(() => {
    hook.handleFileChange({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>);
  });
}

describe("useComprobanteFoto: subidas superpuestas", () => {
  beforeEachUrl();

  it("si termina B y después A, queda la ruta de B (la del archivo que se ve)", async () => {
    montar();
    elegir("a.png");
    elegir("b.png");
    await act(async () => subidas[1].resolve("ruta/b.png"));
    expect(hook.imagenPath).toBe("ruta/b.png");
    await act(async () => subidas[0].resolve("ruta/a.png"));
    expect(hook.imagenPath).toBe("ruta/b.png");
    expect(hook.fileName).toBe("b.png");
  });

  it("el error tardío de una subida vieja no pisa la subida vigente", async () => {
    montar();
    elegir("a.png");
    elegir("b.png");
    await act(async () => subidas[1].resolve("ruta/b.png"));
    await act(async () => subidas[0].reject(new Error("falló A")));
    expect(hook.imagenPath).toBe("ruta/b.png");
    expect(hook.uploadError).toBeNull();
  });

  it("uploading sigue true hasta que termina la subida vigente", async () => {
    montar();
    elegir("a.png");
    elegir("b.png");
    await act(async () => subidas[0].resolve("ruta/a.png"));
    expect(hook.uploading).toBe(true);
    await act(async () => subidas[1].resolve("ruta/b.png"));
    expect(hook.uploading).toBe(false);
  });
});

describe("SeccionFoto", () => {
  it("deshabilita Sacar foto y Subir archivo mientras sube", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    mounted.push({ root, container });
    act(() =>
      root.render(
        <SeccionFoto
          cameraInputRef={{ current: null }}
          fileInputRef={{ current: null }}
          previewUrl={null}
          previewIsPdf={false}
          fileName={null}
          uploading
          uploadError={null}
          onFileChange={() => {}}
          onRetryUpload={() => {}}
        />,
      ),
    );
    const botones = [...container.querySelectorAll("button")].filter((b) =>
      ["Sacar foto", "Subir archivo"].includes(b.textContent ?? ""),
    );
    expect(botones).toHaveLength(2);
    expect(botones.every((b) => b.disabled)).toBe(true);
  });
});

function beforeEachUrl() {
  // jsdom no implementa createObjectURL/revokeObjectURL.
  URL.createObjectURL = () => "blob:x";
  URL.revokeObjectURL = () => {};
}
