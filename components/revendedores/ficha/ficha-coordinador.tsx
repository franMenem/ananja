import { VentaCoordinador, type LoteDepositoAdmin } from "@/components/coordinador/venta-coordinador";
import { EliminarVentaButton } from "@/components/mi/eliminar-venta-button";
import { BotellasAdeudadas } from "@/components/revendedores/botellas-adeudadas";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { ChevronFila, FilaLink } from "@/components/ui/estado-fila";
import { ListaTarjeta } from "@/components/ui/fila";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { textoBotellas } from "@/lib/dominio/personas";
import { EntregasCoordinadora } from "@/components/revendedores/ficha/entregas-coordinadora";
import type { ResumenBotellas } from "@/lib/dominio/botellas-adeudadas";
import type { RevendedoraCoordinador } from "@/lib/dominio/coordinador";
import type { EntregasCoordinadora as Entregas } from "@/lib/dominio/entregas-coordinador";
import { descripcionVentaPropia, type VentaPropiaFila } from "@/lib/dominio/venta-coordinador";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

export type FichaCoordinadorProps = {
  coordinadorId: string;
  coordinadorNombre: string;
  /** Productos y lotes con stock (con costo) para la hoja "Vendió ella". */
  productos: { id: string; nombre: string }[];
  lotesAdmin: LoteDepositoAdmin[];
  /** Lo que vendió ella misma (0073); `null` si la lectura falló. */
  ventasPropias: VentaPropiaFila[] | null;
  revendedoras: RevendedoraCoordinador[];
  /** Lo que este coordinador tiene que pasar a la cuenta de Ananja
   * (`v_plata_en_manos.total_centavos`, 0057) — desde 0058, YA es solo la
   * parte Ananja de lo que le rindieron sus revendedoras, sin su margen
   * propio (que no se muestra en ningún lado). */
  plataEnManoCentavos: number;
  /** Entregas y devoluciones a sus revendedoras a cargo; `null` si la
   * lectura falló. */
  entregas: Entregas | null;
  /** Botellas que se le deben a Ananja entre sus revendedoras a cargo y la
   * plata que cobró sin pasar (`cargarBotellasAdeudadas`); `null` si la
   * lectura falló. */
  botellas: ResumenBotellas | null;
};

/**
 * Cuerpo de la ficha de un coordinador (`/revendedores/[id]`,
 * 0057_coordinador_plata_stock.sql § hueco de navegación: antes de esto no
 * había forma de llegar acá). Reemplaza los bloques de una revendedora
 * (Acciones, En poder, Pagos, Movimientos, Ganancia) — ninguno le
 * corresponde: un coordinador no compra ni vende, solo reparte y cobra por
 * cuenta de {NEGOCIO.nombre}. Muestra en cambio lo que sí es suyo: sus
 * revendedoras a cargo (mismos números que ve él en `/mi`,
 * `armarRevendedorasCoordinador`) y cuánto tiene que pasar a la cuenta de
 * Ananja (0058: no es lo mismo que "tiene en mano" — puede tener más si
 * cobra con margen propio) y las entregas que les hizo, con su lote
 * (`EntregasCoordinadora`) y cuántas botellas se le deben a Ananja entre su
 * equipo y lo que cobró (`BotellasAdeudadas`) — el botón de cambio de rol ya vive en
 * `CabeceraFicha`, arriba de este bloque.
 */
