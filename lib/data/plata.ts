/**
 * Lecturas de Plata — capa `lib/data` (convención en `lib/data/README.md`,
 * `lib/data/gastos.ts` es la referencia). Nada de JSX ni agregación acá: eso
 * vive en `app/(app)/plata/**` (UI) y `lib/dominio/movimientos-plata.ts`/
 * `lib/dominio/plata.ts` (funciones puras).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { describirCobro } from "@/lib/dominio/cobros";
import { type DeudaPendienteResumen, listarDeudasPendientes } from "@/lib/deudas";
import { describirPagoDeuda } from "@/lib/dominio/deudas";
import {
  describirDeposito,
  describirRendicion,
  detalleDeposito,
  montoEnCuenta,
  montoEnManos,
  textoDonde,
  type FilaMovimiento,
  type MedioCuenta,
  type ViaRendicion,
} from "@/lib/dominio/movimientos-plata";
import { agruparPedidosPorPagar, type PedidoPorPagar } from "@/lib/dominio/tareas";
import { insumoDeMovimientos, tituloGasto } from "@/lib/dominio/gastos";
import { compararPorFechaDesc } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { leerTodasLasPaginas } from "@/lib/paginado";
import { getSignedUrls } from "@/lib/storage";
import { describirTransferencia } from "@/lib/dominio/transferencias";
import type { Database, Tables } from "@/lib/types";

export { itemsGenerales, PASO_MOVIMIENTOS, type FilaMovimiento } from "@/lib/dominio/movimientos-plata";

type Supa = SupabaseClient<Database>;

/** Saldo de cada caja (`v_saldos_caja`) — bloque oliva y desglose de
 * "En manos de" de `/plata`. */
export async function listarSaldosCaja(
  supabase: Supa,
): Promise<{ data: Tables<"v_saldos_caja">[]; error: string | null }> {
  const { data, error } = await supabase.from("v_saldos_caja").select("*");
  if (error) {
    console.error("listarSaldosCaja", error);
    return { data: [], error: "No se pudo cargar los saldos de caja." };
  }
  return { data: data ?? [], error: null };
}

/** Cuenta Ananja (Mercado Pago + Banco, `v_cuenta_ananja`) — bloque oliva de
 * `/plata`. `null` si no hay fila (no debería pasar) o si falla. */
export async function obtenerCuentaAnanja(supabase: Supa): Promise<Tables<"v_cuenta_ananja"> | null> {
  const { data, error } = await supabase.from("v_cuenta_ananja").select("*").maybeSingle();
  if (error) console.error("obtenerCuentaAnanja", error);
  return data ?? null;
}

/** Plata en manos de cada persona (`v_plata_en_manos`) — lista completa,
 * usada por `/plata` para armar "En manos de". */
export async function listarPlataEnManos(
  supabase: Supa,
): Promise<{ data: Tables<"v_plata_en_manos">[]; error: string | null }> {
  const { data, error } = await supabase.from("v_plata_en_manos").select("*");
  if (error) {
    console.error("listarPlataEnManos", error);
    return { data: [], error: "No se pudo cargar la plata en manos de cada persona." };
  }
  return { data: data ?? [], error: null };
}

/** Una fila de `v_plata_en_manos` por `tenedor_id` — detalle de
 * `/plata/en-manos/[id]`. `null` si no existe o si falla. */
export async function obtenerPersonaEnManos(
  supabase: Supa,
  tenedorId: string,
): Promise<Tables<"v_plata_en_manos"> | null> {
  const { data, error } = await supabase
    .from("v_plata_en_manos")
    .select("*")
    .eq("tenedor_id", tenedorId)
    .maybeSingle();
  if (error) console.error("obtenerPersonaEnManos", error);
  return data ?? null;
}

/** Solo `tenedor_id`/`total_centavos` de `v_plata_en_manos` — precarga de
 * montos por persona en `/plata/depositar`. */
export async function listarMontosPlataEnManos(
  supabase: Supa,
): Promise<{ data: Pick<Tables<"v_plata_en_manos">, "tenedor_id" | "total_centavos">[]; error: string | null }> {
  const { data, error } = await supabase.from("v_plata_en_manos").select("tenedor_id, total_centavos");
  if (error) {
    console.error("listarMontosPlataEnManos", error);
    return { data: [], error: "No se pudo cargar la plata en manos de cada persona." };
  }
  return { data: data ?? [], error: null };
}

