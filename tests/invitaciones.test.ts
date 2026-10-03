import { describe, expect, it } from "vitest";

import {
  destinoPorRol,
  esInvitacionPendiente,
  esTipoOtp,
  FLAG_MUST_CHANGE_PASSWORD,
  flagCuentaActivo,
  mensajeErrorAuth,
  mensajeErrorPassword,
  modoReenvio,
  negocioDeUsuario,
  nextPorDefecto,
  normalizarNext,
  puedeCancelarInvitacion,
  resolverUrlSitio,
  validarAsignacionInicial,
  validarDatosInvitacion,
  validarPassword,
} from "@/lib/dominio/invitaciones";
import {
  ALFABETO_PASSWORD_TEMPORAL,
  esTemporalSinUsar,
  generarPasswordTemporal,
  MARCA_ALTA,
  mensajeCuentaTemporal,
  mensajeErrorRecuperacion,
  PASSWORD_MIN_LENGTH,
  sugiereCuentaTemporal,
  textosConfirmacion,
} from "@/lib/dominio/invitaciones";

describe("mensajeErrorRecuperacion (olvidé mi contraseña, neutro)", () => {
  it("límite por persona (solo existe para emails reales) se trata como éxito", () => {
    expect(mensajeErrorRecuperacion({ code: "over_email_send_rate_limit", status: 429 })).toBeNull();
  });

  it("sin error o errores 4xx comunes → éxito neutro", () => {
    expect(mensajeErrorRecuperacion(null)).toBeNull();
    expect(mensajeErrorRecuperacion({ code: "user_not_found", status: 404 })).toBeNull();
    expect(mensajeErrorRecuperacion({ code: "validation_failed", status: 400 })).toBeNull();
  });

  it("429 genérico o error del servidor → mensaje neutro", () => {
    expect(mensajeErrorRecuperacion({ code: "over_request_rate_limit", status: 429 })).toMatch(/Esperá/);
    expect(mensajeErrorRecuperacion({ status: 429 })).toMatch(/Esperá/);
    expect(mensajeErrorRecuperacion({ status: 500, message: "Error sending recovery email" })).toMatch(
      /No pudimos procesar/,
    );
    expect(mensajeErrorRecuperacion({ status: 503 })).not.toMatch(/email|cuenta/i);
  });
});

describe("esTemporalSinUsar", () => {
  const marca = { [MARCA_ALTA.clave]: MARCA_ALTA.valor };

  it("solo cuentas creadas desde Sumar persona, con contraseña temporal y sin ingresar", () => {
    expect(
      esTemporalSinUsar({ app_metadata: marca, user_metadata: { must_change_password: true } }),
    ).toBe(true);
    expect(
      esTemporalSinUsar({
        app_metadata: marca,
        user_metadata: { must_change_password: true },
        last_sign_in_at: "2026-09-15T10:00:00Z",
      }),
    ).toBe(false);
  });

  it("nunca una cuenta creada a mano (sin marca en app_metadata), aunque tenga el flag", () => {
    expect(esTemporalSinUsar({ user_metadata: { must_change_password: true } })).toBe(false);
    expect(
      esTemporalSinUsar({ app_metadata: {}, user_metadata: { must_change_password: true, ...marca } }),
    ).toBe(false);
  });

  it("también cuenta si must_change_password está en app_metadata (código nuevo, createUser en un solo paso)", () => {
    expect(esTemporalSinUsar({ app_metadata: { ...marca, must_change_password: true } })).toBe(true);
  });
});

describe("textosConfirmacion", () => {
  it("texto según el tipo de link", () => {
    expect(textosConfirmacion("invite").titulo).toMatch(/invitación/);
    expect(textosConfirmacion("recovery").titulo).toMatch(/contraseña/);
    expect(textosConfirmacion(null).boton).toBe("Continuar");
  });
});
import { redireccionPorMetadata } from "@/lib/supabase/middleware";

