import { BotellasAdeudadas } from "@/components/revendedores/botellas-adeudadas";
import { AccionesFicha } from "@/components/revendedores/ficha/acciones";
import { CabeceraFicha } from "@/components/revendedores/ficha/cabecera";
import { EnPoderFicha } from "@/components/revendedores/ficha/en-poder";
import { FichaCoordinador } from "@/components/revendedores/ficha/ficha-coordinador";
import { MovimientosFicha } from "@/components/revendedores/ficha/movimientos";
import { PagosFicha } from "@/components/revendedores/ficha/pagos";
import { PlegadosFicha } from "@/components/revendedores/ficha/plegados";
import { VolverLink } from "@/components/volver-link";
import { listarMisRevendedoras } from "@/lib/coordinador";
import { cargarBotellasAdeudadas } from "@/lib/data/botellas-adeudadas";
import {
  cargarEntregasDeVendedores,
  listarEncargadosPosibles,
  listarEntregaItemsDeVendedor,
  listarEntregasDeVendedor,
  listarFechasDeLotes,
  listarProductos,
  listarRendicionesDeVendedor,
  listarVendedoresPorIds,
  listarVentasBorradasDeVendedor,
  listarValorStockDeVendedor,
  obtenerDeudaVendedor,
  obtenerPlataEnManoDeTenedor,
  obtenerVendedorPorId,
} from "@/lib/data/revendedores";
import { armarEntregasCoordinadora } from "@/lib/dominio/entregas-coordinador";
import {
  entregasComoMovimientos,
  fusionarMovimientos,
  primerGrupoSinPrecio,
  ventasComoMovimientos,
} from "@/lib/dominio/movimientos-revendedor";
import { calcularDeudaConPendientes, historialPagos } from "@/lib/dominio/pagos-revendedor";
import { obtenerVersionVigente } from "@/lib/precios";
import { pagoComoHistorial } from "@/lib/dominio/revendedores";
import {
  listarPagosRevendedor,
  listarPreciosRevendedor,
  listarStockRevendedor,
  listarVentasRevendedor,
  obtenerResumenRevendedor,
} from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/server";
import { agruparVentasBorradas } from "@/lib/dominio/ventas-revendedor";

export const dynamic = "force-dynamic";

/**
 * `/revendedores/[id]` — "¿cómo está X conmigo?" (rediseño "de 10 bloques a
 * 5", 2026-09-16): cabecera con la deuda, dos acciones, en poder, pagos, un
 * hilo único de movimientos y dos `<details>` al pie. Carga los datos y los
 * arma; cada bloque vive en `components/revendedores/ficha/*`.
 *
 * Un coordinador (0055/0057_coordinador_plata_stock.sql) no es una
 * revendedora — sin stock, sin ventas, sin deuda — así que después de
 * saber el rol la página se bifurca: acciones/en poder/pagos/movimientos/
 * ganancia no le corresponden (saldrían todos en 0, "números raros" que
 * no significan nada); en su lugar arma `FichaCoordinador` con sus
 * revendedoras a cargo y su plata en mano.
 *
 * Todas las fuentes (las de la ficha de revendedora Y las de la ficha de
 * coordinador) se piden en UNA sola tanda, antes de saber el rol: no hay
 * forma de saberlo sin traer primero la fila de `vendedores`, así que en
 * vez de esperarla sola y recién después pedir el resto (dos tandas
 * seriadas), se piden todas en paralelo y las que no corresponden al rol
 * final simplemente no se usan — más barato que una tanda extra.
 *
 * 2026-09-21: `/revendedores` (el listado) YA sabe el rol de cada fila
 * cuando arma el link — se lo pasa acá como pista, `?rol=coordinador`
 * (revendedor/admin no manda nada, que es el caso común). La pista es
 * SOLO una optimización: se valida siempre contra `revendedor.rol` de
 * esta misma tanda (fuente de verdad) y, si faltaba o era falsa, se pide
 * la tanda que realmente hace falta como segunda tanda — nunca se
 * confía en la pista sola. Así un coordinador (minoría, ver
 * `/revendedores`) no arrastra las ~14 consultas de la ficha de
 * revendedora que no va a usar, y viceversa si la pista fallara.
 */