/** Deuda de cada revendedora (`v_deuda_vendedor`) — bloque "Le deben" de
 * `/plata`. */
export async function listarDeudaVendedor(
  supabase: Supa,
): Promise<{ data: Tables<"v_deuda_vendedor">[]; error: string | null }> {
  const { data, error } = await supabase.from("v_deuda_vendedor").select("*");
  if (error) {
    console.error("listarDeudaVendedor", error);
    return { data: [], error: "No se pudo cargar la deuda de las revendedoras." };
  }
  return { data: data ?? [], error: null };
}

/** Solo `deuda_centavos` de `v_deuda_cliente` — lo único que necesita
 * `resumirClientes` (`lib/dominio/inicio.ts`) para el bloque "Le deben" de
 * `/plata`. */
export async function listarDeudaClienteMontos(
  supabase: Supa,
): Promise<{ data: Pick<Tables<"v_deuda_cliente">, "deuda_centavos">[]; error: string | null }> {
  const { data, error } = await supabase.from("v_deuda_cliente").select("deuda_centavos");
  if (error) {
    console.error("listarDeudaClienteMontos", error);
    return { data: [], error: "No se pudo cargar la deuda de los clientes." };
  }
  return { data: data ?? [], error: null };
}

/** Saldo de una cuenta puntual (`v_saldos_caja.saldo_centavos`, Mercado Pago
 * o Banco) — cabecera de `/plata/cuenta/[medio]`. `null` si no hay fila o
 * si falla. */
export async function obtenerSaldoCuentaMedio(
  supabase: Supa,
  medio: MedioCuenta,
): Promise<Pick<Tables<"v_saldos_caja">, "saldo_centavos"> | null> {
  const { data, error } = await supabase
    .from("v_saldos_caja")
    .select("saldo_centavos")
    .eq("medio_pago", medio)
    .maybeSingle();
  if (error) console.error("obtenerSaldoCuentaMedio", error);
  return data ?? null;
}

/** Saldo inicial de una caja (`cajas.saldo_inicial_centavos`) — dato fijo
 * mostrado bajo el saldo en `/plata/cuenta/[medio]`. `null` si no hay fila
 * o si falla. */
export async function obtenerCajaSaldoInicial(
  supabase: Supa,
  medio: MedioCuenta,
): Promise<Pick<Tables<"cajas">, "saldo_inicial_centavos"> | null> {
  const { data, error } = await supabase
    .from("cajas")
    .select("saldo_inicial_centavos")
    .eq("medio_pago", medio)
    .maybeSingle();
  if (error) console.error("obtenerCajaSaldoInicial", error);
  return data ?? null;
}

/** Admins y coordinadores activos (los que pueden tener plata en mano,
 * `registrar_deposito_cuenta`/`v_plata_en_manos` desde 0055), para elegir
 * "quién tenía la plata" en `/plata/depositar`. */
export async function listarTenedoresActivos(
  supabase: Supa,
): Promise<{ data: Pick<Tables<"vendedores">, "id" | "nombre">[]; error: string | null }> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("id, nombre")
    .in("rol", ["admin", "coordinador"])
    .eq("activo", true)
    .order("nombre");
  if (error) {
    console.error("listarTenedoresActivos", error);
    return { data: [], error: "No se pudo cargar la lista de personas." };
  }
  return { data: data ?? [], error: null };
}

/** Saldo restante de una deuda puntual (`v_saldo_deuda`) — cabecera de
 * `/plata/deudas/[id]/pago`. `null` si no existe o si falla. */
export async function obtenerSaldoDeuda(
  supabase: Supa,
  deudaId: string,
): Promise<Pick<
  Tables<"v_saldo_deuda">,
  "descripcion" | "moneda" | "restante_centavos" | "saldada_en"
> | null> {
  const { data, error } = await supabase
    .from("v_saldo_deuda")
    .select("descripcion, moneda, restante_centavos, saldada_en")
    .eq("deuda_id", deudaId)
    .maybeSingle();
  if (error) console.error("obtenerSaldoDeuda", error);
  return data ?? null;
}

