import { describe, expect, it } from "vitest";
import { parsearTexto } from "@/lib/dominio/texto-material";

/**
 * Espejo de las reglas de "Material de venta" (decisión de diseño de la
 * tanda de material de venta).
 */

describe("parsearTexto", () => {
  it("un párrafo de una sola línea", () => {
    expect(parsearTexto("Hola mundo")).toEqual([
      { tipo: "parrafo", texto: "Hola mundo" },
    ]);
  });

  it("dos párrafos separados por línea en blanco", () => {
    expect(parsearTexto("Primero.\n\nSegundo.")).toEqual([
      { tipo: "parrafo", texto: "Primero." },
      { tipo: "parrafo", texto: "Segundo." },
    ]);
  });

  it("un párrafo de varias líneas seguidas se une con espacio", () => {
    expect(parsearTexto("Línea uno\nLínea dos\nLínea tres")).toEqual([
      { tipo: "parrafo", texto: "Línea uno Línea dos Línea tres" },
    ]);
  });

  it("un subtítulo es su propio bloque", () => {
    expect(parsearTexto("# Título")).toEqual([
      { tipo: "subtitulo", texto: "Título" },
    ]);
  });

  it("un subtítulo entre dos párrafos corta los párrafos aunque no haya línea en blanco alrededor", () => {
    expect(parsearTexto("Antes.\n# En el medio\nDespués.")).toEqual([
      { tipo: "parrafo", texto: "Antes." },
      { tipo: "subtitulo", texto: "En el medio" },
      { tipo: "parrafo", texto: "Después." },
    ]);
  });

  it("una lista de varios ítems seguidos es un solo bloque", () => {
    expect(parsearTexto("- a\n- b\n- c")).toEqual([
      { tipo: "lista", items: ["a", "b", "c"] },
    ]);
  });

  it("una lista de un solo ítem", () => {
    expect(parsearTexto("- único")).toEqual([
      { tipo: "lista", items: ["único"] },
    ]);
  });

  it("mezcla: párrafo, subtítulo, lista y otro párrafo, en orden", () => {
    const cuerpo = [
      "Un párrafo inicial.",
      "",
      "# Un subtítulo",
      "",
      "- primer ítem",
      "- segundo ítem",
      "",
      "Un párrafo final.",
    ].join("\n");

    expect(parsearTexto(cuerpo)).toEqual([
      { tipo: "parrafo", texto: "Un párrafo inicial." },
      { tipo: "subtitulo", texto: "Un subtítulo" },
      { tipo: "lista", items: ["primer ítem", "segundo ítem"] },
      { tipo: "parrafo", texto: "Un párrafo final." },
    ]);
  });

  it("cuerpo vacío o solo espacios/líneas en blanco da un array vacío", () => {
    expect(parsearTexto("")).toEqual([]);
    expect(parsearTexto("   ")).toEqual([]);
    expect(parsearTexto("\n\n\n")).toEqual([]);
  });

  it("espacios sobrantes al principio/final de cada línea se recortan", () => {
    expect(parsearTexto("  - a  \n  - b  ")).toEqual([
      { tipo: "lista", items: ["a", "b"] },
    ]);
    expect(parsearTexto("  # Título   ")).toEqual([
      { tipo: "subtitulo", texto: "Título" },
    ]);
  });

  it("múltiples líneas en blanco seguidas no generan bloques vacíos ni cortan de más un párrafo", () => {
    expect(parsearTexto("Uno.\n\n\n\nDos.")).toEqual([
      { tipo: "parrafo", texto: "Uno." },
      { tipo: "parrafo", texto: "Dos." },
    ]);
  });

  it("# sin espacio después es texto normal, no subtítulo", () => {
    expect(parsearTexto("#Título")).toEqual([
      { tipo: "parrafo", texto: "#Título" },
    ]);
  });
});