describe("generarPasswordTemporal", () => {
  it("formato xxxx-xxxx-xxxx, supera el mínimo de largo", () => {
    for (let i = 0; i < 200; i++) {
      const p = generarPasswordTemporal();
      expect(p).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
      expect(p.length).toBe(14);
      expect(p.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH);
    }
  });

  it("sin caracteres ambiguos (0 O o 1 l I i) ni mayúsculas", () => {
    const muestra = Array.from({ length: 500 }, () => generarPasswordTemporal()).join("");
    expect(muestra).not.toMatch(/[0O1lIio]/);
    expect(muestra).not.toMatch(/[A-Z]/);
    for (const c of muestra.replaceAll("-", "")) {
      expect(ALFABETO_PASSWORD_TEMPORAL).toContain(c);
    }
  });

  it("no se repite", () => {
    const set = new Set(Array.from({ length: 500 }, () => generarPasswordTemporal()));
    expect(set.size).toBe(500);
  });

  it("descarta bytes sesgados (rechazo) con una fuente inyectada", () => {
    // 255 >= límite (248 para 31 símbolos): se descarta entero; después
    // 32 → 'b' (32 % 31 = 1) y 30 → '9', alternados.
    let llamada = 0;
    const fuente = (bytes: Uint8Array) => {
      llamada++;
      bytes.forEach((_, i) => {
        bytes[i] = llamada === 1 ? 255 : i % 2 === 0 ? 32 : 30;
      });
      return bytes;
    };
    expect(generarPasswordTemporal(fuente)).toBe("b9b9-b9b9-b9b9");
    expect(llamada).toBe(2);
  });

  it("siempre trae al menos una letra y un dígito", () => {
    // Primera candidata toda letras ('b'): se descarta y se genera otra.
    let llamada = 0;
    const fuente = (bytes: Uint8Array) => {
      llamada++;
      bytes.forEach((_, i) => {
        bytes[i] = llamada === 1 ? 32 : i % 2 === 0 ? 30 : 32;
      });
      return bytes;
    };
    expect(generarPasswordTemporal(fuente)).toBe("9b9b-9b9b-9b9b");
    for (let i = 0; i < 300; i++) {
      const p = generarPasswordTemporal();
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[2-9]/);
    }
  });
});

describe("mensajeCuentaTemporal", () => {
  it("arma el mensaje con primer nombre, sitio, email y contraseña", () => {
    expect(
      mensajeCuentaTemporal({
        nombre: "Caro Díaz",
        email: "caro@mail.com",
        password: "k7mq-x3tp-9dwa",
        sitio: "https://ananja.example.com",
      }),
    ).toBe(
      "Hola Caro, entrá a https://ananja.example.com con tu mail caro@mail.com y esta contraseña temporal: k7mq-x3tp-9dwa Te va a pedir que elijas una nueva.",
    );
  });
});

describe("sugiereCuentaTemporal", () => {
  it("SMTP / rate limit → sí; email inválido o ya registrado → no", () => {
    expect(sugiereCuentaTemporal({ code: "over_email_send_rate_limit" })).toBe(true);
    expect(sugiereCuentaTemporal({ code: "email_address_not_authorized" })).toBe(true);
    expect(sugiereCuentaTemporal({ status: 500, message: "Error sending invite email" })).toBe(true);
    expect(sugiereCuentaTemporal({ code: "email_exists" })).toBe(false);
    expect(sugiereCuentaTemporal({ code: "email_address_invalid" })).toBe(false);
    expect(sugiereCuentaTemporal(null)).toBe(false);
  });
});

