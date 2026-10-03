import Link from "next/link";
import { notFound } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { ListaMovimientos } from "@/components/caja/lista-movimientos";
import { cargarMovimientosPlata, obtenerPersonaEnManos } from "@/lib/data/plata";
import { diasEntre, fechaArgentinaDeTimestamp, hoyISO } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { ingresosEnManos, montoEnManos } from "@/lib/dominio/movimientos-plata";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";
import { fechaPlataEnManoMasVieja } from "@/lib/dominio/tareas";

export const dynamic = "force-dynamic";

function desdeTexto(dias: number): string {
  if (dias <= 0) return "desde hoy";
  if (dias === 1) return "desde hace 1 día";
  return `desde hace ${dias} días`;
}

/**
 * `/plata/en-manos/[id]` — de dónde sale la plata que tiene una persona en
 * mano (`v_plata_en_manos`): lo que le entró (pagos de revendedoras que
 * recibió, ventas y cobros en efectivo, transferencias a efectivo) y lo que
 * le salió (lo que pasó a la cuenta, gastos y pagos de deuda en efectivo),
 * línea por línea. La lista sale de las mismas reglas que la vista
 * (`lib/movimientos-plata.ts`), así que su suma es el total.
 */
export default async function EnManosPage({ params }: PageProps<"/plata/en-manos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [persona, filas] = await Promise.all([
    obtenerPersonaEnManos(supabase, id),
    cargarMovimientosPlata(supabase, { tipo: "manos", personaIds: [id] }),
  ]);

  if (!persona?.tenedor_id || !persona.nombre) notFound();

  const nombre = persona.nombre;
  const total = persona.total_centavos ?? 0;
  // 0058: un coordinador con margen propio (le cobra más a su revendedora
  // de lo que Ananja le exige) tiene en la mano MÁS plata de la que le
  // corresponde pasar — `total` acá ya es solo la parte Ananja. Para no
  // mostrarle a un admin "Laura tiene en mano" un número que no es todo
  // lo que ella realmente tiene físicamente, un coordinador se etiqueta
  // distinto: lo que "tiene que pasar", no lo que "tiene en mano". Su
  // ganancia no se muestra en ningún lado (pedido de Fran).
  const esCoordinador = persona.rol === "coordinador";
  const etiquetaTotal = esCoordinador ? "tiene que pasar a Ananja" : "tiene en mano";
  const etiquetaDesglose = esCoordinador ? "Tiene que pasar a Ananja" : "Tiene en mano";
  const items = filas.map((fila) => ({ fila, montoCentavos: montoEnManos(fila.mov, id) ?? 0 }));
  const sumaLista = items.reduce((acc, i) => acc + i.montoCentavos, 0);
  const desde = fechaPlataEnManoMasVieja(
    ingresosEnManos(filas, id, fechaArgentinaDeTimestamp),
    total,
  );

  const transferencias = persona.transferencias_centavos ?? 0;
  const ajustes = persona.ajustes_centavos ?? 0;
  const desglose: { label: string; centavos: number }[] = [
    { label: "Pagos de revendedoras que recibió", centavos: persona.rendiciones_centavos ?? 0 },
    { label: "Ventas y cobros en efectivo", centavos: persona.ventas_cobros_centavos ?? 0 },
    { label: "Transferencias (neto)", centavos: transferencias },
    { label: "Correcciones de saldo (neto)", centavos: ajustes },
    { label: `Pasó a la cuenta de ${NEGOCIO.nombre}`, centavos: -(persona.depositos_centavos ?? 0) },
    { label: "Gastos pagados en efectivo", centavos: -(persona.gastos_centavos ?? 0) },
    { label: "Pagos de deuda en efectivo", centavos: -(persona.pagos_deuda_centavos ?? 0) },
  ].filter((d) => d.centavos !== 0);

  return (
    <FormPage title={`En manos de ${nombre}`} backHref="/plata" backLabel="Volver a Plata" maxWidth={760} pb>
      <div>
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          {nombre} {etiquetaTotal}
        </span>
        <p
          className={`font-display text-[40px] leading-[1] tabular-nums ${
            total < 0 ? "text-accent" : "text-primary"
          }`}
        >
          {formatCentavos(total)}
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
          {total > 0
            ? `Es plata de ${NEGOCIO.nombre} que todavía no pasó a la cuenta${
                desde ? ` (la más vieja, ${desdeTexto(diasEntre(desde, hoyISO()))})` : ""
              }. No está sumada en Mercado Pago ni en Banco.`
            : total < 0
              ? "Figura en negativo: seguramente se cargó un gasto o un depósito con plata de otra persona. Revisá los movimientos de abajo."
              : esCoordinador
                ? "No tiene nada pendiente de pasar a la cuenta."
                : "No tiene plata en mano."}
        </p>
      </div>

      {total > 0 && (
        <Link
          href={`/plata/depositar?tenedor=${id}&monto=${total}`}
          className="flex min-h-12 items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          Pasar a la cuenta
        </Link>
      )}

      {desglose.length > 0 && (
        <div className="flex flex-col">
          {desglose.map((d) => (
            <div
              key={d.label}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[13px]"
            >
              <span className="min-w-0 text-text-muted">{d.label}</span>
              <span
                className={`shrink-0 tabular-nums ${d.centavos < 0 ? "text-accent" : "text-text"}`}
              >
                {d.centavos < 0 ? "− " : "+ "}
                {formatCentavos(Math.abs(d.centavos))}
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-3 py-2 text-[13px] font-medium">
            <span className="text-text">{etiquetaDesglose}</span>
            <span className="tabular-nums text-text">{formatCentavos(total)}</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2.5 pt-2">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Movimientos
        </span>
        <span
          className="h-px flex-1"
          style={{ background: "linear-gradient(to right, var(--color-border), transparent)" }}
        />
      </div>

      {sumaLista !== total && (
        <p className="text-[12px] text-accent">
          Ojo: los movimientos de abajo suman {formatCentavos(sumaLista)} y el total dice{" "}
          {formatCentavos(total)}. Puede faltar algún movimiento en la lista.
        </p>
      )}

      <ListaMovimientos items={items} vacio={`${nombre} no tiene movimientos de plata en mano.`} />
    </FormPage>
  );
}