/**
 * Medio configurado como destino de las transferencias de efectivo
 * (`cajas.destino_efectivo`). `null` si ninguna fila lo tiene marcado — el caller
 * decide el fallback (`DESTINO_EFECTIVO_DEFAULT`, `lib/dominio/transferencias.ts`).
 * Inicio y Tareas lo usan para preseleccionar la cuenta en "Pasar a la
 * cuenta". Antes vivía en `lib/transferencias.ts` — movido acá (lectura sin
 * agregación) junto con el resto de `lib/data/plata.ts`.
 */
export async function obtenerDestinoEfectivo(supabase: Supa): Promise<MedioPago | null> {
  const { data, error } = await supabase
    .from("cajas")
    .select("medio_pago")
    .eq("destino_efectivo", true)
    .maybeSingle();

  if (error) {
    console.error("obtenerDestinoEfectivo", error);
    return null;
  }

  return (data?.medio_pago as MedioPago | undefined) ?? null;
}

/** Lo que Ananja debe, de las dos fuentes que arma este archivo para el
 * bloque "Lo que debe Ananja" de Inicio/Plata. */
export interface DeudaAnanja {
  pedidosPorPagar: PedidoPorPagar[];
  deudasNegocio: DeudaPendienteResumen[];
}

/**
 * Carga las dos fuentes de "lo que Ananja debe" — pedidos al proveedor por
 * pagar (`v_saldo_lote` + `v_saldo_lote_concepto`) y deudas del negocio
 * (`listarDeudasPendientes`, `lib/deudas.ts` — la misma fuente que ya usaba
 * el bloque "Deudas" de `/caja`) — para el bloque "Ananja debe" de `/plata`
 * (reemplaza a `/caja`). Inicio arma estas mismas listas por su cuenta,
 * dentro de `cargarFuentesTareas` (`lib/data/tareas.ts`, que también
 * calcula las Tareas) y no se toca en esta tanda.
 *
 * `pedidosPorPagar` usa acá las mismas consultas y filtros que
 * `cargarFuentesTareas` — pero `deudasNegocio` NO: acá filtra por
 * `saldada_en IS NULL` (sin `fecha` en el resultado, vía
 * `listarDeudasPendientes`) mientras que `cargarFuentesTareas` filtra por
 * `restante_centavos > 0` (con `fecha`, para poder ordenar/vencer la
 * tarea) — una deuda "marcada saldada sin pago" con saldo aún positivo
 * aparecería en uno y no en el otro, así que no se unifican.
 *
 * Un error en cualquier fuente se loguea y esa fuente queda vacía — no
 * tira abajo el resto del bloque.
 */
export async function cargarDeudaAnanja(supabase: Supa): Promise<DeudaAnanja> {
  const [saldoLoteRes, saldoConceptoRes, productosRes, deudasNegocioRes] =
    await Promise.all([
      supabase.from("v_saldo_lote").select("lote_id, fecha, saldo_centavos").gt("saldo_centavos", 0),
      supabase
        .from("v_saldo_lote_concepto")
        .select("lote_id, concepto, producto_id, saldo_centavos")
        .gt("saldo_centavos", 0),
      supabase.from("productos").select("id, presentacion_ml"),
      listarDeudasPendientes(supabase),
    ]);

  if (saldoLoteRes.error) console.error("cargarDeudaAnanja: saldoLote", saldoLoteRes.error);
  if (saldoConceptoRes.error) console.error("cargarDeudaAnanja: saldoConcepto", saldoConceptoRes.error);
  if (productosRes.error) console.error("cargarDeudaAnanja: productos", productosRes.error);

  const presentacionPorProducto = new Map<string, number | null>(
    (productosRes.data ?? []).map((p) => [p.id, p.presentacion_ml]),
  );

  const pedidosPorPagar = agruparPedidosPorPagar(
    (saldoLoteRes.data ?? [])
      .filter((l) => l.lote_id && l.fecha)
      .map((l) => ({
        lote_id: l.lote_id as string,
        fecha: l.fecha as string,
        saldo_centavos: l.saldo_centavos ?? 0,
      })),
    (saldoConceptoRes.data ?? [])
      .filter((c) => c.lote_id && c.concepto)
      .map((c) => ({
        lote_id: c.lote_id as string,
        concepto: c.concepto as string,
        producto_id: c.producto_id,
        saldo_centavos: c.saldo_centavos ?? 0,
      })),
    presentacionPorProducto,
  );

  return {
    pedidosPorPagar,
    deudasNegocio: deudasNegocioRes.data,
  };
}