describe("normalizarNext", () => {
  it("acepta rutas relativas del sitio", () => {
    expect(normalizarNext("/bienvenida")).toBe("/bienvenida");
    expect(normalizarNext("/mi/ventas?x=1#a")).toBe("/mi/ventas?x=1#a");
  });

  it("rechaza URLs absolutas y protocol-relative", () => {
    expect(normalizarNext("https://evil.com")).toBe("/");
    expect(normalizarNext("//evil.com")).toBe("/");
    expect(normalizarNext("/\\evil.com")).toBe("/");
    expect(normalizarNext("javascript:alert(1)")).toBe("/");
    expect(normalizarNext("bienvenida")).toBe("/");
  });

  it("rechaza vacíos, caracteres de control y el propio /auth/confirm", () => {
    expect(normalizarNext(null)).toBe("/");
    expect(normalizarNext("")).toBe("/");
    expect(normalizarNext("/\tevil")).toBe("/");
    expect(normalizarNext("/auth/confirm?next=/")).toBe("/");
  });

  it("rechaza open redirects que aparecen al normalizar segmentos . y ..", () => {
    for (const malo of [
      "/..//evil.com",
      "/.//evil.com",
      "/%2e%2e//evil.com",
      "/%2E%2E//evil.com",
      "/a/..//evil.com",
      "/a/%2e%2e//evil.com",
      "/./\\evil.com",
      "/..\\evil.com",
      "/%5cevil.com",
      "/%5Cevil.com",
      "/%2f%2fevil.com",
      "/%2F%2Fevil.com",
      "/%2F/evil.com",
      "/..%2f%2fevil.com",
      "/.%2e//evil.com",
    ]) {
      const r = normalizarNext(malo);
      expect(r, malo).toBe("/");
      expect(new URL(r, "https://ananja.example.com").origin, malo).toBe("https://ananja.example.com");
    }
  });

  it("normaliza segmentos inofensivos sin cambiar de origen", () => {
    expect(normalizarNext("/mi/../bienvenida")).toBe("/bienvenida");
    expect(normalizarNext("/./cambiar-password")).toBe("/cambiar-password");
  });

  it("usa el fallback indicado", () => {
    expect(normalizarNext("https://x.com", "/bienvenida")).toBe("/bienvenida");
  });
});

describe("tipos OTP", () => {
  it("reconoce los tipos soportados", () => {
    for (const t of ["invite", "recovery", "email_change", "magiclink", "signup", "email"]) {
      expect(esTipoOtp(t)).toBe(true);
    }
    expect(esTipoOtp("sms")).toBe(false);
    expect(esTipoOtp(null)).toBe(false);
  });

  it("next por defecto según el tipo", () => {
    expect(nextPorDefecto("invite")).toBe("/bienvenida");
    expect(nextPorDefecto("recovery")).toBe("/cambiar-password");
    expect(nextPorDefecto("email_change")).toBe("/");
  });
});

describe("resolverUrlSitio", () => {
  it("prioriza la env var y devuelve solo el origen", () => {
    expect(resolverUrlSitio("https://ananja.example.com/", "http://localhost:3000")).toBe(
      "https://ananja.example.com",
    );
  });

  it("cae al origen de la request si la env var falta o es inválida", () => {
    expect(resolverUrlSitio(undefined, "http://localhost:3000")).toBe("http://localhost:3000");
    expect(resolverUrlSitio("no-es-url", "http://localhost:3000")).toBe("http://localhost:3000");
    expect(resolverUrlSitio("ftp://x.com", null)).toBeNull();
  });
});

describe("mensajeErrorAuth", () => {
  it("rate limit de mails", () => {
    expect(mensajeErrorAuth({ code: "over_email_send_rate_limit", status: 429 })).toMatch(/demasiados mails/);
  });

  it("email ya registrado", () => {
    expect(mensajeErrorAuth({ code: "email_exists", status: 422 })).toMatch(/ya tiene una cuenta/);
    expect(
      mensajeErrorAuth({ message: "A user with this email address has already been registered" }),
    ).toMatch(/ya tiene una cuenta/);
  });

  it("email inválido", () => {
    expect(mensajeErrorAuth({ code: "email_address_invalid" })).toMatch(/no es válido/);
  });

  it("SMTP no configurado / error al mandar", () => {
    expect(mensajeErrorAuth({ code: "email_address_not_authorized" })).toMatch(/SMTP/);
    expect(mensajeErrorAuth({ status: 500, message: "Error sending invite email" })).toMatch(/SMTP/);
  });

  it("nunca devuelve el mensaje crudo", () => {
    expect(mensajeErrorAuth({ message: "Something weird" })).toBe(
      "No se pudo completar. Probá de nuevo en un rato.",
    );
    expect(mensajeErrorAuth(null)).toBe("No se pudo completar. Probá de nuevo en un rato.");
  });
});

