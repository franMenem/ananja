"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { ParticipanteFeria } from "@/components/ferias/participante-feria";
import { Aviso } from "@/components/ui/aviso";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { MensajeError } from "@/components/ui/campo";
import { Dato } from "@/components/ui/dato";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { LinkBoton } from "@/components/ui/link-boton";
import { Pastilla } from "@/components/ui/pastilla";
import type { FeriaRow, ParticipanteFeriaRow, ProductoParticipanteRow } from "@/lib/data/ferias";
import { mensajeErrorFeria } from "@/lib/dominio/feria";
import { feriaAbierta, revendedorasDisponibles, sePuedeCerrarFeria, totalesFeria } from "@/lib/dominio/feria-admin";
import { feriaAgregarParticipante, feriaCerrar, feriaReabrir } from "@/lib/ferias";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

type Props = {
  feria: FeriaRow;
  participantes: ParticipanteFeriaRow[];
  /** `vendedorId -> productos` de cada participante. */
  productosPorPersona: Record<string, ProductoParticipanteRow[]>;
  /** Revendedoras activas (de ahí salen las que se pueden sumar). */
  revendedoras: { id: string; nombre: string }[];
  /** Productos activos (para "Cargar degustación"). */
  productosActivos?: { id: string; nombre: string }[];
  /** Aviso arriba de todo (p. ej. la degustación no se pudo cargar). */
  avisoDegustacion?: string | null;
};

/** Detalle de una feria para el admin: totales, participantes y acciones. */
export function DetalleFeria({
  feria,
  participantes,
  productosPorPersona,
  revendedoras,
  productosActivos = [],
  avisoDegustacion = null,
}: Props) {
  const router = useRouter();
  const abierta = feriaAbierta(feria.estado);
  const totales = totalesFeria(participantes);
  const puedeCerrar = sePuedeCerrarFeria(feria.estado, totales.pendientes);
  const disponibles = revendedorasDisponibles(revendedoras, participantes);

  const [sumando, setSumando] = useState(false);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(clave: string, accion: () => PromiseLike<{ error: { message: string } | null }>) {
    setTrabajando(clave);
    setError(null);
    const { error: rpcError } = await accion();
    setTrabajando(null);
    if (rpcError) {
      setError(mensajeErrorFeria(rpcError.message));
      return false;
    }
    router.refresh();
    return true;
  }

  async function sumar(vendedorId: string) {
    const ok = await ejecutar(vendedorId, () => feriaAgregarParticipante(createClient(), feria.id, vendedorId));
    if (ok) setSumando(false);
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <EncabezadoPantalla
        titulo={feria.nombre}
        pregunta={[formatFecha(feria.fecha), feria.lugar].filter(Boolean).join(" · ")}
        acciones={<Pastilla variante={abierta ? "ok" : "neutra"}>{abierta ? "Abierta" : "Cerrada"}</Pastilla>}
      />

      {avisoDegustacion && <Aviso role="alert">{avisoDegustacion}</Aviso>}

      {feria.nota && <p className="text-[15px] text-text-muted">{feria.nota}</p>}

      <section aria-label="Totales de la feria" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato etiqueta="Botellas llevadas">{totales.entregadas}</Dato>
        <Dato etiqueta="Vendidas" detalle={formatCentavos(totales.totalVendidoCentavos)}>
          {totales.vendidas}
        </Dato>
        <Dato etiqueta="Devueltas" detalle={totales.degustadas > 0 ? `${totales.degustadas} para degustación` : undefined}>
          {totales.devueltas}
        </Dato>
        <Dato etiqueta="Falta devolver">{totales.faltan}</Dato>
      </section>

      {error && <MensajeError>{error}</MensajeError>}

      <div className="flex flex-wrap gap-2">
        {abierta && (
          <>
            <button type="button" onClick={() => setSumando(true)} className={`${BOTON_PRIMARIO} flex px-4`}>
              + Sumar participante
            </button>
            <LinkBoton href={`/ferias/${feria.id}/editar`} className={`${BOTON_SECUNDARIO} flex px-4`}>
              Editar
            </LinkBoton>
            <BotonAccion
              cargando={trabajando === "cerrar"}
              textoCargando="Cerrando…"
              disabled={!puedeCerrar}
              onClick={() => ejecutar("cerrar", () => feriaCerrar(createClient(), feria.id))}
              className={`${BOTON_SECUNDARIO} flex px-4`}
            >
              Cerrar feria
            </BotonAccion>
          </>
        )}
        {!abierta && (
          <BotonAccion
            cargando={trabajando === "reabrir"}
            textoCargando="Reabriendo…"
            onClick={() => ejecutar("reabrir", () => feriaReabrir(createClient(), feria.id))}
            className={`${BOTON_SECUNDARIO} flex px-4`}
          >
            Reabrir feria
          </BotonAccion>
        )}
      </div>
      {abierta && !puedeCerrar && totales.pendientes > 0 && (
        <p className="-mt-3 text-[14px] text-text-muted">
          Para cerrar la feria, todas tienen que cerrar su participación (faltan {totales.pendientes}).
        </p>
      )}
      {abierta && totales.participantes === 0 && (
        <p className="-mt-3 text-[14px] text-text-muted">Todavía no sumaste a nadie.</p>
      )}

      {totales.participantes > 0 && (
        <section className="flex flex-col gap-3" aria-label="Participantes">
          <h2 className="text-[17px] font-semibold text-text">
            Participantes ({totales.cerradas} de {totales.participantes} cerraron)
          </h2>
          {participantes.map((p) => (
            <ParticipanteFeria
              key={p.vendedor_id}
              feriaId={feria.id}
              feriaAbierta={abierta}
              participante={p}
              productos={productosPorPersona[p.vendedor_id ?? ""] ?? []}
              productosActivos={productosActivos}
            />
          ))}
        </section>
      )}

      <BottomSheet open={sumando} ariaLabel="Sumar participante" anchoMaximo="sm:max-w-lg">
        <div className="flex flex-col gap-4">
          <h2 className="text-[18px] font-semibold text-text">¿A quién sumás?</h2>
          {disponibles.length === 0 ? (
            <p className="text-[15px] text-text-muted">No hay más revendedoras para sumar.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {disponibles.map((r) => (
                <li key={r.id}>
                  <BotonAccion
                    cargando={trabajando === r.id}
                    textoCargando="Sumando…"
                    disabled={trabajando !== null}
                    onClick={() => sumar(r.id)}
                    className={`${BOTON_SECUNDARIO} flex w-full px-4`}
                  >
                    {r.nombre}
                  </BotonAccion>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={trabajando !== null}
            onClick={() => setSumando(false)}
            className={`${BOTON_SECUNDARIO} flex w-full px-4`}
          >
            Cerrar
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
