"use client";

import { useState } from "react";

import { MensajeError } from "@/components/ui/campo";
import { AccionesForm } from "@/components/ui/acciones-form";
import { SetFormHeader } from "@/components/page-header-context";
import { AlertaStock } from "@/components/revendedores/carga/alerta-stock";
import { Resumen } from "@/components/revendedores/carga/resumen";
import { Revision } from "@/components/revendedores/carga/revision";
import { SeccionEntrega } from "@/components/revendedores/carga/seccion-entrega";
import { SeccionPago, type OpcionVia } from "@/components/revendedores/carga/seccion-pago";
import { SeccionVentas } from "@/components/revendedores/carga/seccion-ventas";
import type { PagoPendienteCarga } from "@/components/revendedores/carga/tipos";
import { ListaProblemas } from "@/components/revendedores/carga/ui";
import { useEntregaCarga } from "@/components/revendedores/carga/use-entrega";
import { useGuardadoCarga } from "@/components/revendedores/carga/use-guardado";
import { usePagoCarga } from "@/components/revendedores/carga/use-pago";
import { useVentasCarga } from "@/components/revendedores/carga/use-ventas";
import { useCargasParecidas } from "@/components/revendedores/aviso-carga-repetida";
import { busquedaDeCarga } from "@/lib/dominio/cargas-parecidas";
import {
  disponiblePorProducto,
  entregadoPorProducto,
  montoPagoSugerido,
  resumirCarga,
  stockConEntregaNueva,
  validarCarga,
  type CargaInput,
  type EstadoRevendedora,
  type TextosCarga,
} from "@/lib/dominio/carga-revendedor";
import { formatFecha } from "@/lib/fechas";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { NEGOCIO, envase } from "@/lib/negocio";
import type { EntregaItemFifo, VentaFifo } from "@/lib/dominio/revendedor-stock";

export type { PagoPendienteCarga } from "@/components/revendedores/carga/tipos";

type CargaFormProps = {
  vendedorId: string;
  vendedorNombre: string;
  /** Qué sección abre por defecto (`?abrir=` de la página, las otras
   * plegadas) — lo usan los redirects de las rutas viejas /entrega,
   * /ventas/nueva y /rendicion. Sin parámetro, la página manda "entrega". */
  seccionInicial: "entrega" | "ventas" | "pago";
  /** La pantalla se abrió para UNA acción (`?seccion=`/`?abrir=`): el título
   * dice esa acción, solo esa sección se ve abierta y las otras quedan como
   * links "+ Agregar también…". Sin esto, se ven las tres como hasta ahora. */
  conSeccion?: boolean;
  /** Encargado que queda con la plata en mano (solo si es admin activo), o
   * `null` → queda el admin que carga. */
  encargadoNombre: string | null;
  deudaCentavos: number;
  /** "Agarra directo del depósito" (0073): el faltante de stock en las
   * ventas deja de ser un problema y pasa a ser un aviso. */
  tomaDirecto?: boolean;
  /** Pagos que ella informó y todavía no se confirmaron ni rechazaron. */
  pagosPendientes: PagoPendienteCarga[];
  productos: { id: string; nombre: string }[];
  lotes: LoteConStockDeProducto[];
  items: EntregaItemFifo[];
  ventas: VentaFifo[];
  preciosManuales: Record<string, number | null>;
  fechaLotePorId: Record<string, string>;
  /** "yyyy-mm-dd" de hoy en Argentina (lo calcula el server). */
  hoy: string;
};

/**
 * "Cargar movimiento" (`/revendedores/[id]/carga`, solo admins, único
 * formulario de carga desde el rediseño "de 10 bloques a 5", 2026-09-16):
 * tres partes opcionales — Entrega, Ventas y Pago —, la que indique
 * `seccionInicial` abierta y las otras plegadas, con un resumen en vivo
 * abajo, un paso "Revisá todo" que muestra exactamente lo que se va a
 * guardar (de qué entrega y lote sale cada botella vendida, mismo FIFO que
 * el RPC) y un único guardado atómico con `registrar_carga_revendedor`
 * (0043). La clave de idempotencia se genera una vez por formulario: si se
 * corta la conexión y se vuelve a confirmar, no se duplica nada.
 *
 * Orquestador: el estado y la lógica de cada sección viven en
 * `components/revendedores/carga/*` (un hook por sección — entrega, ventas,
 * pago — más el flujo de guardado), este componente solo compone los
 * `input` de cada sección en el `CargaInput` que ve `lib/dominio/
 * carga-revendedor.ts` y pasa a cada sub-componente lo mínimo que necesita.
 */
