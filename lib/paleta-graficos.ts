/**
 * Paleta de hasta 10 colores para los gráficos de `/ganancia`: una
 * línea del gráfico de líneas usa
 * `PALETA_GRAFICOS[i % PALETA_GRAFICOS.length]`. Definida en un solo lugar
 * para que ningún componente invente su propio color.
 *
 * Derivada de los tres tokens de marca de Ananja (`app/globals.css`,
 * `:root`): `--color-primary` (oliva, `#2c2f25`), `--color-accent` (bordo,
 * `#7a2e2e`), `--color-mark` (ocre, `#a9762f`). Las variantes claro/oscuro
 * son una mezcla lineal con blanco/negro por canal RGB
 * (`claro = base + (255 − base) × p`, `oscuro = base × 0.75`) —
 * reproducible sin herramienta externa. `p = 0.25` para la mayoría; ver
 * abajo las dos excepciones. Un "claro" ya coincide con un token existente
 * de `app/globals.css` (`--color-primary-hover` = primary claro, mismo hex
 * exacto): se reutiliza en vez de recalcular, para no divergir de un color
 * que ya es visible en el resto de la UI. El resto de las variantes
 * (`accent claro` incluido) son coeficientes calculados con la fórmula de
 * arriba, no tokens — ninguna coincide con `--color-accent-tint-border`
 * (`#b07a72`), que es un hex distinto pensado para tinte/filete de texto,
 * no para esta paleta.
 *
 * Excepciones al `p = 0.25`: `ocre claro` y `neutro` con ese coeficiente
 * (`#BF9863` y `#B6B7A8`, este último igual a `--color-primary-2`) no
 * llegan a 3:1 de contraste contra `--color-background` (`#f4efea`,
 * 2.33:1 y 1.78:1) — insuficiente para texto/leyenda de gráfico (WCAG
 * AA para elementos gráficos, criterio 1.4.11). Se recalcularon con un
 * `p` menor (colores más oscuros, misma familia) hasta superar 3:1:
 * `ocre claro` con `p = 0.05` sobre `--color-mark` (3.19:1) y `neutro`
 * con `p = 0.40` sobre `--color-primary` (3.40:1) — ya no coinciden con
 * ningún token existente. Verificado en `tests/paleta-graficos.test.ts`
 * (contraste ≥ 3:1 de las 10 contra el fondo, y unicidad).
 *
 * Nota para Fran (a confirmar, no asumido): estos 10 hex están derivados
 * de la paleta de **Ananja**. Germá tiene su propia paleta de marca
 * (`#3c3935`/`#b37362`/`#c4a010`, `html[data-negocio="germa"]` en
 * `app/globals.css`) — si en algún momento Germá necesita sus propios
 * colores de gráfico, se resuelve con un segundo array + `NEGOCIO.id`
 * (mismo patrón `ANANJA`/`GERMA` de `lib/negocio.ts`). No se hace acá
 * porque la decisión 4 solo nombró los hex de Ananja.
 */
export const PALETA_GRAFICOS: readonly string[] = [
  "#2C2F25", // primary (oliva)
  "#7A2E2E", // accent (bordo)
  "#A9762F", // mark (ocre)
  "#4C5140", // primary claro (= --color-primary-hover)
  "#9B6262", // accent claro (derivado, no es ningún token existente)
  "#AD7D39", // ocre claro (p = 0.05 sobre mark, no 0.25: 3:1 de contraste)
  "#21231C", // primary oscuro
  "#5C2323", // accent oscuro
  "#7F5923", // ocre oscuro
  "#80827C", // neutro (p = 0.40 sobre primary, no 0.25: 3:1 de contraste)
] as const;
