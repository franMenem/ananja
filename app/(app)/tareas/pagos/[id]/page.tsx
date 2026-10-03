import { ResolverPago } from "@/components/tareas/resolver-pago";
import { VolverLink } from "@/components/volver-link";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFecha, formatFechaHora } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { ESTADO_PAGO_LABELS, pagoEstado } from "@/lib/dominio/pagos-revendedor";
import { sesionActual } from "@/lib/sesion-actual";
import { getSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/tareas/pagos/[id]` — un pago que informó una revendedora
 * (0040_revendedores_pagos_precios.sql § 3): monto, medio, fecha, a quién
 * se lo mandó, nota y comprobante; si le toca a quien mira, botones
 * Confirmar / Rechazar (con motivo). Solo lo resuelve el encargado
 * destinatario, o CUALQUIER admin si fue a la Cuenta Ananja, si ese
 * encargado ya no es admin/coordinador activo, o si es un coordinador
 * activo (0055_coordinador.sql: un coordinador nunca puede confirmar/
 * rechazar nada él mismo, así que "solo esa persona" no aplica) — la
 * misma regla la vuelve a chequear el RPC.
 */
export default async function PagoRevendedorPage({
  params,
}: PageProps<"/tareas/pagos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ vendedor: yo }, { data: pago }] = await Promise.all([
    sesionActual(),
    supabase
      .from("pagos_revendedor")
      .select(
        "*, vendedor:vendedores!pagos_revendedor_vendedor_id_fkey(id, nombre), destinatario:vendedores!pagos_revendedor_destinatario_id_fkey(nombre, activo, rol), resolvio:vendedores!pagos_revendedor_resuelto_por_fkey(nombre)",
      )
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!pago) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/tareas" label="tareas" />
        <p className="text-sm text-text-muted">No encontramos este pago.</p>
      </div>
    );
  }

  const estado = pagoEstado(pago.estado);
  const imagenUrl = pago.imagen_path ? await getSignedUrl(pago.imagen_path, 3600, supabase) : null;
  const esPdf = pago.imagen_path?.toLowerCase().endsWith(".pdf") ?? false;

  // 0055_coordinador.sql: el destinatario puede ser admin o coordinador
  // (antes solo admin) — `destinatarioActivo` ahora dice "destinatario
  // resuelto y activo, sea cual sea su rol" (para el texto: ya no dice
  // "ya no está activo" de alguien que sigue activo pero es coordinador).
  // `destinatarioEsCoordinador` es aparte porque cambia la AUTORIZACIÓN:
  // un coordinador nunca resuelve nada él mismo.
  const destinatarioEsAdminActivo = Boolean(pago.destinatario?.activo && pago.destinatario.rol === "admin");
  const destinatarioEsCoordinadorActivo = Boolean(
    pago.destinatario?.activo && pago.destinatario.rol === "coordinador",
  );
  const destinatarioActivo = destinatarioEsAdminActivo || destinatarioEsCoordinadorActivo;
  const esParaMi = pago.destinatario_id !== null && pago.destinatario_id === yo?.id;
  // Un admin puede resolver SU PROPIO pago (decisión de Fran, 2026-09-15,
  // `0046_admin_pago_propio.sql`), aunque el destinatario informado sea
  // otro admin activo — misma regla que el RPC. Un destinatario
  // coordinador activo nunca restringe: cualquier admin puede resolverlo
  // (mismo motivo, `confirmar_pago_revendedor`/`rechazar_pago_revendedor`,
  // 0055).
  const esPropio = pago.vendedor_id === yo?.id;
  const puedeResolver =
    estado === "pendiente" &&
    (esPropio || pago.destinatario_id === null || esParaMi || destinatarioEsCoordinadorActivo || !destinatarioActivo);

  const destino =
    pago.destinatario_id === null
      ? `A la cuenta de ${NEGOCIO.nombre}`
      : esParaMi
        ? "A vos"
        : `A ${pago.destinatario?.nombre ?? "su encargado"}`;

  const explicacion =
    pago.destinatario_id === null
      ? `Confirmalo solo si la plata ya entró a la cuenta de ${NEGOCIO.nombre} (${MEDIO_PAGO_LABELS[pago.medio_pago]}). Al confirmar, se descuenta de lo que le debe.`
      : !destinatarioActivo
        ? `${pago.destinatario?.nombre ?? "Su encargado"} ya no está activo en la app. Confirmalo solo si la plata llegó al equipo: al confirmar, se descuenta de lo que le debe y queda en tus manos para pasar a la cuenta de ${NEGOCIO.nombre}.`
        : `Confirmalo solo si ${esParaMi ? "recibiste" : `${pago.destinatario?.nombre ?? "su encargado"} recibió`} la plata. Al confirmar, se descuenta de lo que le debe y queda en manos de ${esParaMi ? "vos" : (pago.destinatario?.nombre ?? "su encargado")} para pasar a la cuenta de ${NEGOCIO.nombre}.`;

  const nombreVendedor = pago.vendedor?.nombre ?? "Una revendedora";

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 pb-8">
      <VolverLink href="/tareas" label="tareas" />

      <div className="flex flex-col gap-1">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Pago de {nombreVendedor}
        </span>
        <span className="font-display text-[40px] leading-none text-primary tabular-nums">
          {formatCentavos(pago.monto_centavos)}
        </span>
      </div>

      <div className="flex flex-col gap-2 border-y border-border py-4 text-sm text-text">
        <p>Medio: {MEDIO_PAGO_LABELS[pago.medio_pago]}</p>
        <p>Fecha: {formatFecha(pago.fecha)}</p>
        <p>{destino}</p>
        {pago.nota && <p>Nota: {pago.nota}</p>}
        <p>
          Estado: {ESTADO_PAGO_LABELS[estado]}
          {pago.resuelto_en &&
            ` · ${formatFechaHora(pago.resuelto_en)}${pago.resolvio?.nombre ? ` por ${pago.resolvio.nombre}` : ""}`}
        </p>
        {estado === "rechazado" && pago.motivo_rechazo && <p>Motivo: {pago.motivo_rechazo}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">Comprobante</span>
        {!pago.imagen_path ? (
          <p className="text-sm text-text-muted">Sin comprobante (pago en efectivo).</p>
        ) : !imagenUrl ? (
          <p className="text-sm text-accent">No se pudo abrir el comprobante.</p>
        ) : esPdf ? (
          <a
            href={imagenUrl}
            target="_blank"
            rel="noreferrer"
            className="self-start border-b border-mark text-[12px] tracking-[0.12em] text-text uppercase"
          >
            Ver comprobante (PDF)
          </a>
        ) : (
          <a href={imagenUrl} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL privada de Storage, no pasa por next/image */}
            <img
              src={imagenUrl}
              alt={`Comprobante del pago de ${nombreVendedor}`}
              className="max-h-[480px] w-auto border border-border object-contain"
            />
          </a>
        )}
      </div>

      {puedeResolver ? (
        <ResolverPago pagoId={pago.id} explicacion={explicacion} />
      ) : (
        estado === "pendiente" && (
          <p className="text-sm text-text-muted">
            Este pago lo confirma {pago.destinatario?.nombre ?? "su encargado"}.
          </p>
        )
      )}
    </div>
  );
}