export function CargaForm({
  vendedorId,
  vendedorNombre,
  seccionInicial,
  conSeccion = false,
  encargadoNombre,
  deudaCentavos,
  tomaDirecto = false,
  pagosPendientes,
  productos,
  lotes,
  items,
  ventas,
  preciosManuales,
  fechaLotePorId,
  hoy,
}: CargaFormProps) {
  const [clave] = useState(() => crypto.randomUUID());

  const entrega = useEntregaCarga({ productos, lotes, hoy, activaInicial: seccionInicial === "entrega" });

  const nombres = Object.fromEntries(productos.map((p) => [p.id, p.nombre]));
  const textos: TextosCarga = {
    nombres,
    negocio: NEGOCIO.nombre,
    envasePlural: envase(2),
    formatFecha,
  };
  const estado: EstadoRevendedora = {
    items,
    ventas,
    preciosManuales,
    deudaCentavos,
    hoy,
    tomaDirecto,
  };

  const tramos = stockConEntregaNueva(estado, entrega.input);
  const disponible = disponiblePorProducto(tramos);
  const entregado = entregadoPorProducto(entrega.input);

  const ventasSeccion = useVentasCarga({
    productos,
    tramos,
    entregaInput: entrega.input,
    hoy,
    activaInicial: seccionInicial === "ventas",
  });

  const resumenSinPago = resumirCarga(estado, {
    entrega: entrega.input,
    ventas: ventasSeccion.input,
    pago: null,
  });
  const pendienteCentavos = pagosPendientes.reduce((acc, p) => acc + p.montoCentavos, 0);
  const montoSugerido = montoPagoSugerido(resumenSinPago.deudaDespuesVentasCentavos, pendienteCentavos);

  const pago = usePagoCarga({ hoy, montoSugerido, activaInicial: seccionInicial === "pago" });

  const input: CargaInput = { entrega: entrega.input, ventas: ventasSeccion.input, pago: pago.input };
  const resumen = resumirCarga(estado, input);
  const problemas = validarCarga(estado, input, textos);

  const guardado = useGuardadoCarga({ vendedorId, clave, input, problemas, textos });
  // "Ya hay algo igual cargado" (0045).
  const aviso = useCargasParecidas(vendedorId);

  /** "Confirmar y guardar": antes avisa si ya hay algo muy parecido cargado
   * para esta revendedora (0045). Con la clave, un reintento de esta misma
   * carga no se avisa contra sí mismo. */
  async function confirmar() {
    guardado.setError(null);
    if (!(await aviso.puedeGuardar(busquedaDeCarga(input), clave))) return;
    await guardado.guardar(entrega.permitirNegativo);
  }

  const opcionesVia: OpcionVia[] = [
    {
      value: "encargado",
      label: encargadoNombre ? `Se la dio a su encargado (${encargadoNombre})` : "Se la dio a vos",
    },
    { value: "directo_cuenta", label: `La transfirió a la cuenta de ${NEGOCIO.nombre}` },
    { value: "cliente_directo", label: "Un cliente pagó directo a la cuenta" },
  ];
  const viaLabel = opcionesVia.find((o) => o.value === pago.via)?.label ?? "";

  const vendidas = resumen.vendidasConPrecio + resumen.vendidasSinPrecio;

  const problemasDe = (seccion: "general" | "entrega" | "ventas" | "pago") =>
    guardado.mostrarProblemas ? problemas.filter((p) => p.seccion === seccion) : [];

  const titulos = {
    entrega: `Entregar botellas a ${vendedorNombre}`,
    ventas: `Registrar venta de ${vendedorNombre}`,
    pago: `Registrar pago de ${vendedorNombre}`,
  } as const;
  const preguntas = {
    entrega: "¿Qué botellas se lleva y de qué pedido?",
    ventas: "¿Qué vendió y a cuánto?",
    pago: "¿Cuánto te pagó y cómo te lo dio?",
  } as const;
  const titulo = conSeccion ? titulos[seccionInicial] : `Cargar movimiento de ${vendedorNombre}`;
  const pregunta = conSeccion
    ? preguntas[seccionInicial]
    : "¿Qué pasó? Sumá solo las partes que necesites: se guarda todo junto, o no se guarda nada.";

  // Las secciones, con la principal primero cuando la pantalla se abrió para
  // una sola acción. El orden de lectura es el del DOM.
  const principal = (s: "entrega" | "ventas" | "pago") => conSeccion && seccionInicial === s;
  const enlace = (s: "entrega" | "ventas" | "pago", texto: string) => (conSeccion && !principal(s) ? texto : undefined);

  const nodoEntrega = (
    <SeccionEntrega
      key="entrega"
      activa={entrega.activa}
      onToggle={entrega.toggle}
      bloqueada={principal("entrega")}
      comoEnlace={enlace("entrega", "+ Agregar también una entrega")}
      hoy={hoy}
      fecha={entrega.fecha}
      onCambiarFecha={entrega.cambiarFecha}
      productos={productos}
      lotes={lotes}
      filas={entrega.filas}
      onActualizarFila={entrega.actualizarFila}
      onCambiarLote={entrega.cambiarLote}
      botellasEntregadas={resumen.botellasEntregadas}
      problemas={problemasDe("entrega")}
    />
  );
  const nodoVentas = (
    <SeccionVentas
      key="ventas"
      activa={ventasSeccion.activa}
      onToggle={ventasSeccion.toggle}
      bloqueada={principal("ventas")}
      comoEnlace={enlace("ventas", "+ Agregar también una venta")}
      hoy={hoy}
      fechaEfectiva={ventasSeccion.fechaEfectiva}
      fechaSinDefault={ventasSeccion.fecha}
      onCambiarFecha={ventasSeccion.setFecha}
      conEntrega={entrega.activa}
      vendedorNombre={vendedorNombre}
      tomaDirecto={tomaDirecto}
      delDeposito={resumen.delDeposito}
      productos={productos}
      disponible={disponible}
      entregado={entregado}
      tramos={tramos}
      lineas={ventasSeccion.lineas}
      fechaLotePorId={fechaLotePorId}
      onActualizarLinea={ventasSeccion.actualizarLinea}
      onAgregarLinea={ventasSeccion.agregarLinea}
      onQuitarLinea={ventasSeccion.quitarLinea}
      onVenderTodo={ventasSeccion.venderTodo}
      medioPago={ventasSeccion.medioPago}
      onCambiarMedioPago={ventasSeccion.setMedioPago}
      vendidas={vendidas}
      problemas={problemasDe("ventas")}
    />
  );
  const nodoPago = (
    <SeccionPago
      key="pago"
      activa={pago.activa}
      onToggle={pago.toggle}
      bloqueada={principal("pago")}
      comoEnlace={enlace("pago", "+ Agregar también un pago")}
      hoy={hoy}
      vendedorNombre={vendedorNombre}
      encargadoNombre={encargadoNombre}
      opcionesVia={opcionesVia}
      via={pago.via}
      onCambiarVia={pago.cambiarVia}
      pagosPendientes={pagosPendientes}
      pendienteCentavos={pendienteCentavos}
      montoEnPantalla={pago.montoEnPantalla}
      onCambiarMonto={pago.setMontoTexto}
      onMontoTodo={() => pago.setMontoTexto(null)}
      onMontoBorrar={() => pago.setMontoTexto("")}
      deudaDespuesVentasCentavos={resumen.deudaDespuesVentasCentavos}
      medioPago={pago.medioPago}
      onCambiarMedioPago={pago.setMedioPago}
      fecha={pago.fecha}
      onCambiarFecha={pago.setFecha}
      nota={pago.nota}
      onCambiarNota={pago.setNota}
      pagoCentavos={resumen.pagoCentavos}
      problemas={problemasDe("pago")}
    />
  );
  const porSeccion = { entrega: nodoEntrega, ventas: nodoVentas, pago: nodoPago };
  const ordenNatural = ["entrega", "ventas", "pago"] as const;
  const orden = conSeccion
    ? [seccionInicial, ...ordenNatural.filter((x) => x !== seccionInicial)]
    : [...ordenNatural];

  return (
    <>
      <SetFormHeader
        title={guardado.revisando ? "Revisá todo" : titulo}
        backHref={`/revendedores/${vendedorId}`}
        backLabel="Volver al revendedor"
      />

      {/* Se oculta (no se desmonta) durante la revisión: "Volver a editar"
          conserva todo lo cargado. */}
      <div hidden={guardado.revisando} className="flex flex-col gap-5">
        <p className="text-[15px] leading-relaxed text-text-muted">{pregunta}</p>

        {orden.map((x) => porSeccion[x])}

        <ListaProblemas problemas={problemasDe("general")} />

        <Resumen resumen={resumen} pendienteCentavos={pendienteCentavos} />

        {guardado.error && !guardado.revisando && <MensajeError>{guardado.error}</MensajeError>}

        <AccionesForm
          type="button"
          onClick={guardado.handleRevisar}
          etiqueta="Revisar antes de guardar"
          cancelarHref={`/revendedores/${vendedorId}`}
          fija
        />
      </div>

      {guardado.revisando && (
        <Revision
          vendedorId={vendedorId}
          vendedorNombre={vendedorNombre}
          input={input}
          resumen={resumen}
          pendienteCentavos={pendienteCentavos}
          nombres={nombres}
          fechaLotePorId={fechaLotePorId}
          encargadoNombre={encargadoNombre}
          viaLabel={viaLabel}
          error={guardado.error}
          yaGuardada={guardado.yaGuardada}
          saving={guardado.saving}
          avisoParecidas={aviso.parecidas}
          avisoBuscando={aviso.buscando}
          onAvisoGuardarIgual={() => {
            aviso.guardarIgual();
            void confirmar();
          }}
          onAvisoRevisar={() => {
            aviso.revisar();
            guardado.setRevisando(false);
          }}
          onConfirmar={() => void confirmar()}
          onVolverAEditar={guardado.volverAEditar}
        />
      )}

      <AlertaStock
        alertaStock={guardado.alertaStock}
        saving={guardado.saving}
        onGuardarIgual={() => {
          entrega.setPermitirNegativo(true);
          void guardado.guardar(true);
        }}
        onCerrar={guardado.cerrarAlertaStock}
      />
    </>
  );
}
