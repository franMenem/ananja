/**
 * Lógica de "Instalá la app" (`components/instalar-app-banner.tsx`):
 * detección de plataforma/standalone y la decisión pura de qué variante del
 * aviso mostrar — separada del componente para poder testearla sin DOM
 * (`vitest.config.ts` corre en entorno `node`, sin `window`/`navigator`).
 */

/** Igual a la de `components/notificaciones-banner.tsx` (única fuente
 * ahora) — `matchMedia` de escritorio/Android o `navigator.standalone` de
 * iOS, ambos solo existen en el cliente. */
export function esStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const navegadorIOSLegacy = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    navegadorIOSLegacy.standalone === true
  );
}

/** Lee `matchMedia("(pointer: coarse)")` — solo existe en el cliente. Es la
 * señal de "input primario touch" para Chrome/Edge/Android; iOS se detecta
 * aparte con `esIOS` (Safari no siempre reporta `pointer: coarse`). */
export function esPointerCoarse(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches === true;
}

export type PlataformaInfo = {
  userAgent: string;
  /** Deprecado en el estándar pero es la única forma de distinguir
   * iPadOS, que desde iOS 13 reporta un user agent de escritorio Mac. */
  platform: string;
  maxTouchPoints: number;
};

/** Lee `navigator` una sola vez — `undefined` en SSR. */
export function leerPlataformaActual(): PlataformaInfo {
  if (typeof navigator === "undefined") {
    return { userAgent: "", platform: "", maxTouchPoints: 0 };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  };
}

/** iPhone/iPod, iPad "clásico", o iPad con iPadOS ≥13 (que se reporta como
 * `MacIntel` con soporte táctil — un Mac de escritorio real no tiene
 * `maxTouchPoints > 1`). Safari de iOS no dispara `beforeinstallprompt`, así
 * que es la única forma de ofrecerle instalación a estos navegadores. */
export function esIOS(info: PlataformaInfo = leerPlataformaActual()): boolean {
  const esIPhoneOIPod = /iPhone|iPod/.test(info.userAgent);
  const esIPadClasico = /iPad/.test(info.userAgent);
  const esIPadOSComoMac = info.platform === "MacIntel" && info.maxTouchPoints > 1;
  return esIPhoneOIPod || esIPadClasico || esIPadOSComoMac;
}

/**
 * Decisión pura de si el texto del banner debe decir "en tu celular" o "en
 * tu compu". Hace falta separada de `decidirVarianteInstalarApp`: Chrome y
 * Edge de escritorio también disparan `beforeinstallprompt` (los admins de
 * Ananja usan la app ahí), así que la variante "android" sola no alcanza
 * para saber qué texto mostrar.
 */
export function esDispositivoTactil(params: { pointerCoarse: boolean; esIOS: boolean }): boolean {
  return params.pointerCoarse || params.esIOS;
}

const DESCARTADO_STORAGE_KEY = "instalar-app-descartado-hasta";
const DESCARTADO_DURACION_MS = 30 * 24 * 60 * 60 * 1000;

/** `timestamp` (ms) hasta el que el banner debe seguir oculto por haber
 * tocado "Ahora no", o `null` si nunca se descartó (o `localStorage` no
 * está disponible, ej. Safari en modo privado). */
export function leerInstalarAppDescartadoHasta(): number | null {
  try {
    const raw = localStorage.getItem(DESCARTADO_STORAGE_KEY);
    if (!raw) return null;
    const valor = Number(raw);
    return Number.isFinite(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** Guarda el descarte por `DESCARTADO_DURACION_MS` (30 días) desde `ahora`. */
export function guardarInstalarAppDescartado(ahora: number = Date.now()): void {
  try {
    localStorage.setItem(DESCARTADO_STORAGE_KEY, String(ahora + DESCARTADO_DURACION_MS));
  } catch {
    // localStorage no disponible — el banner simplemente puede volver a
    // aparecer en la próxima visita, no es grave.
  }
}

export type VarianteInstalarApp = "android" | "ios";

/**
 * Decisión pura de qué variante del banner mostrar (o ninguna):
 *  1. Ya instalada (standalone) → nunca.
 *  2. Descartada y todavía dentro de la ventana de 30 días → nunca.
 *  3. Hay un evento `beforeinstallprompt` guardado (Chrome/Edge/Android) →
 *     variante "android" (botón que llama a `prompt()`).
 *  4. Si no, pero es iOS (Safari no dispara ese evento) → variante "ios"
 *     (botón que muestra las instrucciones de "Compartir → Agregar a
 *     inicio").
 *  5. Cualquier otro caso (ej. Firefox de escritorio, o Chrome de
 *     escritorio antes de que dispare el evento) → nunca.
 */
export function decidirVarianteInstalarApp(params: {
  standalone: boolean;
  hayEventoGuardado: boolean;
  esIOS: boolean;
  descartadoHasta: number | null;
  ahora: number;
}): VarianteInstalarApp | null {
  if (params.standalone) return null;
  if (params.descartadoHasta !== null && params.ahora < params.descartadoHasta) return null;
  if (params.hayEventoGuardado) return "android";
  if (params.esIOS) return "ios";
  return null;
}
