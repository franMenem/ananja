import type { Material } from "@/lib/data/material";

export type Direccion = "subir" | "bajar";

export type OrdenUpdate = { id: string; orden: number };

/**
 * Próximo `orden` a asignar en modo alta: `max(orden) + 1` (1 si no hay
 * piezas). Antes se usaba `materiales.length`, que colisiona apenas los
 * seeds no arrancan en 1 sin huecos o hay materiales borrados — la
 * primera pieza creada quedaba con el mismo `orden` que una existente, y
 * "Subir" quedaba como no-op (`intercambiarOrden` swappea dos filas con
 * el mismo valor). `max + 1` no puede colisionar.
 */
export function siguienteOrden(materiales: { orden: number }[]): number {
  if (materiales.length === 0) return 1;
  return Math.max(...materiales.map((m) => m.orden)) + 1;
}

/**
 * Calcula los updates `{id, orden}` para mover la fila en `indice` (de
 * `materiales`, ya ordenada con `ordenarMateriales`) un lugar en la
 * dirección pedida. `null` si no hay vecino en esa dirección (extremo).
 *
 * Caso normal (`orden` distinto): swap de valores, como antes.
 *
 * Caso `orden` empatado (ej. un material nuevo creado con el mismo
 * `orden` que su vecino — el bug que esta función corrige): un swap
 * literal no cambia nada, porque ambas filas ya tienen el mismo valor.
 * En ese caso la fila que se mueve toma el `orden` del vecino (como en
 * el swap normal) y el vecino se corre un lugar en la dirección
 * contraria (`+1` si "subir", `-1` si "bajar"), así el `orden` numérico
 * queda distinto y refleja el nuevo posicionamiento sin depender del
 * desempate por `created_at`.
 */
export function intercambiarOrden(
  materiales: Pick<Material, "id" | "orden">[],
  indice: number,
  direccion: Direccion,
): [OrdenUpdate, OrdenUpdate] | null {
  if (indice < 0 || indice >= materiales.length) return null;

  const vecinoIndice = direccion === "subir" ? indice - 1 : indice + 1;
  if (vecinoIndice < 0 || vecinoIndice >= materiales.length) return null;

  const actual = materiales[indice];
  const vecino = materiales[vecinoIndice];

  if (actual.orden !== vecino.orden) {
    return [
      { id: actual.id, orden: vecino.orden },
      { id: vecino.id, orden: actual.orden },
    ];
  }

  const delta = direccion === "subir" ? 1 : -1;
  return [
    { id: actual.id, orden: vecino.orden },
    { id: vecino.id, orden: vecino.orden + delta },
  ];
}