export function FichaCoordinador({
  coordinadorId,
  coordinadorNombre,
  productos,
  lotesAdmin,
  ventasPropias,
  revendedoras,
  plataEnManoCentavos,
  entregas,
  botellas,
}: FichaCoordinadorProps) {
  return (
    <div className="flex flex-col gap-6">
      <Tarjeta como="section" aria-label={`Lo que tiene que pasar a ${NEGOCIO.nombre}`} className="flex flex-col gap-3">
        <NumeroGrande etiqueta={`Tiene que pasar a ${NEGOCIO.nombre}`}>
          {formatCentavos(Math.max(plataEnManoCentavos, 0))}
        </NumeroGrande>
        {plataEnManoCentavos > 0 ? (
          <div className="flex flex-col items-start gap-2">
            <Pastilla variante="aviso">Todavía no la pasó</Pastilla>
            <p className="text-[14px] text-text-muted">
              Es plata en mano que todavía no llegó a la cuenta de {NEGOCIO.nombre}.
            </p>
          </div>
        ) : (
          <Pastilla variante="ok" className="self-start">
            Al día
          </Pastilla>
        )}
      </Tarjeta>

      <BotellasAdeudadas
        resumen={botellas}
        variante="equipo"
        nota="Entre sus revendedoras y la plata que cobró."
      />

      <section aria-labelledby="coord-a-cargo" className="flex flex-col gap-3">
        <h2 id="coord-a-cargo" className="text-[20px] leading-tight font-semibold text-text">
          Revendedoras a cargo ({revendedoras.length})
        </h2>
        {revendedoras.length === 0 ? (
          <p className="text-[16px] text-text-muted">Todavía no tiene ninguna revendedora asignada.</p>
        ) : (
          <ListaTarjeta>
            {revendedoras.map((r) => (
              <FilaLink
                key={r.id}
                href={`/revendedores/${r.id}`}
                izquierda={
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[16px] font-semibold break-words text-text">{r.nombre}</span>
                    <span className="text-[14px] text-text-muted">
                      Tiene {textoBotellas(r.enPoder)}
                      {r.valorEnPoderCentavos > 0 && ` · ${formatCentavos(r.valorEnPoderCentavos)} en poder`}
                    </span>
                  </div>
                }
                derecha={
                  <>
                    <Pastilla variante={r.debeCentavos > 0 ? "debe" : "ok"}>
                      {r.debeCentavos > 0 ? `Debe ${formatCentavos(r.debeCentavos)}` : "Al día"}
                    </Pastilla>
                    <ChevronFila />
                  </>
                }
              />
            ))}
          </ListaTarjeta>
        )}
      </section>

      <Tarjeta como="section" aria-labelledby="coord-ventas" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="coord-ventas" className="text-[20px] leading-tight font-semibold text-text">
            Ventas propias
          </h2>
          <VentaCoordinador
            coordinadorId={coordinadorId}
            coordinadorNombre={coordinadorNombre}
            productos={productos}
            modo="admin"
            lotesAdmin={lotesAdmin}
            etiqueta="Vendió ella"
            className={`${BOTON_SECUNDARIO} flex px-4`}
          />
        </div>
        <p className="text-[14px] text-text-muted">
          Botellas que agarró del depósito y vendió ella misma. Se suman a lo que tiene que pasar a {NEGOCIO.nombre}.
        </p>
        <VentasPropias ventas={ventasPropias} coordinadorNombre={coordinadorNombre} />
      </Tarjeta>

      <EntregasCoordinadora entregas={entregas} />
    </div>
  );
}

function VentasPropias({
  ventas,
  coordinadorNombre,
}: {
  ventas: VentaPropiaFila[] | null;
  coordinadorNombre: string;
}) {
  if (ventas === null) {
    return <p className="py-2 text-[16px] text-text-muted">No se pudieron cargar las ventas.</p>;
  }
  if (ventas.length === 0) {
    return <p className="py-2 text-[16px] text-text-muted">Todavía no cargó ventas propias.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-line">
      {ventas.map((v) => (
        <div key={v.grupoId} className="flex flex-col gap-1.5 py-3 text-[16px]">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0 break-words text-text">
              <span className="text-[14px] tabular-nums text-text-muted">{formatFecha(v.fecha)}</span>
              {" · "}
              {descripcionVentaPropia(v)}
            </span>
            <span className="shrink-0 text-right tabular-nums text-text">{formatCentavos(v.montoCentavos)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-text-muted">Suma a lo que tiene que pasar</span>
            <EliminarVentaButton
              ventaId={v.ventaId}
              redirectHref={null}
              ventaCoordinadora={{ nombre: coordinadorNombre }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
