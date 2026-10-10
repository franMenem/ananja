import { AvisoPagoRechazado } from "@/components/mi/aviso-pago-rechazado";
import { CoordinadorHome } from "@/components/mi/coordinador-home";
import { MiInicioVista, type StockProductoMi } from "@/components/mi/inicio-vista";
import { listarMisRevendedoras } from "@/lib/coordinador";
import { listarProductosPublicos, listarValorStockMi, obtenerMiPlataEnMano } from "@/lib/data/mi";
import { obtenerDeudaVendedor } from "@/lib/data/revendedores";
import { hoyISO } from "@/lib/fechas";
import {
  calcularDeudaConPendientes,
  historialPagos,
  pagoEstado,
  pagoRechazadoParaAvisar,
} from "@/lib/dominio/pagos-revendedor";
import { stockPorEntrega } from "@/lib/dominio/revendedor-stock";
import { pagoComoHistorial, ventasComoFifo } from "@/lib/dominio/revendedores";
import {
  listarEntregaItemsFifo,
  listarPagosRevendedor,
  listarPreciosRevendedor,
  listarRendicionesRevendedor,
  listarStockRevendedor,
  listarVentasRevendedor,
  obtenerMiEncargado,
} from "@/lib/revendedores";
import { esCoordinador } from "@/lib/rol-vendedor";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

// Datos en vivo: el stock en poder, la deuda y los pagos cambian con cada
// entrega, venta o confirmación — nunca cachear (mismo criterio que /stock).
export const dynamic = "force-dynamic";

/**
 * `/mi` — inicio de la revendedora (o de un admin en su espacio de
 * revendedor): cuánto le debe a Ananja y cuánto informó sin confirmar, con
 * la acción principal "Pagar a {encargado}" / "Pagar a Ananja"; su stock
 * por presentación, con de qué entrega es cada botella y cuánto le debe por
 * ella (0040_revendedores_pagos_precios.sql); sus últimos pagos y su
 * ganancia. Esta página solo junta los datos; cómo se ven (una columna en
 * mobile, dos en escritorio) está en `components/mi/inicio-vista.tsx`.
 */