describe("contraseña", () => {
  it("valida largo y confirmación", () => {
    expect(validarPassword("corta", "corta")).toMatch(/al menos 8/);
    expect(validarPassword("larguisima1", "larguisima2")).toMatch(/no coinciden/);
    expect(validarPassword("larguisima1", "larguisima1")).toBeNull();
  });

  it("traduce errores de updateUser", () => {
    expect(mensajeErrorPassword("", "same_password")).toMatch(/distinta/);
    expect(mensajeErrorPassword("Password should be at least 6 characters")).toMatch(/débil/);
  });
});

describe("validarDatosInvitacion", () => {
  const base = { nombre: "  Caro   Díaz ", email: " Caro@Mail.com ", rol: "revendedor", encargadoId: "" };

  it("normaliza nombre y email", () => {
    const r = validarDatosInvitacion(base);
    expect(r).toEqual({
      ok: true,
      datos: { nombre: "Caro Díaz", email: "caro@mail.com", rol: "revendedor", encargadoId: null },
    });
  });

  it("exige nombre, email válido y rol", () => {
    expect(validarDatosInvitacion({ ...base, nombre: " " }).ok).toBe(false);
    expect(validarDatosInvitacion({ ...base, email: "caro@" }).ok).toBe(false);
    expect(validarDatosInvitacion({ ...base, rol: "pendiente" }).ok).toBe(false);
    expect(validarDatosInvitacion({ ...base, rol: undefined }).ok).toBe(false);
  });

  it("acepta rol coordinador, sin encargado (0055)", () => {
    const r = validarDatosInvitacion({ ...base, rol: "coordinador", encargadoId: "" });
    expect(r).toEqual({
      ok: true,
      datos: { nombre: "Caro Díaz", email: "caro@mail.com", rol: "coordinador", encargadoId: null },
    });
  });

  it("encargado: uuid para revendedora, descartado para admin", () => {
    const id = "0b7e7a52-6f0e-4a1a-9d3c-2c1b0f8e9a11";
    const rev = validarDatosInvitacion({ ...base, encargadoId: id });
    expect(rev.ok && rev.datos.encargadoId).toBe(id);
    const admin = validarDatosInvitacion({ ...base, rol: "admin", encargadoId: id });
    expect(admin.ok && admin.datos.encargadoId).toBeNull();
    expect(validarDatosInvitacion({ ...base, encargadoId: "x' or 1=1" }).ok).toBe(false);
  });
});

describe("validarAsignacionInicial (reglas de rol)", () => {
  const nuevo = { id: "v-nuevo", rol: "pendiente", activo: true };
  const admin = { id: "v-admin", rol: "admin", activo: true };

  it("pendiente → revendedor/admin/coordinador permitido", () => {
    expect(validarAsignacionInicial({ vendedor: nuevo, rolDestino: "revendedor", encargado: admin })).toBeNull();
    expect(validarAsignacionInicial({ vendedor: nuevo, rolDestino: "admin", encargado: null })).toBeNull();
    expect(validarAsignacionInicial({ vendedor: nuevo, rolDestino: "coordinador", encargado: null })).toBeNull();
  });

  it("un coordinador activo también puede ser el encargado de una revendedora nueva (0055)", () => {
    const coordinador = { id: "v-coord", rol: "coordinador", activo: true };
    expect(
      validarAsignacionInicial({ vendedor: nuevo, rolDestino: "revendedor", encargado: coordinador }),
    ).toBeNull();
  });

  it("un admin nunca pasa a revendedor (ni ningún rol ya asignado)", () => {
    expect(
      validarAsignacionInicial({ vendedor: { ...nuevo, rol: "admin" }, rolDestino: "revendedor", encargado: null }),
    ).toMatch(/ya tenía un rol/);
  });

  it("encargado solo para revendedora y tiene que ser admin o coordinador activo distinto", () => {
    expect(validarAsignacionInicial({ vendedor: nuevo, rolDestino: "admin", encargado: admin })).toMatch(
      /Solo una revendedora/,
    );
    expect(
      validarAsignacionInicial({ vendedor: nuevo, rolDestino: "revendedor", encargado: { ...admin, activo: false } }),
    ).toMatch(/admin o coordinador activo/);
    expect(
      validarAsignacionInicial({ vendedor: nuevo, rolDestino: "revendedor", encargado: { ...admin, rol: "revendedor" } }),
    ).toMatch(/admin o coordinador activo/);
    expect(
      validarAsignacionInicial({ vendedor: nuevo, rolDestino: "revendedor", encargado: { ...nuevo, rol: "admin" } }),
    ).toMatch(/admin o coordinador activo/);
  });

  it("cuenta dada de baja", () => {
    expect(
      validarAsignacionInicial({ vendedor: { ...nuevo, activo: false }, rolDestino: "admin", encargado: null }),
    ).toMatch(/baja/);
  });
});

