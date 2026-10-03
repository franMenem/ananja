/**
 * Parser de "Material de venta": texto plano con tres reglas
 * mínimas, sin ninguna librería de Markdown. Función pura, sin
 * dependencias de React ni de Supabase, para poder testearla aislada.
 */

export type Bloque =
  | { tipo: "parrafo"; texto: string }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "lista"; items: string[] };

/**
 * Reglas (procesadas línea por línea, cada línea recortada con `trim`
 * antes de evaluarla):
 * - Línea vacía: separador — cierra cualquier párrafo o lista en curso.
 * - Línea que empieza con "# ": cierra cualquier bloque en curso y se
 *   convierte, ella sola, en un bloque `subtitulo` (texto = lo que sigue
 *   a "# ", recortado).
 * - Línea que empieza con "- ": cierra un párrafo en curso (si lo había)
 *   y se agrega como ítem de la lista en curso (se abre una si no
 *   había); el ítem es lo que sigue a "- ", recortado.
 * - Cualquier otra línea no vacía: cierra una lista en curso (si la
 *   había) y se agrega como una línea más del párrafo en curso (se abre
 *   uno si no había); las líneas de un mismo párrafo se unen con un
 *   espacio en el texto final.
 * - Al terminar, se cierra cualquier párrafo/lista que haya quedado
 *   abierto. Cuerpo vacío o solo líneas en blanco → [].
 */
export function parsearTexto(cuerpo: string): Bloque[] {
  const bloques: Bloque[] = [];
  let parrafoActual: string[] = [];
  let listaActual: string[] = [];

  function cerrarParrafo() {
    if (parrafoActual.length > 0) {
      bloques.push({ tipo: "parrafo", texto: parrafoActual.join(" ") });
      parrafoActual = [];
    }
  }

  function cerrarLista() {
    if (listaActual.length > 0) {
      bloques.push({ tipo: "lista", items: [...listaActual] });
      listaActual = [];
    }
  }

  for (const lineaCruda of cuerpo.split("\n")) {
    const linea = lineaCruda.trim();

    if (linea === "") {
      cerrarParrafo();
      cerrarLista();
      continue;
    }

    if (linea.startsWith("# ")) {
      cerrarParrafo();
      cerrarLista();
      bloques.push({ tipo: "subtitulo", texto: linea.slice(2).trim() });
      continue;
    }

    if (linea.startsWith("- ")) {
      cerrarParrafo();
      listaActual.push(linea.slice(2).trim());
      continue;
    }

    cerrarLista();
    parrafoActual.push(linea);
  }

  cerrarParrafo();
  cerrarLista();

  return bloques;
}
