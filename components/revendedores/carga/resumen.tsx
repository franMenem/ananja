import { FilaResumen, ROTULO } from "@/components/revendedores/carga/ui";
import type { ResumenCarga } from "@/lib/dominio/carga-revendedor";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";

/** Resumen en vivo, al pie del formulario y repetido en "Revisá todo": lo
 * mismo que va a quedar guardado si se confirma tal cual está. */
export function Resumen({
  resumen,
  pendienteCentavos,
}: {
  resumen: ResumenCarga;
  pendienteCentavos: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-t-2 border-primary pt-4 text-sm">
      <span className={ROTULO}>Resumen</span>
      <FilaResumen label="Entregadas" valor={`${resumen.botellasEntregadas} ${envase(resumen.botellasEntregadas)}`} />
      <FilaResumen label="Vendidas con precio" valor={resumen.vendidasConPrecio} />
      <FilaResumen label="Vendidas sin precio" valor={resumen.vendidasSinPrecio} />
      <FilaResumen label={`Le debe a ${NEGOCIO.nombre} hoy`} valor={formatCentavos(resumen.deudaAntesCentavos)} />
      <FilaResumen
        label="Después de las ventas"
        valor={formatCentavos(resumen.deudaDespuesVentasCentavos)}
      />
      {resumen.vendidasConPrecio > 0 && (
        <FilaResumen
          label="Ganancia de ella (ventas con precio)"
          valor={formatCentavos(resumen.gananciaConPrecioCentavos)}
        />
      )}
      <FilaResumen label="Pago" valor={formatCentavos(resumen.pagoCentavos)} />
      <FilaResumen
        fuerte
        label={resumen.saldoFinalCentavos >= 0 ? "Queda debiendo" : `${NEGOCIO.nombre} le debe`}
        valor={formatCentavos(Math.abs(resumen.saldoFinalCentavos))}
      />
      {pendienteCentavos > 0 && (
        <p className="text-[11px] text-text-muted">
          Además informó {formatCentavos(pendienteCentavos)} en pagos que todavía no se confirmaron
          (no están descontados acá).
        </p>
      )}
    </div>
  );
}