describe("estado de invitación", () => {
  const invitada = { invited_at: "2026-09-15T10:00:00Z", email_confirmed_at: null, last_sign_in_at: null };

  it("pendiente si nunca usó el link", () => {
    expect(esInvitacionPendiente(invitada)).toBe(true);
    expect(puedeCancelarInvitacion(invitada)).toBe(true);
    expect(modoReenvio(invitada)).toBe("invitar");
  });

  it("usó el link pero no eligió contraseña (flag legado en user_metadata): pendiente, no cancelable, reenvío por recuperar", () => {
    const u = {
      ...invitada,
      email_confirmed_at: "2026-09-15T11:00:00Z",
      last_sign_in_at: "2026-09-15T11:00:00Z",
      user_metadata: { bienvenida_pendiente: true },
    };
    expect(esInvitacionPendiente(u)).toBe(true);
    expect(puedeCancelarInvitacion(u)).toBe(false);
    expect(modoReenvio(u)).toBe("recuperar");
  });

  it("usó el link pero no eligió contraseña (flag en app_metadata, código nuevo): mismo resultado", () => {
    const u = {
      ...invitada,
      email_confirmed_at: "2026-09-15T11:00:00Z",
      last_sign_in_at: "2026-09-15T11:00:00Z",
      app_metadata: { bienvenida_pendiente: true },
      user_metadata: {},
    };
    expect(esInvitacionPendiente(u)).toBe(true);
    expect(modoReenvio(u)).toBe("recuperar");
  });

  it("ya entró: nada pendiente", () => {
    const u = {
      ...invitada,
      email_confirmed_at: "2026-09-15T11:00:00Z",
      user_metadata: { bienvenida_pendiente: false },
    };
    expect(esInvitacionPendiente(u)).toBe(false);
    expect(modoReenvio(u)).toBeNull();
  });

  it("usuarios creados a mano (sin invited_at) nunca son invitaciones", () => {
    expect(esInvitacionPendiente({ email_confirmed_at: null })).toBe(false);
    expect(puedeCancelarInvitacion({})).toBe(false);
  });

  it("negocio del usuario: mismo criterio que el trigger", () => {
    expect(negocioDeUsuario({ negocio: "germa" })).toBe("germa");
    expect(negocioDeUsuario({ negocio: "ananja" })).toBe("ananja");
    expect(negocioDeUsuario({})).toBe("ananja");
    expect(negocioDeUsuario(null)).toBe("ananja");
  });

  it("destino por rol", () => {
    expect(destinoPorRol({ rol: "revendedor", activo: true })).toBe("/mi");
    expect(destinoPorRol({ rol: "coordinador", activo: true })).toBe("/mi");
    expect(destinoPorRol({ rol: "admin", activo: true })).toBe("/");
    expect(destinoPorRol({ rol: "pendiente", activo: true })).toBe("/sin-acceso");
    expect(destinoPorRol({ rol: "admin", activo: false })).toBe("/sin-acceso");
    expect(destinoPorRol(null)).toBe("/sin-acceso");
  });
});