export default async function MiPage() {
  const supabase = await createClient();

  const { vendedor: revendedor } = await sesionActual();

  // Un coordinador (0055_coordinador.sql) ve una pantalla completamente
  // distinta acá — sin stock propio, sin ventas: solo sus revendedoras.
  // `app/(mi)/layout.tsx` ya deja pasar a un coordinador con
  // `puedeUsarShellMi`, así que este chequeo tiene que ir ANTES de las
  // queries de revendedor (que no le corresponden).
  if (revendedor && esCoordinador(revendedor)) {
    const [{ data: revendedoras }, { data: productos }, plata] = await Promise.all([
      listarMisRevendedoras(supabase, revendedor.id),
      listarProductosPublicos(supabase),
      // 0057_coordinador_plata_stock.sql: un coordinador ahora puede
      // consultar v_plata_en_manos, pero la vista ya filtra a SOLO su
      // propia fila — no hace falta (ni se puede) filtrar por id acá.
      obtenerMiPlataEnMano(supabase),
    ]);

    return (
      <CoordinadorHome
        vendedorId={revendedor.id}
        nombre={revendedor.nombre}
        revendedoras={revendedoras}
        productos={(productos ?? []).filter(
          (p): p is typeof p & { id: string; nombre: string } => Boolean(p.id && p.nombre),
        ).map((p) => ({ id: p.id, nombre: p.nombre, presentacionMl: p.presentacion_ml }))}
        plataEnManoCentavos={plata ?? 0}
      />
    );
  }

  // `app/(mi)/layout.tsx` ya garantiza `puedeRevender(revendedor)` antes
  // de renderizar esta página — `revendedor` nunca debería ser `null`
  // acá, pero se cubre igual (todo vacío) en vez de asumirlo con `!`.
  const vacio = Promise.resolve({ data: [], error: null });
  const [
    { data: productos },
    { data: stock },
    { data: precios },
    { data: items },
    { data: ventas },
    { data: pagos },
    { data: rendiciones },
    deuda,
    { data: valorStock },
    encargado,
  ] = await Promise.all([
    listarProductosPublicos(supabase),
    revendedor ? listarStockRevendedor(supabase, revendedor.id) : vacio,
    revendedor ? listarPreciosRevendedor(supabase, revendedor.id) : vacio,
    revendedor ? listarEntregaItemsFifo(supabase, revendedor.id) : vacio,
    revendedor ? listarVentasRevendedor(supabase, revendedor.id) : vacio,
    revendedor ? listarPagosRevendedor(supabase, revendedor.id) : vacio,
    revendedor ? listarRendicionesRevendedor(supabase, revendedor.id) : vacio,
    // RLS de `v_deuda_vendedor` ya filtra a la fila propia para un
    // revendedor; el `.eq` explícito cubre al admin con espacio propio.
    revendedor ? obtenerDeudaVendedor(supabase, revendedor.id) : Promise.resolve(null),
    // "Valor en poder" (0059_valor_stock_revendedor_costo_real.sql): acá,
    // a diferencia de la ficha de admin, se usa `valor_en_poder_centavos`
    // (lo que se le cobró A ELLA, no el costo real de Ananja) — es SU
    // deuda, al precio de quien se lo entregó.
    revendedor ? listarValorStockMi(supabase, revendedor.id) : vacio,
    revendedor ? obtenerMiEncargado(supabase) : Promise.resolve(null),
  ]);

  // "Valor en poder" total y a quién se lo debe (0059): si lo que le
  // cobraron (valor_en_poder_centavos) es distinto de lo que cuesta
  // realmente (valor_en_poder_ananja_centavos), quien se lo entregó le
  // cobra con margen — un coordinador, nunca un admin (que siempre cobra
  // al costo real) — así que corresponde el nombre de su encargado. Si
  // coinciden (no hay margen, o no tiene nada en poder todavía), sigue
  // siendo "Ananja" — mismo criterio que ya usa esta pantalla para "Le
  // debés a {encargado}" en la deuda de lo vendido.
  const valorEnPoderCentavos = (valorStock ?? []).reduce((acc, f) => acc + (f.valor_en_poder_centavos ?? 0), 0);
  const valorEnPoderAnanjaCentavos = (valorStock ?? []).reduce(
    (acc, f) => acc + (f.valor_en_poder_ananja_centavos ?? 0),
    0,
  );
  const tieneCoordinadorConMargen = valorEnPoderCentavos !== valorEnPoderAnanjaCentavos;

  const stockPorProducto = new Map(stock.map((s) => [s.producto_id, s.en_poder ?? 0]));
  const precioManualPorProducto = new Map(precios.map((p) => [p.producto_id, p.precio_centavos]));
  const tramos = stockPorEntrega(items, ventasComoFifo(ventas)).filter((t) => t.quedan > 0);
  const deudaResumen = calcularDeudaConPendientes(
    deuda ?? 0,
    pagos.map((p) => ({ montoCentavos: p.monto_centavos, estado: pagoComoHistorial(p).estado })),
  );
  const movimientos = historialPagos(
    pagos.map(pagoComoHistorial),
    rendiciones.map((r) => ({
      id: r.id,
      montoCentavos: r.monto_centavos,
      medioPago: r.medio_pago,
      fecha: r.fecha,
      createdAt: r.created_at,
    })),
  );

  // `v_productos_publicos` reporta columnas nullable (toda vista lo hace en
  // los tipos generados), pero `id` es la PK de `productos` — nunca es null
  // en la práctica. Filtrarlo acá deja el resto del componente sin `?`/`!`.
  const catalogo: StockProductoMi[] = (productos ?? [])
    .filter((p): p is typeof p & { id: string } => p.id !== null)
    .map((p) => {
      const precioManual = precioManualPorProducto.get(p.id) ?? null;
      return {
        id: p.id,
        nombre: p.nombre,
        enPoder: stockPorProducto.get(p.id) ?? 0,
        tramos: tramos
          .filter((t) => t.productoId === p.id)
          .map((t) => ({
            entregaItemId: t.entregaItemId,
            quedan: t.quedan,
            fecha: t.fecha,
            costoCentavos: t.costoAnanjaUnitarioCentavos ?? precioManual,
            sugeridoCentavos: t.precioSugeridoCentavos,
          })),
      };
    });

  // Aviso de pago rechazado: solo si todavía debe, se rechazó hace poco y
  // no hubo después otro pago ni una rendición (ver la función).
  const pagoRechazado = pagoRechazadoParaAvisar(
    pagos.map((p) => ({
      estado: pagoEstado(p.estado),
      createdAt: p.created_at,
      resueltoEn: p.resuelto_en,
      montoCentavos: p.monto_centavos,
      fecha: p.fecha,
      motivoRechazo: p.motivo_rechazo,
    })),
    rendiciones.map((r) => ({ createdAt: r.created_at })),
    deudaResumen.debeCentavos,
    hoyISO(),
  );

  return (
    <>
    {pagoRechazado && (
      <AvisoPagoRechazado
        montoCentavos={pagoRechazado.montoCentavos}
        fecha={pagoRechazado.fecha}
        motivo={pagoRechazado.motivoRechazo}
      />
    )}
    <MiInicioVista
      nombre={revendedor?.nombre ?? null}
      debeCentavos={deudaResumen.debeCentavos}
      pendienteCentavos={deudaResumen.pendienteCentavos}
      encargadoNombre={encargado?.nombre ?? null}
      valorEnPoderCentavos={valorEnPoderCentavos}
      valorEnPoderDestino={tieneCoordinadorConMargen ? (encargado?.nombre ?? null) : null}
      stock={catalogo}
      movimientos={movimientos}
      ventas={ventas.map((v) => ({
        fecha: v.fecha,
        cantidad: v.cantidad,
        precioVentaCentavos: v.precio_venta_centavos,
        precioCostoCentavos: v.precio_costo_centavos,
      }))}
    />
    </>
  );
}
