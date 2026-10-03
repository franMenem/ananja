import type { NextConfig } from "next";

/**
 * Content-Security-Policy (hallazgo #1 de la auditoría de seguridad inicial).
 * Los orígenes de Supabase se derivan de `NEXT_PUBLIC_SUPABASE_URL`, la misma
 * variable que usan los clientes de `lib/supabase/*`: si el proyecto cambia,
 * la CSP lo sigue sola.
 *
 * `'unsafe-inline'` en `script-src` y `style-src`: Next 16 inyecta estilos
 * de Tailwind y bootstrap scripts inline sin nonce en este setup; probado
 * en dev y prod que sacarlo rompe la carga. `blob:` en `img-src` para los
 * previews locales de fotos antes de subir. `worker-src 'self'` para
 * `public/sw.js` (Web Push). `frame-ancestors 'none'` cubre el mismo caso
 * que `X-Frame-Options: DENY` para navegadores modernos.
 */
function origenesSupabase(): { http: string; ws: string } {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return { http: url.origin, ws: `${ws}//${url.host}` };
  } catch {
    // Sin URL válida la app no puede hablar con Supabase de todos modos.
    return { http: "", ws: "" };
  }
}

const { http: SUPABASE_ORIGIN, ws: SUPABASE_WS_ORIGIN } = origenesSupabase();

const isDev = process.env.NODE_ENV !== "production";

// Solo en dev: Next/React necesitan `eval()` para el debugging del modo
// desarrollo (nunca en producción — confirmado en consola: "React will
// never use eval() in production mode") y el HMR de Turbopack abre un
// websocket a `ws://localhost:*` que no existe en producción. Sin esto,
// `npm run dev` se rompe (hot reload y overlay de errores) aunque la app
// en sí funcione. La CSP de producción no lleva ninguna de las dos cosas.
const CSP = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data: ${SUPABASE_ORIGIN}`,
  `font-src 'self'`,
  `connect-src 'self' ${SUPABASE_ORIGIN} ${SUPABASE_WS_ORIGIN}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  `worker-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  /**
   * 2026-09-16: /caja se fundió en /plata para que la plata y las deudas
   * estén en un solo lugar, y /ganancia/graficos se fundió en /ganancia
   * (el gráfico de líneas y el resumen de botellas ahora viven ahí).
   * Redirects permanentes para bookmarks/links viejos; el código de la app
   * ya no genera ningún link a `/caja` ni a `/ganancia/graficos`. Orden
   * importante: "deudas" tiene que resolverse ANTES que el patrón dinámico
   * `:medio`, si no "deudas" caería ahí como si fuera un medio de pago.
   *
   * 2026-09-16 (tanda nav-sin-hubs): /ventas y /produccion eran hubs de
   * solo links (sin datos propios) — se eliminaron y el tab bar mobile va
   * directo a la primera sección de cada sector (`destinoDeSector` en
   * `lib/navegacion.ts`). Redirects permanentes para bookmarks/links
   * viejos a esas dos rutas.
   *
   * 2026-09-16 (menú final): /precios (calculadora de precios) se retiró
   * del menú de Plata y de la app — el costo Ananja ya se ve en el detalle
   * de cada lote (`/stock/lotes/[id]`). Redirect permanente ahí para
   * bookmarks/links viejos; las tablas de precios en la base no se tocan
   * (`lib/precios.ts` sigue con `obtenerVersionVigente`/`crearDeuda`/
   * `marcarDeudaSaldada`, usados por Revendedores y Plata).
   *
   * 2026-09-16 (menú final): Avisos se fundió en Tareas — la campana salió
   * del rail/header y `/notificaciones` pasó a ser un bloque "AVISOS" al
   * pie de `/tareas` (ver `app/(app)/tareas/page.tsx`). Redirect
   * permanente para bookmarks/links viejos y para el link que manda el
   * push del server (`app/api/push/send`).
   *
   * 2026-09-16 (tanda "de 10 bloques a 5"): `/revendedores/[id]/entrega`,
   * `/ventas/nueva` y `/rendicion` se fundieron en un único formulario
   * "Cargar movimiento" (`/revendedores/[id]/carga`, ver ese archivo);
   * `?abrir=` abre la sección equivalente. Redirects permanentes para
   * bookmarks/links viejos — el código de la app ya no genera ningún link
   * a esas tres rutas.
   *
   * 2026-09-16 (tanda produccion-simple): /stock/insumos/compra ("Registrar
   * compra", un solo insumo) se fundió en /stock/insumos/factura ("Cargar
   * compra"), que ya funciona cómodo con un solo renglón — un botón menos
   * en /stock/insumos. El `?insumo=<id>` del link "Sin stock — registrá la
   * compra" pasa igual (Next reenvía la query en un redirect sin `:path*`).
   */
  async redirects() {
    return [
      {
        source: "/caja/deudas/:path*",
        destination: "/plata/deudas/:path*",
        permanent: true,
      },
      {
        source: "/caja",
        destination: "/plata",
        permanent: true,
      },
      {
        source: "/caja/:medio",
        destination: "/plata/cuenta/:medio",
        permanent: true,
      },
      {
        source: "/ganancia/graficos",
        destination: "/ganancia",
        permanent: true,
      },
      {
        source: "/ventas",
        destination: "/comprobantes",
        permanent: true,
      },
      {
        source: "/produccion",
        destination: "/stock",
        permanent: true,
      },
      {
        source: "/precios/:path*",
        destination: "/stock/lotes",
        permanent: true,
      },
      {
        source: "/notificaciones",
        destination: "/tareas",
        permanent: true,
      },
      {
        // Antes de la tanda "de 10 bloques a 5", una devolución era
        // `/revendedores/[id]/entrega?tipo=devolucion` (mismo formulario que
        // una entrega, con un switch). Ahora es su propia pantalla
        // (`/revendedores/[id]/devolucion`) — este caso tiene que resolverse
        // ANTES que el redirect genérico de `/entrega` de abajo, que si no
        // se lo comería primero y mandaría la devolución al formulario de
        // entrega equivocado.
        source: "/revendedores/:id/entrega",
        has: [{ type: "query", key: "tipo", value: "devolucion" }],
        destination: "/revendedores/:id/devolucion",
        permanent: true,
      },
      {
        source: "/revendedores/:id/entrega",
        destination: "/revendedores/:id/carga?abrir=entrega",
        permanent: true,
      },
      {
        source: "/revendedores/:id/ventas/nueva",
        destination: "/revendedores/:id/carga?abrir=ventas",
        permanent: true,
      },
      {
        source: "/revendedores/:id/rendicion",
        destination: "/revendedores/:id/carga?abrir=pago",
        permanent: true,
      },
      {
        source: "/stock/insumos/compra",
        destination: "/stock/insumos/factura",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
