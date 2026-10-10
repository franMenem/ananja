import Link from "next/link";

import { BotonAccion } from "@/components/boton-accion";
import { AvisoCargaRepetida } from "@/components/revendedores/aviso-carga-repetida";
import { Resumen } from "@/components/revendedores/carga/resumen";
import { LINK_CHICO, ROTULO } from "@/components/revendedores/carga/ui";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { ENTREGA_NUEVA_ID, type CargaInput, type ResumenCarga } from "@/lib/dominio/carga-revendedor";
import type { CargaParecida } from "@/lib/dominio/cargas-parecidas";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";

/**
 * "Revisá todo": exactamente lo que se va a guardar para la revendedora
 * (mismo `input` que arma `armarPedidoCarga`, mismo FIFO que el RPC en
 * `resumen.ventas`), con el resumen, el error si falló el guardado anterior
 * y el aviso de "carga parecida" (0045) antes de los botones.
 */
export function Revision({
  vendedorId,
  vendedorNombre,
  input,
  resumen,
  pendienteCentavos,
  nombres,
  fechaLotePorId,
  encargadoNombre,
  viaLabel,
  error,
  yaGuardada,
  saving,
  avisoParecidas,
  avisoBuscando,
  onAvisoGuardarIgual,
  onAvisoRevisar,
  onConfirmar,
  onVolverAEditar,
}: {
  vendedorId: string;
  vendedorNombre: string;
  input: CargaInput;
  resumen: ResumenCarga;
  pendienteCentavos: number;
  nombres: Record<string, string>;
  fechaLotePorId: Record<string, string>;
  encargadoNombre: string | null;
  viaLabel: string;
  error: string | null;
  yaGuardada: boolean;
  saving: boolean;
  avisoParecidas: CargaParecida[] | null;
  avisoBuscando: boolean;
  onAvisoGuardarIgual: () => void;
  onAvisoRevisar: () => void;
  onConfirmar: () => void;
  onVolverAEditar: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs leading-relaxed text-text-muted">
        Esto es exactamente lo que se va a guardar para{" "}
        <span className="font-medium text-text">{vendedorNombre}</span>. Se guarda todo junto.
      </p>

      {input.entrega && (
        <div className="flex flex-col gap-1.5 text-sm">
          <span className={ROTULO}>Entrega del {formatFecha(input.entrega.fecha)}</span>
          {input.entrega.filas
            .filter((f) => f.cantidad > 0)
            .map((f) => (
              <div key={f.productoId} className="flex flex-col border-b border-border py-2">
                <span className="font-medium text-text">
                  {nombres[f.productoId]} × {f.cantidad}
                </span>
                <span className="text-[12px] text-text-muted">
                  {f.loteId && fechaLotePorId[f.loteId]
                    ? `Lote del ${formatFecha(fechaLotePorId[f.loteId])}`
                    : "Sin lote"}
                  {" · "}le cobrás {formatCentavos(f.costoCentavos ?? 0)} c/u
                  {f.sugeridoCentavos !== null
                    ? ` · sugerido ${formatCentavos(f.sugeridoCentavos)}`
                    : ""}
                </span>
              </div>
            ))}
          <span className="text-[12px] text-text-muted">
            Si vende todo, por esta entrega le va a deber{" "}
            {formatCentavos(resumen.costoEntregaCentavos)}.
          </span>
        </div>
      )}

      {input.ventas && (
        <div className="flex flex-col gap-1.5 text-sm">
          <span className={ROTULO}>
            Ventas del {formatFecha(input.ventas.fecha)}
            {input.ventas.medioPago ? ` · ${MEDIO_PAGO_LABELS[input.ventas.medioPago]}` : " · sin medio"}
          </span>
          {resumen.ventas.map((v, i) => (
            <div key={i} className="flex flex-col gap-1 border-b border-border py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-text">
                  {nombres[v.productoId]} × {v.cantidad}
                </span>
                <span className="shrink-0 tabular-nums text-text">
                  {v.precioVentaCentavos !== null
                    ? `${formatCentavos(v.precioVentaCentavos)} c/u`
                    : "Sin precio"}
                </span>
              </div>
              {v.tramos.map((t) => (
                <span key={t.entregaItemId} className="text-[12px] text-text-muted">
                  {t.cantidad} de{" "}
                  {t.entregaId === ENTREGA_NUEVA_ID
                    ? `la entrega que estás cargando (${formatFecha(t.fecha)})`
                    : `la entrega del ${formatFecha(t.fecha)}`}
                  {t.loteId && fechaLotePorId[t.loteId]
                    ? `, lote del ${formatFecha(fechaLotePorId[t.loteId])}`
                    : ""}
                  {t.costoUnitarioCentavos !== null
                    ? ` · le debe ${formatCentavos(t.costoUnitarioCentavos)} c/u`
                    : " · sin costo"}
                </span>
              ))}
              {v.faltante > 0 && (
                <span className="text-[12px] text-text-muted">
                  {v.faltante} {envase(v.faltante)} se sacan del depósito (entrega automática):
                  su costo se calcula al guardar.
                </span>
              )}
              <span className="text-[12px] text-text">
                Le suma {formatCentavos(v.costoCentavos ?? 0)} a lo que debe
                {" · "}
                {v.gananciaCentavos !== null
                  ? `ganó ${formatCentavos(v.gananciaCentavos)}`
                  : "ganancia sin calcular (falta el precio)"}
              </span>
            </div>
          ))}
        </div>
      )}

      {input.pago && (
        <div className="flex flex-col gap-1 text-sm">
          <span className={ROTULO}>Pago del {formatFecha(input.pago.fecha)}</span>
          <span className="font-medium text-text">
            {formatCentavos(input.pago.montoCentavos ?? 0)}
            {input.pago.medioPago ? ` · ${MEDIO_PAGO_LABELS[input.pago.medioPago]}` : ""}
          </span>
          <span className="text-[12px] text-text-muted">
            {viaLabel}.{" "}
            {input.pago.via === "encargado"
              ? `Queda en manos de ${encargadoNombre ?? "vos"} hasta que se deposite.`
              : `Entra directo a la cuenta de ${NEGOCIO.nombre}.`}
          </span>
          {input.pago.nota.trim() && (
            <span className="text-[12px] text-text-muted">Nota: {input.pago.nota.trim()}</span>
          )}
        </div>
      )}

      <Resumen resumen={resumen} pendienteCentavos={pendienteCentavos} />

      {error && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm text-accent">{error}</p>
          {yaGuardada && (
            <Link
              href={`/revendedores/${vendedorId}`}
              className={`self-start text-primary ${LINK_CHICO}`}
            >
              Ir a la ficha de {vendedorNombre}
            </Link>
          )}
        </div>
      )}

      {avisoParecidas ? (
        <AvisoCargaRepetida
          parecidas={avisoParecidas}
          cargando={saving}
          onGuardarIgual={onAvisoGuardarIgual}
          onRevisar={onAvisoRevisar}
        />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <BotonAccion
            cargando={saving || avisoBuscando}
            textoCargando="Guardando…"
            type="button"
            onClick={onConfirmar}
            className="flex min-h-[54px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            Confirmar y guardar
          </BotonAccion>
          <button
            type="button"
            onClick={onVolverAEditar}
            disabled={saving || avisoBuscando}
            className="flex min-h-[54px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Volver a editar
          </button>
        </div>
      )}
    </div>
  );
}
