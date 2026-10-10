import { AsignarRolButton } from "@/components/revendedores/asignar-rol-button";
import { EncargadoRevendedor } from "@/components/revendedores/encargado-revendedor";
import { EspacioRevendedorButton } from "@/components/revendedores/espacio-revendedor-button";
import { TomaDirectoRevendedor } from "@/components/revendedores/toma-directo-revendedor";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

type Coordinador = { id: string; nombre: string };

export type CabeceraFichaProps = {
  vendedorId: string;
  nombre: string;
  /** `vendedores.rol` es `string` en los tipos generados (es un `check`,
   * no un enum de Postgres) — acá solo importan estos valores
   * ("coordinador" sumado en 0057_coordinador_plata_stock.sql). */
  rol: "admin" | "revendedor" | "coordinador" | string;
  revende: boolean;
  debeCentavos: number;
  pendienteCentavos: number;
  rendidoCentavos: number;
  encargadoActualId: string | null;
  /** "Agarra directo del depósito" (`vendedores.toma_directo`, 0073). */
  tomaDirecto?: boolean;
  /** Admins y coordinadores activos, elegibles como coordinador de esta
   * revendedora (0055_coordinador.sql). */
  coordinadores: Coordinador[];
};

/**
 * Bloque 1 de la ficha (`/revendedores/[id]`, rediseño "de 10 bloques a 5",
 * 2026-09-16): nombre, cifra grande "Le debe a Ananja" y un resumen de una
 * línea con lo pendiente de confirmar, lo ya pagado y el encargado
 * (colapsado, `EncargadoRevendedor`). Un admin nunca se pasa a revendedor
 * (0026_roles_pendiente_espacio_revendedor.sql) — "Pasar a admin" solo
 * aplica a un revendedor de verdad; para un admin con espacio propio, la
 * acción disponible es deshabilitarlo. Un admin (Laura) puede pasar a
 * coordinador, y un coordinador puede volver a admin
 * (0057_coordinador_plata_stock.sql) — un admin ve las dos acciones juntas
 * si además tiene espacio de revendedor. Al pasar a coordinador se apaga
 * el espacio de revendedor (un coordinador no vende) y NO se vuelve a
 * prender solo al volver a admin — se avisa en `AsignarRolButton` y, acá,
 * el botón para reactivarlo se ve con el mismo estilo destacado
 * (`border-primary`) que "Habilitar" en la tabla "Admins" de
 * `/revendedores`, para que no pase desapercibido. Un coordinador no tiene deuda
 * propia con el negocio (no compra ni vende) — la cifra "Le debe" y el
 * resumen de pagos/encargado no se muestran para él (números en $0 que
 * no significan nada); la página arma en su lugar `FichaCoordinador` con
 * lo que sí le corresponde.
 */
export function CabeceraFicha({
  vendedorId,
  nombre,
  rol,
  revende,
  debeCentavos,
  pendienteCentavos,
  rendidoCentavos,
  encargadoActualId,
  tomaDirecto = false,
  coordinadores,
}: CabeceraFichaProps) {
  // Solo quien puede revender tiene botellas en su poder (un coordinador no
  // vende; un admin solo si tiene su espacio de revendedor): el interruptor
  // "agarra directo" no tiene sentido para el resto.
  const puedeRevender = rol === "revendedor" || (rol === "admin" && revende);
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] text-primary md:text-[38px]">{nombre}</h1>
        {rol === "revendedor" || rol === "coordinador" ? (
          <AsignarRolButton
            vendedorId={vendedorId}
            nombre={nombre}
            rolDestino="admin"
            label="Pasar a admin"
            className="flex min-h-9 shrink-0 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-primary hover:text-primary"
          />
        ) : (
          rol === "admin" && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <AsignarRolButton
                vendedorId={vendedorId}
                nombre={nombre}
                rolDestino="coordinador"
                label="Pasar a coordinador"
                className="flex min-h-9 shrink-0 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-primary hover:text-primary"
              />
              {revende ? (
                <EspacioRevendedorButton
                  vendedorId={vendedorId}
                  nombre={nombre}
                  habilitar={false}
                  className="flex min-h-9 shrink-0 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-accent hover:text-accent"
                />
              ) : (
                // Espacio de revendedor apagado (siempre al pasar a
                // coordinador, 0057 — también puede pasar por
                // `EspacioRevendedorButton` desde `/revendedores`): se
                // reactiva a mano, así que el botón tiene que verse claro
                // acá (mismo estilo `border-primary` que "Habilitar" en la
                // tabla "Admins"), no perderse entre el resto de acciones.
                <EspacioRevendedorButton
                  vendedorId={vendedorId}
                  nombre={nombre}
                  habilitar={true}
                  className="flex min-h-9 shrink-0 items-center justify-center border border-primary px-3 text-[11px] font-medium tracking-[0.1em] text-primary uppercase"
                />
              )}
            </div>
          )
        )}
      </div>

      {rol !== "coordinador" && (
        <>
          <div>
            <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
              Le debe a {NEGOCIO.nombre}
            </span>
            <p className="font-display text-[40px] leading-[1.05] whitespace-nowrap text-accent">
              {formatCentavos(debeCentavos)}
            </p>
          </div>

          <p className="text-[12px] text-text-muted">
            {pendienteCentavos > 0 && <>Pendiente de confirmar {formatCentavos(pendienteCentavos)} · </>}
            Ya pagó {formatCentavos(rendidoCentavos)} ·{" "}
            <EncargadoRevendedor
              vendedorId={vendedorId}
              revendedorNombre={nombre}
              encargadoActualId={encargadoActualId}
              coordinadores={coordinadores}
            />
          </p>

          {puedeRevender && (
            <TomaDirectoRevendedor vendedorId={vendedorId} nombre={nombre} tomaDirecto={tomaDirecto} />
          )}
        </>
      )}
    </div>
  );
}