export default async function RevendedorDetallePage({
  params,
  searchParams,
}: PageProps<"/revendedores/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const rolParam = Array.isArray(sp.rol) ? sp.rol[0] : sp.rol;
  const pistaCoordinador = rolParam === "coordinador";
  const supabase = await createClient();

  const cargarTandaCoordinador = async () => {
    const [{ data: revendedoras }, plataEnMano, { data: productos }] = await Promise.all([
      listarMisRevendedoras(supabase, id),
      obtenerPlataEnManoDeTenedor(supabase, id),
      listarProductos(supabase),
    ]);

    // "Entregas a sus revendedoras": las de las revendedoras que HOY tiene a
    // cargo. Depende de saber quiénes son, así que va después; y los
    // nombres de quienes cargaron una entrega (un admin, que no está entre
    // las revendedoras) dependen de las entregas.
    // Las botellas que se le deben a Ananja (sus revendedoras + su plata)
    // se piden en paralelo; si fallan, el bloque dice "No se pudo calcular."
    const [{ data: datosEntregas, error: errorEntregas }, botellas] = await Promise.all([
      cargarEntregasDeVendedores(
        supabase,
        revendedoras.map((r) => r.id),
      ),
      cargarBotellasAdeudadas(supabase, {
        tipo: "coordinadora",
        coordinadoraId: id,
        revendedoraIds: revendedoras.map((r) => r.id),
      }).catch((error) => {
        console.error("cargarBotellasAdeudadas", error);
        return null;
      }),
    ]);
    const nombrePorVendedor = new Map(revendedoras.map((r) => [r.id, r.nombre]));
    const idsSinNombre = [
      ...new Set(datosEntregas.entregas.map((e) => e.admin_id).filter((adminId) => !nombrePorVendedor.has(adminId))),
    ];
    const { data: quienes } = await listarVendedoresPorIds(supabase, idsSinNombre);
    for (const q of quienes) nombrePorVendedor.set(q.id, q.nombre);

    const entregas = errorEntregas
      ? null
      : armarEntregasCoordinadora({
          coordinadorId: id,
          entregas: datosEntregas.entregas,
          items: datosEntregas.items,
          nombrePorVendedor,
          nombrePorProducto: new Map(productos.map((p) => [p.id, p.nombre])),
          fechaPorLote: datosEntregas.fechaPorLote,
        });
    return { revendedoras, plataEnMano, entregas, botellas };
  };

  const cargarTandaRevendedora = async () => {
    const [
      { data: productos },
      { data: precios },
      { data: stock },
      { data: entregas },
      { data: entregaItems },
      { data: ventas },
      { data: rendiciones },
      resumen,
      deuda,
      { data: pagos },
      { data: coordinadores },
      { data: borradasFilas },
      { data: valorStock },
      vigente,
      botellas,
    ] = await Promise.all([
      listarProductos(supabase),
      listarPreciosRevendedor(supabase, id),
      listarStockRevendedor(supabase, id),
      listarEntregasDeVendedor(supabase, id),
      listarEntregaItemsDeVendedor(supabase, id),
      listarVentasRevendedor(supabase, id),
      listarRendicionesDeVendedor(supabase, id),
      obtenerResumenRevendedor(supabase, id),
      // "Le debe a Ananja" (`supabase/migrations/0037_plata_en_manos.sql`,
      // ver memoria "Plata: rediseño") — numéricamente igual al `debe` de
      // `resumen`, pero es la vista del sector Plata: se lee acá directo
      // para no acoplar esta pantalla a que `v_resumen_revendedor` siga
      // existiendo.
      obtenerDeudaVendedor(supabase, id),
      listarPagosRevendedor(supabase, id),
      // Opciones de "Coordinador" (0055): admins Y coordinadores activos.
      listarEncargadosPosibles(supabase),
      // Ventas borradas (0045): foto de cada fila borrada, con quién y cuándo.
      listarVentasBorradasDeVendedor(supabase, id),
      // "Valor en poder" en pesos (`0059_valor_stock_revendedor_costo_real.sql`):
      // el costo REAL de Ananja, no el precio de un eventual coordinador —
      // ver `EnPoderFicha`.
      listarValorStockDeVendedor(supabase, id),
      obtenerVersionVigente(supabase).catch(() => null),
      // "Le debe a Ananja N botellas": en poder + vendidas sin pagar.
      cargarBotellasAdeudadas(supabase, { tipo: "revendedora", vendedorId: id }).catch((error) => {
        console.error("cargarBotellasAdeudadas", error);
        return null;
      }),
    ]);
    // Fecha de los lotes de esas entregas, para rotular "Lote del D/M" en
    // el hilo de movimientos (depende de los ítems, así que va después).
    const { data: lotes } = await listarFechasDeLotes(
      supabase,
      entregaItems.flatMap((i) => (i.lote_id ? [i.lote_id] : [])),
    );
    return {
      productos,
      precios,
      stock,
      entregas,
      entregaItems,
      fechaPorLote: new Map(lotes.map((l) => [l.id, l.fecha])),
      ventas,
      rendiciones,
      resumen,
      deuda,
      pagos,
      coordinadores,
      borradasFilas,
      valorStock,
      vigente,
      botellas,
    };
  };

  const [revendedor, tandaAdelantada] = await Promise.all([
    obtenerVendedorPorId(supabase, id),
    pistaCoordinador ? cargarTandaCoordinador() : cargarTandaRevendedora(),
  ]);

  if (!revendedor) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/revendedores" label="revendedores" />
        <p className="text-sm text-text-muted">No encontramos este revendedor.</p>
      </div>
    );
  }

  if (revendedor.rol === "coordinador") {
    // La pista acertó (mandó `?rol=coordinador`) → ya la tenemos. Si no
    // había pista o era de una revendedora, esta es la segunda tanda.
    const { revendedoras, plataEnMano, entregas, botellas } = pistaCoordinador
      ? (tandaAdelantada as Awaited<ReturnType<typeof cargarTandaCoordinador>>)
      : await cargarTandaCoordinador();

    return (
      <div className="flex flex-col gap-8 pb-8">
        <VolverLink href="/revendedores" label="revendedores" />

        <CabeceraFicha
          vendedorId={id}
          nombre={revendedor.nombre}
          rol={revendedor.rol}
          revende={revendedor.revende}
          debeCentavos={0}
          pendienteCentavos={0}
          rendidoCentavos={0}
          encargadoActualId={null}
          coordinadores={[]}
        />

        <FichaCoordinador
          revendedoras={revendedoras}
          plataEnManoCentavos={plataEnMano ?? 0}
          entregas={entregas}
          botellas={botellas}
        />
      </div>
    );
  }

  // Misma lógica que arriba, en espejo: si la pista era "coordinador" (y
  // esta persona no lo es), la tanda adelantada no sirve — segunda tanda.
  const {
    productos,
    precios,
    stock,
    entregas,
    entregaItems,
    fechaPorLote,
    ventas,
    rendiciones,
    resumen,
    deuda,
    pagos,
    coordinadores,
    borradasFilas,
    valorStock,
    vigente,
    botellas,
  } = pistaCoordinador
    ? await cargarTandaRevendedora()
    : (tandaAdelantada as Awaited<ReturnType<typeof cargarTandaRevendedora>>);

  const nombrePorProducto = new Map((productos ?? []).map((p) => [p.id, p.nombre]));
  const preciosPorProducto = new Map((precios ?? []).map((p) => [p.producto_id, p.precio_centavos]));
  const stockPorProducto = new Map((stock ?? []).map((s) => [s.producto_id, s.en_poder ?? 0]));
  const valorAnanjaPorProducto = new Map(
    (valorStock ?? []).map((v) => [v.producto_id, v.valor_en_poder_ananja_centavos ?? 0]),
  );
  const mayoristaPorProducto = new Map(
    (vigente?.items ?? []).map((i) => [i.producto_id, i.precio_mayorista_centavos]),
  );

  const historial = pagos.map(pagoComoHistorial);
  const deudaResumen = calcularDeudaConPendientes(
    deuda ?? 0,
    historial.map((p) => ({ montoCentavos: p.montoCentavos, estado: p.estado })),
  );
  const movimientosPago = historialPagos(
    historial,
    (rendiciones ?? []).map((r) => ({
      id: r.id,
      montoCentavos: r.monto_centavos,
      medioPago: r.medio_pago,
      fecha: r.fecha,
      createdAt: r.created_at,
    })),
  );

  // Entregas + devoluciones y ventas (agrupadas por `grupo_id`), fusionadas
  // en el hilo único de "Movimientos". Se pasa el hilo COMPLETO (sin el
  // recorte de `LIMITE_MOVIMIENTOS_VISIBLES`): `MovimientosFicha` hace el
  // recorte a la vista y el botón "Ver todos" en el cliente, así
  // `primerGrupoSinPrecio` puede encontrar una venta sin precio aunque sea
  // vieja y quede fuera de lo que se ve de entrada.
  const movimientos = fusionarMovimientos(
    entregasComoMovimientos(entregas ?? [], entregaItems ?? [], fechaPorLote),
    ventasComoMovimientos(ventas),
    Number.POSITIVE_INFINITY,
  );
  const grupoSinPrecio = primerGrupoSinPrecio(movimientos);

  // Ventas borradas (0045 § 1). La borró un admin o ella misma; los nombres
  // se piden aparte (la tabla no tiene FKs, a propósito).
  const ventasBorradas = agruparVentasBorradas(borradasFilas ?? []);
  const idsBorradores = [...new Set(ventasBorradas.flatMap((v) => (v.borradaPor ? [v.borradaPor] : [])))];
  const { data: borradores } = await listarVendedoresPorIds(supabase, idsBorradores);
  const nombreBorrador = new Map((borradores ?? []).map((b) => [b.id, b.nombre]));

  return (
    <div className="flex flex-col gap-8 pb-8">
      <VolverLink href="/revendedores" label="revendedores" />

      <CabeceraFicha
        vendedorId={id}
        nombre={revendedor.nombre}
        rol={revendedor.rol}
        revende={revendedor.revende}
        debeCentavos={deudaResumen.debeCentavos}
        pendienteCentavos={deudaResumen.pendienteCentavos}
        rendidoCentavos={resumen?.rendido_centavos ?? 0}
        encargadoActualId={revendedor.encargado_id}
        coordinadores={coordinadores}
      />

      <AccionesFicha vendedorId={id} />

      <BotellasAdeudadas resumen={botellas} variante="revendedora" />

      <EnPoderFicha
        vendedorId={id}
        productos={(productos ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          enPoder: stockPorProducto.get(p.id) ?? 0,
          precioActualCentavos: preciosPorProducto.get(p.id) ?? null,
          precioMayoristaCentavos: mayoristaPorProducto.get(p.id) ?? null,
          valorEnPoderCentavos: valorAnanjaPorProducto.get(p.id) ?? 0,
        }))}
      />

      <PagosFicha movimientos={movimientosPago} />

      <MovimientosFicha
        movimientos={movimientos}
        nombrePorProducto={nombrePorProducto}
        primerGrupoSinPrecio={grupoSinPrecio}
      />

      <PlegadosFicha
        ventasGanancia={ventas.map((v) => ({
          fecha: v.fecha,
          cantidad: v.cantidad,
          precioVentaCentavos: v.precio_venta_centavos,
          precioCostoCentavos: v.precio_costo_centavos,
        }))}
        ventasBorradas={ventasBorradas}
        nombrePorProducto={nombrePorProducto}
        nombreBorrador={nombreBorrador}
      />
    </div>
  );
}
