import { describe, expect, it } from "vitest";

import { decidirVarianteInstalarApp, esDispositivoTactil, esIOS } from "@/lib/instalar-app";

/**
 * `decidirVarianteInstalarApp` (`lib/instalar-app.ts`) — decisión pura de
 * qué variante del banner "Instalá la app" mostrar (o ninguna), extraída de
 * `components/instalar-app-banner.tsx` para poder testearla sin DOM.
 */
describe("decidirVarianteInstalarApp", () => {
  const base = {
    standalone: false,
    hayEventoGuardado: false,
    esIOS: false,
    descartadoHasta: null,
    ahora: 1_000,
  };

  it("ya instalada (standalone) → nada, aunque haya evento o sea iOS", () => {
    expect(decidirVarianteInstalarApp({ ...base, standalone: true })).toBeNull();
    expect(
      decidirVarianteInstalarApp({ ...base, standalone: true, hayEventoGuardado: true }),
    ).toBeNull();
    expect(decidirVarianteInstalarApp({ ...base, standalone: true, esIOS: true })).toBeNull();
  });

  it("descartada y todavía dentro de la ventana de 30 días → nada", () => {
    expect(
      decidirVarianteInstalarApp({
        ...base,
        hayEventoGuardado: true,
        descartadoHasta: 2_000,
        ahora: 1_000,
      }),
    ).toBeNull();
  });

  it("descartada pero la ventana ya venció → vuelve a decidir normalmente", () => {
    expect(
      decidirVarianteInstalarApp({
        ...base,
        hayEventoGuardado: true,
        descartadoHasta: 1_000,
        ahora: 2_000,
      }),
    ).toBe("android");
  });

  it("hay evento beforeinstallprompt guardado → variante android", () => {
    expect(decidirVarianteInstalarApp({ ...base, hayEventoGuardado: true })).toBe("android");
  });

  it("sin evento pero es iOS → variante ios", () => {
    expect(decidirVarianteInstalarApp({ ...base, esIOS: true })).toBe("ios");
  });

  it("evento guardado gana sobre iOS si por algún motivo ambos fueran true", () => {
    expect(
      decidirVarianteInstalarApp({ ...base, hayEventoGuardado: true, esIOS: true }),
    ).toBe("android");
  });

  it("sin evento, no iOS (ej. Firefox/Chrome de escritorio sin el evento) → nada", () => {
    expect(decidirVarianteInstalarApp(base)).toBeNull();
  });
});

/**
 * `esIOS` (`lib/instalar-app.ts`) — recibe la info de plataforma como
 * parámetro (en vez de leer `navigator` adentro) para poder testearla en el
 * entorno `node` de `vitest.config.ts`, sin DOM.
 */
describe("esIOS", () => {
  it("iPhone → true", () => {
    expect(
      esIOS({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("iPad clásico (user agent con iPad) → true", () => {
    expect(
      esIOS({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
        platform: "iPad",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("iPadOS moderno (se reporta como Mac con touch) → true", () => {
    expect(
      esIOS({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("Mac de escritorio real (sin touch) → false", () => {
    expect(
      esIOS({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });

  it("Android → false", () => {
    expect(
      esIOS({
        userAgent: "Mozilla/5.0 (Linux; Android 14)",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });

  it("desktop Chrome/Firefox → false", () => {
    expect(
      esIOS({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        platform: "Win32",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });
});

/**
 * `esDispositivoTactil` (`lib/instalar-app.ts`) — decide si el banner dice
 * "en tu celular" o "en tu compu". Existe aparte de `decidirVarianteInstalarApp`
 * porque Chrome/Edge de escritorio también disparan `beforeinstallprompt`
 * (variante "android"), así que esa variante sola no alcanza para elegir el
 * texto.
 */
describe("esDispositivoTactil", () => {
  it("Android/Chrome con pointer coarse → true (celular)", () => {
    expect(esDispositivoTactil({ pointerCoarse: true, esIOS: false })).toBe(true);
  });

  it("iOS sin pointer coarse → true (celular) — esIOS solo alcanza", () => {
    expect(esDispositivoTactil({ pointerCoarse: false, esIOS: true })).toBe(true);
  });

  it("Chrome/Edge de escritorio, sin pointer coarse ni iOS → false (compu)", () => {
    expect(esDispositivoTactil({ pointerCoarse: false, esIOS: false })).toBe(false);
  });
});
