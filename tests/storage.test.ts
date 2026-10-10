import { describe, expect, it } from "vitest";

import { esPathStorageValido, validarArchivoComprobante } from "@/lib/storage";

/**
 * `esPathStorageValido` (`lib/storage.ts`) — validación de FORMA de un
 * path del bucket de comprobantes (auditoría de seguridad 2026-09-20,
 * `app/api/ocr-monto/route.ts` § rama `imagen_path`): sin `..` ni `/`
 * inicial, con el shape `[carpeta/]AAAA/MM/uuid.ext` que arma
 * `subirComprobante` y una extensión de las que de verdad se suben.
 */
describe("esPathStorageValido", () => {
  it("acepta el shape simple AAAA/MM/uuid.ext", () => {
    expect(
      esPathStorageValido("2026/09/3fa85f64-5717-4562-b3fc-2c963f66afa6.jpg"),
    ).toBe(true);
  });

  it("acepta el shape con carpeta de revendedor", () => {
    expect(
      esPathStorageValido(
        "revendedores/3fa85f64-5717-4562-b3fc-2c963f66afa6/2026/09/3fa85f64-5717-4562-b3fc-2c963f66afa6.pdf",
      ),
    ).toBe(true);
  });

  it("acepta el shape con carpeta de coordinadora (comprobante de depósito)", () => {
    expect(
      esPathStorageValido(
        "coordinadores/3fa85f64-5717-4562-b3fc-2c963f66afa6/2026/10/3fa85f64-5717-4562-b3fc-2c963f66afa6.heic",
      ),
    ).toBe(true);
  });

  it("acepta las extensiones válidas (heic, jpg, png, webp, pdf)", () => {
    for (const ext of ["heic", "jpg", "png", "webp", "pdf"]) {
      expect(esPathStorageValido(`2026/09/uuid.${ext}`)).toBe(true);
    }
  });

  it("rechaza una extensión no soportada", () => {
    expect(esPathStorageValido("2026/09/uuid.exe")).toBe(false);
    expect(esPathStorageValido("2026/09/uuid.svg")).toBe(false);
  });

  it("rechaza path traversal (..)", () => {
    expect(esPathStorageValido("../../etc/passwd")).toBe(false);
    expect(esPathStorageValido("2026/../secretos/uuid.jpg")).toBe(false);
  });

  it("rechaza una barra inicial (path absoluto)", () => {
    expect(esPathStorageValido("/2026/09/uuid.jpg")).toBe(false);
  });

  it("rechaza vacío o null-ish", () => {
    expect(esPathStorageValido("")).toBe(false);
  });

  it("rechaza un path absurdamente largo", () => {
    expect(esPathStorageValido(`${"a".repeat(600)}/uuid.jpg`)).toBe(false);
  });

  it("rechaza segmentos con espacios o caracteres raros", () => {
    expect(esPathStorageValido("2026/09/uuid con espacio.jpg")).toBe(false);
    expect(esPathStorageValido("2026/09/uuid;drop table.jpg")).toBe(false);
  });

  it("es insensible a mayúsculas en la extensión", () => {
    expect(esPathStorageValido("2026/09/uuid.JPG")).toBe(true);
  });
});

/**
 * `validarArchivoComprobante` (`lib/storage.ts`) — el mismo chequeo de
 * tamaño y tipo que hace `subirComprobante`, expuesto para avisar antes de
 * empezar a guardar.
 */
describe("validarArchivoComprobante", () => {
  const archivo = (tipo: string, bytes = 10) =>
    new File([new Uint8Array(bytes)], "comprobante", { type: tipo });

  it("acepta fotos y PDF", () => {
    for (const tipo of ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]) {
      expect(validarArchivoComprobante(archivo(tipo))).toBeNull();
    }
  });

  it("rechaza un tipo no soportado", () => {
    expect(validarArchivoComprobante(archivo("text/plain"))).toMatch(/Formato no soportado/);
  });

  it("rechaza un archivo de más de 10 MB", () => {
    expect(validarArchivoComprobante(archivo("image/jpeg", 10 * 1024 * 1024 + 1))).toMatch(/10 MB/);
  });

  it("acepta justo 10 MB", () => {
    expect(validarArchivoComprobante(archivo("image/jpeg", 10 * 1024 * 1024))).toBeNull();
  });
});
