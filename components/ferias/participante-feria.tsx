"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { BotonAccion } from "@/components/boton-accion";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { LinkBoton } from "@/components/ui/link-boton";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { MensajeError } from "@/components/ui/campo";
import type { ParticipanteFeriaRow, ProductoParticipanteRow } from "@/lib/data/ferias";
import { mensajeErrorFeria } from "@/lib/dominio/feria";
import { sePuedeQuitar } from "@/lib/dominio/feria-admin";
import { feriaQuitarParticipante, feriaReabrirParticipacion } from "@/lib/ferias";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

type Props = {
  feriaId: string;
  feriaAbierta: boolean;
  participante: ParticipanteFeriaRow;
  productos: ProductoParticipanteRow[];
};

function Numero({ rotulo, valor, resaltar = false }: { rotulo: string; valor: number; resaltar?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={`text-[18px] font-semibold tabular-nums ${resaltar && valor > 0 ? "text-accent" : "text-text"}`}>
        {valor}
      </span>
      <span className="text-[13px] text-text-muted">{rotulo}</span>
    </div>
  );
}

/** Una persona en la feria: sus números, el desglose por producto y lo que el
 * admin puede hacer con ella (cargar botellas, quitar, cerrar por ella, reabrir). */
export function ParticipanteFeria({ feriaId, feriaAbierta, participante: p, productos }: Props) {
  const router = useRouter();
  const [hoja, setHoja] = useState<"quitar" | "reabrir" | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vendedorId = p.vendedor_id ?? "";
  const cerrada = p.estado === "cerrada";
  const declarado = (p.efectivo_centavos ?? 0) + (p.mercado_pago_centavos ?? 0) + (p.banco_centavos ?? 0);

  async function confirmar() {
    setTrabajando(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } =
      hoja === "quitar"
        ? await feriaQuitarParticipante(supabase, feriaId, vendedorId)
        : await feriaReabrirParticipacion(supabase, feriaId, vendedorId);
    setTrabajando(false);
    if (rpcError) {
      setError(mensajeErrorFeria(rpcError.message));
      setHoja(null);
      return;
    }
    setHoja(null);
    router.refresh();
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[17px] font-semibold break-words text-text">{p.vendedor_nombre}</h3>
        <Pastilla variante={cerrada ? "ok" : "aviso"}>{cerrada ? "Cerró" : "Pendiente"}</Pastilla>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Numero rotulo="Llevó" valor={p.entregadas ?? 0} />
        <Numero rotulo="Vendió" valor={p.vendidas ?? 0} />
        <Numero rotulo="Devolvió" valor={p.devueltas ?? 0} />
        <Numero rotulo="Falta devolver" valor={p.faltan ?? 0} resaltar />
      </div>

      <p className="text-[14px] text-text-muted">
        {(p.degustadas ?? 0) > 0 && <>Degustó {p.degustadas}. </>}
        Vendido: <span className="font-semibold tabular-nums text-text">{formatCentavos(p.total_vendido_centavos ?? 0)}</span>
        {cerrada && (
          <>
            {" · "}Declaró {formatCentavos(declarado)} (efectivo {formatCentavos(p.efectivo_centavos ?? 0)}, Mercado
            Pago {formatCentavos(p.mercado_pago_centavos ?? 0)}, banco {formatCentavos(p.banco_centavos ?? 0)})
          </>
        )}
      </p>

      {productos.length > 0 && (
        <details className="group rounded-xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-[15px] font-semibold text-text [&::-webkit-details-marker]:hidden">
            Ver por producto
          </summary>
          <ul className="divide-y divide-line border-t border-border px-3">
            {productos.map((x) => (
              <li key={x.producto_id} className="flex flex-col gap-0.5 py-2">
                <span className="text-[15px] font-semibold text-text">{x.producto_nombre}</span>
                <span className="text-[14px] text-text-muted tabular-nums">
                  Llevó {x.entregadas ?? 0} · vendió {x.vendidas ?? 0} · devolvió {x.devueltas ?? 0} · degustó{" "}
                  {x.degustadas ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && <MensajeError>{error}</MensajeError>}

      {feriaAbierta && (
        <div className="flex flex-wrap gap-2">
          {!cerrada && (
            <>
              <LinkBoton href={`/ferias/${feriaId}/entregar/${vendedorId}`} className={`${BOTON_SECUNDARIO} flex px-4`}>
                Cargar botellas
              </LinkBoton>
              <LinkBoton href={`/ferias/${feriaId}/cerrar/${vendedorId}`} className={`${BOTON_SECUNDARIO} flex px-4`}>
                Cerrar por ella
              </LinkBoton>
              {sePuedeQuitar(p) && (
                <button type="button" onClick={() => setHoja("quitar")} className={`${BOTON_SECUNDARIO} flex px-4`}>
                  Quitar
                </button>
              )}
            </>
          )}
          {cerrada && (
            <button type="button" onClick={() => setHoja("reabrir")} className={`${BOTON_SECUNDARIO} flex px-4`}>
              Reabrir
            </button>
          )}
        </div>
      )}

      <BottomSheet open={hoja !== null} ariaLabel={hoja === "quitar" ? "Quitar de la feria" : "Reabrir participación"} variant="accent">
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-text">
            {hoja === "quitar" ? `¿Quitar a ${p.vendedor_nombre} de la feria?` : `¿Reabrir la participación de ${p.vendedor_nombre}?`}
          </h2>
          <p className="text-[15px] text-text-muted">
            {hoja === "quitar"
              ? "Todavía no tiene botellas cargadas, así que no se pierde nada."
              : "Se deshacen las ventas, la devolución y las degustaciones de su cierre; después tiene que volver a cerrar."}
          </p>
          <div className="flex flex-col gap-2">
            <BotonAccion
              cargando={trabajando}
              textoCargando="Un momento…"
              onClick={confirmar}
              className={`${BOTON_PRIMARIO} flex w-full px-4`}
            >
              {hoja === "quitar" ? "Sí, quitar" : "Sí, reabrir"}
            </BotonAccion>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => setHoja(null)}
              className={`${BOTON_SECUNDARIO} flex w-full px-4`}
            >
              Cancelar
            </button>
          </div>
        </div>
      </BottomSheet>
    </Tarjeta>
  );
}
