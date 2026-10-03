/**
 * Configuración del negocio activo — única fuente de verdad para todo lo
 * que cambia entre los dos deploys de este mismo repo:
 *
 * - Ananja (aceite de oliva, `public`/`comprobantes`, presentaciones en ml,
 *   envase "botella") — deploy actual, default si la env var no está.
 * - Germá (miel, schema `miel`/bucket `comprobantes-miel`, presentaciones
 *   en gramos/kg, envase "frasco") — segundo deploy, mismo proyecto de
 *   Supabase.
 *
 * Se elige con `NEXT_PUBLIC_NEGOCIO` (`ananja` | `germa`, default `ananja`).
 * Se lee `process.env.NEXT_PUBLIC_NEGOCIO` con el literal exacto (no una
 * variable intermedia) para que Next.js pueda inline-arlo en el bundle del
 * cliente — ver "Environment Variables" en las docs de Next empaquetadas
 * en este repo.
 */

export type NegocioId = "ananja" | "germa";

type EnvaseConfig = {
  singular: string;
  plural: string;
  /** Género gramatical del envase — para concordar adjetivos ("cuántas
   * botellas"/"cuántos frascos", "vendidas"/"vendidos"), ver {@link concordar}. */
  genero: "m" | "f";
};

type MateriaPrimaConfig = {
  /** Nombre de la materia prima, minúscula, para prosa ("el aceite", "la miel"). */
  nombre: string;
  /** Unidad de compra/venta de la materia prima — litro para Ananja, kilo para Germá. */
  unidad: "litro" | "kilo";
};

export type NegocioConfig = {
  id: NegocioId;
  /** Nombre completo, para copy en prosa ("para Ananja (aceite de oliva)"). */
  nombre: string;
  /** Wordmark en mayúsculas del rail/header/auth ("ANANJA" / "GERMÁ"). */
  wordmark: string;
  /** Tagline de la pantalla de login. */
  tagline: string;
  /** Subtítulo del rail de escritorio, debajo del wordmark. */
  subtitulo: string;
  /** Ubicación mostrada en auth y en el header móvil — igual en ambos. */
  lugar: string;
  /** Descripción larga para <meta name="description"> y el manifest. */
  descripcion: string;
  /** Schema Postgres de este negocio dentro del mismo proyecto Supabase. */
  schema: "public" | "miel";
  /** Bucket de Supabase Storage para los comprobantes de este negocio. */
  bucket: "comprobantes" | "comprobantes-miel";
  /** Unidad de las presentaciones de producto. */
  unidad: "ml" | "g";
  /** Envase en el que se vende el producto (singular/plural). */
  envase: EnvaseConfig;
  /** Materia prima con la que se calcula el costo en la sección Precios. */
  materiaPrima: MateriaPrimaConfig;
  /** Prefijo de `public/icons` de donde salen los íconos de este negocio. */
  iconos: string;
  /**
   * Solo los colores que necesitan `app/manifest.ts` / `viewport.themeColor`
   * (que son metadata, no CSS, y no pueden leer variables CSS). La paleta
   * completa de Germá vive en `app/globals.css`
   * (`html[data-negocio="germa"] { ... }`) — no hay forma de compartir los
   * ~19 tokens de color entre CSS y TypeScript sin un paso de build
   * adicional (un preprocesador que lea un JSON común, por ejemplo), así
   * que CSS queda como fuente única de la paleta completa y acá solo se
   * duplican los dos valores que la metadata de la plataforma exige.
   * Mantenelos en sync a mano con el bloque `@theme` / `[data-negocio]` de
   * `app/globals.css` si cambia la paleta de Germá.
   */
  colores: {
    primary: string;
    background: string;
  };
};

const ANANJA: NegocioConfig = {
  id: "ananja",
  nombre: "Ananja",
  wordmark: "ANANJA",
  tagline: "Aceite de oliva virgen extra de un olivo de cuatrocientos años.",
  subtitulo: "Aceite de oliva virgen extra",
  lugar: "Aimogasta · La Rioja",
  descripcion:
    "Gestión de stock, comprobantes de pago y caja para Ananja (aceite de oliva).",
  schema: "public",
  bucket: "comprobantes",
  unidad: "ml",
  envase: { singular: "botella", plural: "botellas", genero: "f" },
  materiaPrima: { nombre: "aceite", unidad: "litro" },
  iconos: "/icons",
  colores: {
    primary: "#2c2f25",
    background: "#f4efea",
  },
};

