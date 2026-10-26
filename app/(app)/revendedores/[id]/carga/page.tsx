import { redirect } from "next/navigation";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { CargaForm } from "@/components/revendedores/carga-form";
import { VolverLink } from "@/components/volver-link";
import {
  listarLotesProduccionPorIds,
  listarProductosResumen,
  obtenerDeudaVendedor,
  obtenerEncargadoBasico,
  obtenerVendedorPorId,
} from "@/lib/data/revendedores";
import { hoyISO } from "@/lib/fechas";
import { exigirAdmin } from "@/lib/invitaciones-server";
import { obtenerLotesConStock } from "@/lib/data/lotes";
import { pagoComoHistorial, ventasComoFifo } from "@/lib/dominio/revendedores";
import {
  listarEntregaItemsFifo,
  listarPagosRevendedor,
  listarPreciosRevendedor,
  listarVentasRevendedor,
} from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/revendedores/[id]/carga` — "Cargar movimiento" (solo admins): entrega +
 * ventas + pago de una revendedora en una sola operación
 * (`registrar_carga_revendedor`, 0043). Único formulario de carga desde el
 * rediseño "de 10 bloques a 5" (2026-09-16): `?abrir=entrega|ventas|pago`
 * abre esa sección con las otras plegadas — lo usan los redirects
 * permanentes de las rutas viejas `/entrega`, `/ventas/nueva` y
 * `/rendicion` (`next.config.ts`) y el botón "+" (que lo manda como
 * `?seccion=`); sin el parámetro, abre Entrega.
 *
 * El chequeo de admin va acá además del RPC (`es_admin()`): una revendedora
 * nunca llega a `(app)` por el proxy, pero esta pantalla no depende de eso.
 * Solo pasa datos serializables al Client Component.
 */
const SECCIONES = new Set(["entrega", "ventas", "pago"]);

export default async function CargaUnificadaPage({
  params,
  searchParams,
}: PageProps<"/revendedores/[id]/carga">) {
  const caller = await exigirAdmin();
  if (!caller) redirect("/");

  const { id } = await params;
  const sp = await searchParams;
  // `?abrir=entrega|ventas|pago` abre esa sección con las otras plegadas
  // (usado por los redirects de las rutas viejas /entrega, /ventas/nueva y
  // /rendicion); sin parámetro, abre Entrega.
  // `?seccion=` es el nombre que usa el botón "+" (`components/cargar/`);
  // `?abrir=` sigue andando por los redirects viejos. Si vienen los dos,
  // gana `seccion`.
  const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const abrirParam = primero(sp.seccion) ?? primero(sp.abrir);
  const conSeccion = SECCIONES.has(abrirParam ?? "");
  const seccionInicial = conSeccion ? (abrirParam as "entrega" | "ventas" | "pago") : "entrega";
  const supabase = await createClient();

  const [
    revendedor,
    { data: productos },
    { data: items },
    { data: ventas },
    { data: precios },
    { data: pagos },
    deuda,
    lotes,
  ] = await Promise.all([
    obtenerVendedorPorId(supabase, id),
    listarProductosResumen(supabase),
    listarEntregaItemsFifo(supabase, id),
    listarVentasRevendedor(supabase, id),
    listarPreciosRevendedor(supabase, id),
    listarPagosRevendedor(supabase, id),
    obtenerDeudaVendedor(supabase, id),
    obtenerLotesConStock(supabase),
  ]);

  const esRevendedora =
    revendedor !== null &&
    revendedor.activo &&
    (revendedor.rol === "revendedor" || (revendedor.rol === "admin" && revendedor.revende));

  if (!revendedor || !esRevendedora) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/revendedores" label="revendedores" />
        <p className="text-[16px] text-text-muted">No encontramos esta revendedora.</p>
      </div>
    );
  }

  // Sin embed del encargado (self-join por FK no lo resuelve PostgREST): se
  // pide aparte. Solo cuenta si es admin o coordinador activo (0055) —
  // mismo criterio que usa `registrar_rendicion` para decidir quién queda
  // con la plata.
  const loteIdsFaltantes = Array.from(
    new Set(
      items
        .map((i) => i.loteId)
        .filter((l): l is string => l !== null && !lotes.some((x) => x.loteId === l)),
    ),
  );
  const [encargado, lotesViejos] = await Promise.all([
    revendedor.encargado_id ? obtenerEncargadoBasico(supabase, revendedor.encargado_id) : Promise.resolve(null),
    listarLotesProduccionPorIds(supabase, loteIdsFaltantes),
  ]);

  const fechaLotePorId: Record<string, string> = {};
  for (const l of lotes) fechaLotePorId[l.loteId] = l.fecha;
  for (const l of lotesViejos) fechaLotePorId[l.id] = l.fecha;

  const pagosPendientes = pagos
    .map(pagoComoHistorial)
    .filter((p) => p.estado === "pendiente")
    .map((p) => ({ id: p.id, montoCentavos: p.montoCentavos, fecha: p.fecha, medioPago: p.medioPago }));

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-col gap-5">
        {/* Sin título fijo acá: CargaForm ya registra el suyo (dinámico,
            "Cargar movimiento"/"Revisá todo") con su propio SetFormHeader —
            FormHeaderDesktop lee esa misma fuente, así el título de
            escritorio queda sincronizado con el de mobile (antes quedaba
            fijo en "Cargar movimiento" aunque mobile mostrara "Revisá
            todo"). */}
        <FormHeaderDesktop />
        {/* `key`: si ya se está en esta pantalla y el botón "+" manda a otra
            sección (misma ruta, otro `?seccion=`), el formulario se vuelve
            a montar para que arranque con esa sección abierta. */}
        <CargaForm
          key={`${id}:${conSeccion ? seccionInicial : "todas"}`}
          vendedorId={id}
          vendedorNombre={revendedor.nombre}
          seccionInicial={seccionInicial}
          conSeccion={conSeccion}
          encargadoNombre={
            encargado && (encargado.rol === "admin" || encargado.rol === "coordinador") && encargado.activo
              ? encargado.nombre
              : null
          }
          deudaCentavos={deuda ?? 0}
          tomaDirecto={revendedor.toma_directo}
          pagosPendientes={pagosPendientes}
          productos={productos ?? []}
          lotes={lotes}
          items={items}
          ventas={ventasComoFifo(ventas)}
          preciosManuales={Object.fromEntries(precios.map((p) => [p.producto_id, p.precio_centavos]))}
          fechaLotePorId={fechaLotePorId}
          hoy={hoyISO()}
        />
      </div>
    </div>
  );
}
