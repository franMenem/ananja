import { describe, expect, it } from "vitest";

import { intercambiarOrden, siguienteOrden } from "@/lib/dominio/material";

/**
 * `siguienteOrden` e `intercambiarOrden` son las piezas puras detrás de
 * `/material/nuevo` y `moverMaterial` (`lib/material.ts`). Cubren el bug
 * original: `siguienteOrden = materiales.length` colisionaba con los
 * seeds (orden 1,2,3 → la primera pieza nueva recibía `orden=3`) y
 * dejaba "Subir" como no-op porque el swap intercambiaba dos filas con
 * el mismo valor.
 */
describe("siguienteOrden", () => {
  it("sin materiales, devuelve 1", () => {
    expect(siguienteOrden([])).toBe(1);
  });

  it("con [1,2,3], devuelve 4 (max + 1, no length + 1)", () => {
    expect(siguienteOrden([{ orden: 1 }, { orden: 2 }, { orden: 3 }])).toBe(4);
  });

  it("no colisiona aunque falten piezas intermedias (huecos en el orden)", () => {
    expect(siguienteOrden([{ orden: 1 }, { orden: 5 }])).toBe(6);
  });
});

describe("intercambiarOrden", () => {
  it("subir: intercambia el orden con el vecino de arriba", () => {
    const materiales = [
      { id: "a", orden: 1 },
      { id: "b", orden: 2 },
      { id: "c", orden: 3 },
    ];
    expect(intercambiarOrden(materiales, 1, "subir")).toEqual([
      { id: "b", orden: 1 },
      { id: "a", orden: 2 },
    ]);
  });

  it("bajar: intercambia el orden con el vecino de abajo", () => {
    const materiales = [
      { id: "a", orden: 1 },
      { id: "b", orden: 2 },
      { id: "c", orden: 3 },
    ];
    expect(intercambiarOrden(materiales, 1, "bajar")).toEqual([
      { id: "b", orden: 3 },
      { id: "c", orden: 2 },
    ]);
  });

  it("no-op al subir la primera fila", () => {
    const materiales = [
      { id: "a", orden: 1 },
      { id: "b", orden: 2 },
    ];
    expect(intercambiarOrden(materiales, 0, "subir")).toBeNull();
  });

  it("no-op al bajar la última fila", () => {
    const materiales = [
      { id: "a", orden: 1 },
      { id: "b", orden: 2 },
    ];
    expect(intercambiarOrden(materiales, 1, "bajar")).toBeNull();
  });

  it("no-op con índice fuera de rango", () => {
    const materiales = [{ id: "a", orden: 1 }];
    expect(intercambiarOrden(materiales, 5, "subir")).toBeNull();
    expect(intercambiarOrden(materiales, -1, "bajar")).toBeNull();
  });

  it("seeds [1,2,3] + nuevo con orden=3 (colisión): subir el nuevo deja órdenes distintos y al nuevo por encima del tercero", () => {
    // Estado tras el bug: "c" es un seed (orden=3) y "d" es la pieza
    // nueva creada después, con el mismo orden=3 (por eso ordena después
    // de "c" al desempatar por created_at). El admin aprieta "Subir" en
    // "d" (índice 3, vecino "c" en el índice 2).
    const materiales = [
      { id: "a", orden: 1 },
      { id: "b", orden: 2 },
      { id: "c", orden: 3 },
      { id: "d", orden: 3 },
    ];

    const updates = intercambiarOrden(materiales, 3, "subir");
    expect(updates).not.toBeNull();
    const [filaMovida, vecino] = updates!;

    expect(filaMovida.id).toBe("d");
    expect(vecino.id).toBe("c");
    // La corrección central: ya no quedan empatadas...
    expect(filaMovida.orden).not.toBe(vecino.orden);
    // ...y "d" (la que subió) queda por encima de "c" en el nuevo orden.
    expect(filaMovida.orden).toBeLessThan(vecino.orden);
  });

  it("seeds [1,2,3] + nuevo con orden=3 (colisión): bajar el seed empatado deja órdenes distintos y al nuevo por encima", () => {
    // Mismo estado, pero ahora el admin aprieta "Bajar" en "c" (índice 2,
    // vecino "d" en el índice 3) — debe llegar al mismo resultado relativo:
    // "d" queda por encima de "c".
    const materiales = [
      { id: "a", orden: 1 },
      { id: "b", orden: 2 },
      { id: "c", orden: 3 },
      { id: "d", orden: 3 },
    ];

    const updates = intercambiarOrden(materiales, 2, "bajar");
    expect(updates).not.toBeNull();
    const [filaMovida, vecino] = updates!;

    expect(filaMovida.id).toBe("c");
    expect(vecino.id).toBe("d");
    expect(filaMovida.orden).not.toBe(vecino.orden);
    expect(vecino.orden).toBeLessThan(filaMovida.orden);
  });
});