/** Qué movimientos traer:
 *  - `todo`: los últimos `limite` de cada tipo (lista general de /plata).
 *  - `cuenta`: los que tocan Mercado Pago o Banco (`limite` por tipo).
 *  - `manos`: TODOS los que tocan la plata en mano de esas personas.
 * En todos los casos la lista final pasa por las reglas puras de
 * `lib/dominio/movimientos-plata.ts`, así que reconcilia con el saldo que
 * muestra. */
export type FiltroMovimientos =
  | { tipo: "todo"; limite: number }
  | { tipo: "cuenta"; medio: MedioCuenta; limite: number }
  | { tipo: "manos"; personaIds: string[] };

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Cuántos ids van en cada `.in(...)` — PostgREST los manda en la URL, y
 * una lista larga de uuids la pasa del largo permitido. */
const IDS_POR_CONSULTA = 100;

/** Avisos de coordinadora (`depositos_informados`) detrás de los depósitos
 * dados, por `deposito_id`. Consulta aparte, no un embed implícito (en este
 * proyecto un embed ya se rompió por FKs duplicadas, PGRST201). */
type AvisoDeposito = { resueltoPor: string | null; imagenPath: string | null };

async function avisosPorDeposito(supabase: Supa, depositoIds: string[]): Promise<Map<string, AvisoDeposito>> {
  const avisos = new Map<string, AvisoDeposito>();
  const lotes: string[][] = [];
  for (let i = 0; i < depositoIds.length; i += IDS_POR_CONSULTA) {
    lotes.push(depositoIds.slice(i, i + IDS_POR_CONSULTA));
  }
  const respuestas = await Promise.all(
    lotes.map((ids) =>
      supabase.from("depositos_informados").select("deposito_id, imagen_path, resuelto_por").in("deposito_id", ids),
    ),
  );
  for (const { data, error } of respuestas) {
    if (error) {
      console.error("cargarMovimientosPlata: depositosInformados", error);
      continue;
    }
    for (const a of data ?? []) {
      if (a.deposito_id) avisos.set(a.deposito_id, { resueltoPor: a.resuelto_por, imagenPath: a.imagen_path });
    }
  }
  return avisos;
}

/**
 * Pega el link firmado del comprobante a los depósitos de la lista FINAL
 * (ya recortada/filtrada): se firma solo lo que se va a mostrar, no todo lo
 * que se leyó. Si firmar falla, las filas quedan sin link y la pantalla
 * sigue andando.
 */
async function conComprobantes(
  supabase: Supa,
  filas: FilaMovimiento[],
  avisos: Map<string, AvisoDeposito>,
): Promise<FilaMovimiento[]> {
  const pathDe = (f: FilaMovimiento) => (f.mov.tipo === "deposito" ? (avisos.get(f.id)?.imagenPath ?? null) : null);
  const paths = [...new Set(filas.flatMap((f) => pathDe(f) ?? []))];
  if (paths.length === 0) return filas;

  let urls: Record<string, string | null> = {};
  try {
    urls = await getSignedUrls(paths, 3600, supabase);
  } catch (error) {
    console.error("cargarMovimientosPlata: comprobantes", error);
  }
  return filas.map((f) => {
    const path = pathDe(f);
    return path ? { ...f, comprobanteUrl: urls[path] ?? null } : f;
  });
}

type VendedoresPromise = PromiseLike<{ data: { id: string; nombre: string }[] | null; error: unknown }>;

/**
 * `/plata` llama esta función dos veces por request (lista general "todo" y
 * "en manos de" con `personaIds`) y las dos necesitan el mismo catálogo de
 * `vendedores` sin filtrar. `vendedoresPromise` deja pasar una consulta ya
 * en curso (ej. `listarVendedoresNombre`, `lib/data/catalogos.ts`) para no
 * repetirla — si no se pasa nada, se pide acá adentro como antes.
 */
