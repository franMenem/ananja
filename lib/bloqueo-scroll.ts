/**
 * Bloqueo del scroll del fondo mientras hay una hoja modal abierta.
 *
 * En esta app scrollea el DOCUMENTO (el `<html>` es `h-dvh` y `<main>` crece
 * con su contenido, así que nunca desborda por su cuenta), tanto en celular
 * como en escritorio con rail. Por eso el bloqueo es `overflow: hidden` en
 * `<html>` y `<body>`: es la técnica menos invasiva (no mueve el body con
 * `position: fixed`, así que no hay salto de scroll ni problemas con la barra
 * de direcciones o `100vh`, y no hace falta ningún `touchmove`).
 *
 * Es un contador: se bloquea al abrir la primera hoja y se libera al cerrar
 * la última. Se restauran exactamente los valores en línea que había antes.
 * En escritorio, al desaparecer la barra de scroll la página se ensancharía:
 * se compensa con `padding-right` igual al ancho de esa barra.
 */

type Entorno = {
  documentElement: HTMLElement;
  body: HTMLElement;
  defaultView: Window | null;
};

type Previo = { overflow: string; paddingRight: string };

export type BloqueoScroll = {
  /** Pide el bloqueo; devuelve la función que lo libera (idempotente). */
  bloquear(): () => void;
  /** Cuántas hojas lo están pidiendo ahora. */
  readonly activos: number;
};

export function crearBloqueoScroll(doc?: Entorno): BloqueoScroll {
  let activos = 0;
  let guardado: { html: Previo; body: Previo } | null = null;

  const entorno = () => doc ?? (document as Entorno);

  function aplicar() {
    const { documentElement: html, body, defaultView } = entorno();
    guardado = {
      html: { overflow: html.style.overflow, paddingRight: html.style.paddingRight },
      body: { overflow: body.style.overflow, paddingRight: body.style.paddingRight },
    };
    // Se mide ANTES de ocultar el overflow: es el ancho de la barra de scroll.
    const barra = defaultView ? Math.max(0, defaultView.innerWidth - html.clientWidth) : 0;
    if (barra > 0 && defaultView) {
      const actual = parseFloat(defaultView.getComputedStyle(html).paddingRight) || 0;
      html.style.paddingRight = `${actual + barra}px`;
    }
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
  }

  function liberar() {
    if (!guardado) return;
    const { documentElement: html, body } = entorno();
    html.style.overflow = guardado.html.overflow;
    html.style.paddingRight = guardado.html.paddingRight;
    body.style.overflow = guardado.body.overflow;
    body.style.paddingRight = guardado.body.paddingRight;
    guardado = null;
  }

  return {
    bloquear() {
      if (activos === 0) aplicar();
      activos += 1;
      let liberada = false;
      return () => {
        if (liberada) return;
        liberada = true;
        activos -= 1;
        if (activos === 0) liberar();
      };
    },
    get activos() {
      return activos;
    },
  };
}

/** Instancia compartida por todas las hojas de la página. */
export const bloqueoScroll = crearBloqueoScroll();