const GERMA: NegocioConfig = {
  id: "germa",
  nombre: "Germá",
  wordmark: "GERMÁ",
  tagline: "La miel ya es perfecta, solo hay que cuidarla.",
  subtitulo: "Miel pura de abejas",
  lugar: "Lobos · Buenos Aires",
  descripcion: "Gestión de stock, comprobantes de pago y caja para Germá (miel).",
  schema: "miel",
  bucket: "comprobantes-miel",
  unidad: "g",
  envase: { singular: "frasco", plural: "frascos", genero: "m" },
  materiaPrima: { nombre: "miel", unidad: "kilo" },
  iconos: "/icons/germa",
  colores: {
    primary: "#3C3935",
    background: "#F0EEED",
  },
};

const NEGOCIOS: Record<NegocioId, NegocioConfig> = {
  ananja: ANANJA,
  germa: GERMA,
};

function resolveNegocioId(): NegocioId {
  // Literal exacto (no una constante intermedia) para que Next.js pueda
  // reemplazarlo estáticamente en el bundle del cliente.
  return process.env.NEXT_PUBLIC_NEGOCIO === "germa" ? "germa" : "ananja";
}

/** Negocio activo de este deploy — resuelto una sola vez al cargar el módulo. */
export const NEGOCIO: NegocioConfig = NEGOCIOS[resolveNegocioId()];

/**
 * Formatea una presentación de producto según la unidad del negocio.
 * Aceite (ml): `250` → "250 ml". Miel (g): `500` → "500 g",
 * `1000` → "1 kg" (solo si es múltiplo exacto de 1000; `1500` → "1500 g").
 * `null`/`undefined` → "?", igual al placeholder ya usado en toda la app
 * para presentaciones sin resolver.
 *
 * Recibe `negocio` como parámetro (default `NEGOCIO`) para poder testear
 * ambos negocios sin depender de la env var.
 */
export function formatPresentacion(
  n: number | null | undefined,
  negocio: Pick<NegocioConfig, "unidad"> = NEGOCIO,
): string {
  if (n === null || n === undefined) return "?";
  if (negocio.unidad === "g" && n >= 1000 && n % 1000 === 0) {
    return `${n / 1000} kg`;
  }
  return `${n} ${negocio.unidad}`;
}

/**
 * "20×500 ml + 10×500 ml" → "30×500 ml": agrupa cantidades por
 * presentación antes de formatearlas y ordena de mayor a menor presentación.
 * Un mismo producto puede aparecer en varias filas de
 * `comprobante_items`/`entrega_items` cuando salen de lotes distintos
 * (`lote_id`, ver supabase/migrations/0028_costos_por_lote.sql) — sin este
 * agrupado, un resumen (dashboard, listados) mostraría el mismo producto
 * duplicado en vez de sumarlo. Antes duplicada como `formatCantidades`/
 * `formatCantidadesItems` en `/`, `/comprobantes` y `/clientes/[id]`.
 */
export function formatCantidadesPorPresentacion(
  items: { cantidad: number; productos: { presentacion_ml: number | null } | null }[],
  negocio: Pick<NegocioConfig, "unidad"> = NEGOCIO,
): string {
  const porPresentacion = new Map<number, number>();
  for (const item of items) {
    const ml = item.productos?.presentacion_ml ?? 0;
    porPresentacion.set(ml, (porPresentacion.get(ml) ?? 0) + item.cantidad);
  }
  return [...porPresentacion.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ml, cantidad]) => `${cantidad}×${formatPresentacion(ml || null, negocio)}`)
    .join(" + ");
}

/** Singular o plural del envase del negocio, según la cantidad `n`. */
export function envase(
  n: number,
  negocio: Pick<NegocioConfig, "envase"> = NEGOCIO,
): string {
  return n === 1 ? negocio.envase.singular : negocio.envase.plural;
}

/** Primera letra en mayúscula — p. ej. para "Frascos del mes". */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Concuerda un adjetivo/pronombre en género con el envase del negocio —
 * p. ej. `concordar("vendidos", "vendidas")` da "vendidas" en Ananja
 * (botella, femenino) y "vendidos" en Germá (frasco, masculino); también
 * sirve para "cuántos"/"cuántas".
 */
export function concordar(
  masculino: string,
  femenino: string,
  negocio: Pick<NegocioConfig, "envase"> = NEGOCIO,
): string {
  return negocio.envase.genero === "f" ? femenino : masculino;
}