export async function cargarMovimientosPlata(
  supabase: Supa,
  filtro: FiltroMovimientos,
  vendedoresPromise?: VendedoresPromise,
): Promise<FilaMovimiento[]> {
  if (filtro.tipo === "manos" && filtro.personaIds.length === 0) return [];

  const leer = <T,>(pagina: (desde: number, hasta: number) => Pagina<T>) =>
    filtro.tipo === "manos"
      ? leerTodasLasPaginas(pagina)
      : Promise.resolve(pagina(0, filtro.limite - 1)).then((r) => ({
          data: r.data ?? [],
          error: r.error,
        }));

  const medio: MedioPago | null =
    filtro.tipo === "cuenta" ? filtro.medio : filtro.tipo === "manos" ? "efectivo" : null;
  const personas = filtro.tipo === "manos" ? filtro.personaIds : null;

  const [vendedores, comprobantes, cobros, gastos, pagosDeuda, ajustes, rendiciones, transferencias, depositos] =
    await Promise.all([
      vendedoresPromise ?? supabase.from("vendedores").select("id, nombre"),
      leer((desde, hasta) => {
        let q = supabase
          .from("comprobantes")
          .select("id, cobrado_centavos, medio_pago, fecha, created_at, vendedor_id")
          .gt("cobrado_centavos", 0);
        if (medio) q = q.eq("medio_pago", medio);
        if (personas) q = q.in("vendedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
      leer((desde, hasta) => {
        let q = supabase
          .from("cobros")
          .select("id, monto_centavos, medio_pago, fecha, created_at, vendedor_id, comprobantes(clientes(nombre))");
        if (medio) q = q.eq("medio_pago", medio);
        if (personas) q = q.in("vendedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
      leer((desde, hasta) => {
        let q = supabase
          .from("gastos")
          .select(
            "id, monto_centavos, medio_pago, fecha, created_at, vendedor_id, concepto_pago, categorias_gasto(nombre), productos(presentacion_ml), movimientos_insumo(insumos(nombre))",
          );
        if (medio) q = q.eq("medio_pago", medio);
        if (personas) q = q.in("vendedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
      leer((desde, hasta) => {
        let q = supabase
          .from("pagos_deuda")
          .select("id, monto_caja_centavos, medio_pago, fecha, created_at, vendedor_id, deudas(descripcion)");
        if (medio) q = q.eq("medio_pago", medio);
        if (personas) q = q.in("vendedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
      leer((desde, hasta) => {
        let q = supabase
          .from("ajustes_caja")
          .select("id, monto_centavos, medio_pago, nota, fecha, created_at, vendedor_id");
        if (medio) q = q.eq("medio_pago", medio);
        if (personas) q = q.in("vendedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
      leer((desde, hasta) => {
        let q = supabase
          .from("rendiciones")
          .select("id, monto_centavos, medio_pago, via, fecha, created_at, nota, vendedor_id, tenedor_id");
        if (filtro.tipo === "cuenta") {
          q = q.eq("medio_pago", filtro.medio).in("via", ["directo_cuenta", "cliente_directo"]);
        }
        if (personas) q = q.eq("via", "encargado").in("tenedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
      leer((desde, hasta) => {
        let q = supabase
          .from("transferencias_caja")
          .select("id, monto_centavos, origen, destino, fecha, created_at, nota, vendedor_id");
        if (medio) q = q.or(`origen.eq.${medio},destino.eq.${medio}`);
        if (personas) q = q.in("vendedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
      leer((desde, hasta) => {
        let q = supabase
          .from("depositos_cuenta")
          .select("id, monto_centavos, medio_pago, fecha, created_at, nota, tenedor_id, vendedor_id");
        if (filtro.tipo === "cuenta") q = q.eq("medio_pago", filtro.medio);
        if (personas) q = q.in("tenedor_id", personas);
        return q.order("created_at", { ascending: false }).order("id").range(desde, hasta);
      }),
    ]);

  for (const [nombre, res] of Object.entries({
    vendedores,
    comprobantes,
    cobros,
    gastos,
    pagosDeuda,
    ajustes,
    rendiciones,
    transferencias,
    depositos,
  })) {
    if (res.error) console.error(`cargarMovimientosPlata: ${nombre}`, res.error);
  }

  // Parte Ananja de cada rendición `via = 'encargado'` de esta tanda —
  // 0058_plata_coordinador_costo.sql, BLOCKER 2 de la revisión
  // adversarial: antes se mostraba `rendiciones.monto_centavos` crudo acá
  // (lo que le cobró SU encargado, con margen si es un coordinador), y la
  // suma de la lista no daba el total de `v_plata_en_manos` para un
  // coordinador con margen propio. Se pide por `rendicion_id` exacto (no
  // repitiendo los filtros/paginado de la query de arriba) para no
  // depender de que las dos consultas paginen en el mismo orden.
  const idsEncargado = rendiciones.data.filter((r) => r.via === "encargado").map((r) => r.id);
  const avisosPromise = avisosPorDeposito(
    supabase,
    depositos.data.map((d) => d.id),
  );
  const parteAnanjaPorId = new Map<string, number>();
  if (idsEncargado.length > 0) {
    const { data, error } = await supabase
      .from("v_rendiciones_ananja")
      .select("rendicion_id, monto_ananja_centavos")
      .in("rendicion_id", idsEncargado);
    if (error) {
      console.error("cargarMovimientosPlata: rendicionesAnanja", error);
    } else {
      for (const r of data ?? []) {
        if (r.rendicion_id && r.monto_ananja_centavos !== null) {
          parteAnanjaPorId.set(r.rendicion_id, r.monto_ananja_centavos);
        }
      }
    }
  }

  const avisos = await avisosPromise;

  const nombrePorId = new Map((vendedores.data ?? []).map((v) => [v.id, v.nombre]));
  const nombreDe = (id: string | null) => (id ? (nombrePorId.get(id) ?? "—") : "—");
  const base = (tipo: string, r: { id: string; fecha: string; created_at: string }) => ({
    key: `${tipo}-${r.id}`,
    id: r.id,
    fecha: r.fecha,
    createdAt: r.created_at,
    href: null as string | null,
    ajuste: null as FilaMovimiento["ajuste"],
    deposito: null as FilaMovimiento["deposito"],
    comprobanteUrl: null as FilaMovimiento["comprobanteUrl"],
  });
  const unir = (...partes: (string | null | undefined)[]) =>
    partes.filter((p): p is string => Boolean(p && p.trim())).join(" · ") || null;

  const filas: Omit<FilaMovimiento, "donde">[] = [
    ...comprobantes.data.map((c) => ({
      ...base("comprobante", c),
      mov: {
        tipo: "comprobante" as const,
        medioPago: c.medio_pago,
        vendedorId: c.vendedor_id,
        montoCentavos: c.cobrado_centavos,
      },
      titulo: `Venta · ${MEDIO_PAGO_LABELS[c.medio_pago]}`,
      detalle: nombreDe(c.vendedor_id),
      href: `/comprobantes/${c.id}`,
    })),
    ...cobros.data.map((c) => ({
      ...base("cobro", c),
      mov: { tipo: "cobro" as const, medioPago: c.medio_pago, vendedorId: c.vendedor_id, montoCentavos: c.monto_centavos },
      titulo: `${describirCobro(c.comprobantes?.clientes?.nombre ?? "—")} · ${MEDIO_PAGO_LABELS[c.medio_pago]}`,
      detalle: nombreDe(c.vendedor_id),
    })),
    ...gastos.data.map((g) => {
      const { titulo, categoria } = tituloGasto({
        categoriaNombre: g.categorias_gasto?.nombre,
        conceptoPago: g.concepto_pago,
        presentacionMl: g.productos?.presentacion_ml,
        insumoNombre: insumoDeMovimientos(g.movimientos_insumo),
      });
      return {
        ...base("gasto", g),
        mov: { tipo: "gasto" as const, medioPago: g.medio_pago, vendedorId: g.vendedor_id, montoCentavos: g.monto_centavos },
        titulo: `Gasto · ${titulo}`,
        detalle: unir(categoria, nombreDe(g.vendedor_id)),
        href: `/gastos/${g.id}`,
      };
    }),
    ...pagosDeuda.data.map((p) => ({
      ...base("pago_deuda", p),
      mov: {
        tipo: "pago_deuda" as const,
        medioPago: p.medio_pago,
        vendedorId: p.vendedor_id,
        montoCentavos: p.monto_caja_centavos,
      },
      titulo: describirPagoDeuda(p.deudas?.descripcion ?? "—"),
      detalle: nombreDe(p.vendedor_id),
    })),
    ...ajustes.data.map((a) => ({
      ...base("ajuste", a),
      mov: { tipo: "ajuste" as const, medioPago: a.medio_pago, vendedorId: a.vendedor_id, montoCentavos: a.monto_centavos },
      titulo: `Corrección de saldo · ${MEDIO_PAGO_LABELS[a.medio_pago]}`,
      detalle: unir(a.nota, nombreDe(a.vendedor_id)),
      ajuste: { medioPago: a.medio_pago, nota: a.nota, montoCentavos: a.monto_centavos },
    })),
    ...rendiciones.data.map((r) => {
      const via = r.via as ViaRendicion;
      // Para `via = 'encargado'`, lo que mueve la plata en manos del
      // tenedor es la parte Ananja, no el rendido completo (0058) — con
      // fallback defensivo al crudo si por algo faltara en el mapa (no
      // debería pasar, `idsEncargado` sale de esta misma `rendiciones.data`).
      const montoAnanja = via === "encargado" ? (parteAnanjaPorId.get(r.id) ?? r.monto_centavos) : r.monto_centavos;
      // "Cobró $X" en chico cuando la parte Ananja es distinta de lo que
      // le cobró el encargado a su revendedora (coordinador con margen
      // propio) — su ganancia no se muestra, solo que cobró más.
      const notaCobrado =
        via === "encargado" && montoAnanja !== r.monto_centavos
          ? `cobró ${formatCentavos(r.monto_centavos)}`
          : null;
      return {
        ...base("rendicion", r),
        mov: {
          tipo: "rendicion" as const,
          via,
          medioPago: r.medio_pago,
          tenedorId: r.tenedor_id,
          montoCentavos: montoAnanja,
        },
        titulo: describirRendicion({
          via,
          medioPago: r.medio_pago,
          revendedora: nombreDe(r.vendedor_id),
          tenedor: nombreDe(r.tenedor_id),
        }),
        detalle: unir(via === "encargado" ? notaCobrado : MEDIO_PAGO_LABELS[r.medio_pago], r.nota),
      };
    }),
    ...transferencias.data.map((t) => ({
      ...base("transferencia", t),
      mov: {
        tipo: "transferencia" as const,
        origen: t.origen,
        destino: t.destino,
        vendedorId: t.vendedor_id,
        montoCentavos: t.monto_centavos,
      },
      titulo: describirTransferencia(t.origen, t.destino),
      detalle: unir(t.nota, nombreDe(t.vendedor_id)),
    })),
    ...depositos.data.map((d) => ({
      ...base("deposito", d),
      mov: { tipo: "deposito" as const, medioPago: d.medio_pago, tenedorId: d.tenedor_id, montoCentavos: d.monto_centavos },
      titulo: `${describirDeposito(nombreDe(d.tenedor_id))} · ${MEDIO_PAGO_LABELS[d.medio_pago]}`,
      detalle: detalleDeposito({
        nota: d.nota,
        tenedorId: d.tenedor_id,
        autorId: d.vendedor_id,
        avisado: avisos.has(d.id),
        confirmoId: avisos.get(d.id)?.resueltoPor,
        nombreDe,
      }),
      deposito: { medioPago: d.medio_pago, montoCentavos: d.monto_centavos, tenedor: nombreDe(d.tenedor_id) },
    })),
  ];

  const conDonde: FilaMovimiento[] = filas.map((f) => ({ ...f, donde: textoDonde(f.mov, nombreDe) }));
  const propias =
    filtro.tipo === "cuenta"
      ? conDonde.filter((f) => montoEnCuenta(f.mov, filtro.medio) !== null)
      : filtro.tipo === "manos"
        ? conDonde.filter((f) => filtro.personaIds.some((id) => montoEnManos(f.mov, id) !== null))
        : conDonde;

  const ordenadas = propias.sort(compararPorFechaDesc);
  const finales = filtro.tipo === "todo" ? ordenadas.slice(0, filtro.limite) : ordenadas;
  return conComprobantes(supabase, finales, avisos);
}