describe("flagCuentaActivo (app_metadata O user_metadata, en ese orden de preferencia)", () => {
  it("solo app, solo user (legado), ambos, ninguno", () => {
    expect(flagCuentaActivo({ [FLAG_MUST_CHANGE_PASSWORD]: true }, null, FLAG_MUST_CHANGE_PASSWORD)).toBe(
      true,
    );
    expect(flagCuentaActivo(null, { [FLAG_MUST_CHANGE_PASSWORD]: true }, FLAG_MUST_CHANGE_PASSWORD)).toBe(
      true,
    );
    expect(
      flagCuentaActivo(
        { [FLAG_MUST_CHANGE_PASSWORD]: true },
        { [FLAG_MUST_CHANGE_PASSWORD]: true },
        FLAG_MUST_CHANGE_PASSWORD,
      ),
    ).toBe(true);
    expect(flagCuentaActivo({}, {}, FLAG_MUST_CHANGE_PASSWORD)).toBe(false);
    expect(flagCuentaActivo(null, null, FLAG_MUST_CHANGE_PASSWORD)).toBe(false);
    expect(flagCuentaActivo(undefined, undefined, FLAG_MUST_CHANGE_PASSWORD)).toBe(false);
  });

  it("apagar solo el de user_metadata no apaga el flag si app_metadata sigue en true", () => {
    expect(
      flagCuentaActivo({ [FLAG_MUST_CHANGE_PASSWORD]: true }, { [FLAG_MUST_CHANGE_PASSWORD]: false }, FLAG_MUST_CHANGE_PASSWORD),
    ).toBe(true);
  });
});

describe("redireccionPorMetadata (proxy)", () => {
  // Firma: (appMetadata, userMetadata, pathname). Cada flag cuenta como
  // activo si está en `app_metadata` (fuente de verdad) O en
  // `user_metadata` (compatibilidad con cuentas invitadas antes del fix de
  // seguridad 2026-09-21 — ver `flagCuentaActivo`).
  it("must_change_password solo en app_metadata → /cambiar-password", () => {
    expect(redireccionPorMetadata({ must_change_password: true }, null, "/")).toBe("/cambiar-password");
    expect(redireccionPorMetadata({ must_change_password: true }, null, "/cambiar-password")).toBeNull();
  });

  it("must_change_password solo en user_metadata (legado) → /cambiar-password", () => {
    expect(redireccionPorMetadata(null, { must_change_password: true }, "/")).toBe("/cambiar-password");
    expect(redireccionPorMetadata({}, { must_change_password: true }, "/cambiar-password")).toBeNull();
  });

  it("must_change_password en los dos lados → /cambiar-password (igual que con uno solo)", () => {
    expect(
      redireccionPorMetadata({ must_change_password: true }, { must_change_password: true }, "/"),
    ).toBe("/cambiar-password");
  });

  it("un usuario que apaga SOLO el de user_metadata sigue siendo redirigido si app_metadata sigue prendido", () => {
    expect(redireccionPorMetadata({ must_change_password: true }, { must_change_password: false }, "/")).toBe(
      "/cambiar-password",
    );
    expect(
      redireccionPorMetadata({ bienvenida_pendiente: true }, { bienvenida_pendiente: false }, "/mi"),
    ).toBe("/bienvenida");
  });

  it("bienvenida pendiente (app_metadata) → /bienvenida (también desde /cambiar-password)", () => {
    expect(redireccionPorMetadata({ bienvenida_pendiente: true }, null, "/mi")).toBe("/bienvenida");
    expect(redireccionPorMetadata({ bienvenida_pendiente: true }, null, "/cambiar-password")).toBe(
      "/bienvenida",
    );
    expect(redireccionPorMetadata({ bienvenida_pendiente: true }, null, "/bienvenida")).toBeNull();
  });

  it("bienvenida pendiente solo en user_metadata (legado) → /bienvenida", () => {
    expect(redireccionPorMetadata(null, { bienvenida_pendiente: true }, "/mi")).toBe("/bienvenida");
  });

  it("ningún flag en ningún lado no redirige", () => {
    expect(redireccionPorMetadata({}, {}, "/")).toBeNull();
    expect(redireccionPorMetadata(null, null, "/")).toBeNull();
    expect(redireccionPorMetadata(undefined, undefined, "/")).toBeNull();
  });
});
