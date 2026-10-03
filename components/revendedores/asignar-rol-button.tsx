"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";

type AsignarRolButtonProps = {
  vendedorId: string;
  nombre: string;
  /** Rol AL QUE se lo quiere pasar (no el actual). */
  rolDestino: "admin" | "revendedor" | "coordinador";
  /** Texto del botón y base de la confirmación — distinto según el
   * origen: "Hacer revendedor"/"Hacer admin" desde Pendientes,
   * "Pasar a admin" desde el detalle de un revendedor,
   * "Pasar a coordinador"/"Pasar a admin" desde la ficha de un admin o
   * coordinador (0057_coordinador_plata_stock.sql). */
  label: string;
  className?: string;
};

const CUERPO: Record<"admin" | "revendedor" | "coordinador", string> = {
  revendedor:
    "Va a entrar a su espacio de revendedor: solo ve su stock en consignación, sus ventas y su ganancia.",
  admin: "Va a ver toda la app, igual que el resto del equipo.",
  coordinador:
    "Deja de ser admin: pierde el acceso a Plata, Gastos, Comprobantes y Revendedores. Va a ver solo su pantalla de coordinador, con sus revendedoras a cargo. También se apaga su espacio de revendedora. Si vuelve a ser admin, lo podés volver a activar desde su ficha.",
};

/** Mapeo de códigos de error de `asignar_rol_revendedor`
 * (0018_revendedores.sql + 0026_roles_pendiente_espacio_revendedor.sql +
 * 0057_coordinador_plata_stock.sql, transiciones acotadas) a mensajes en
 * español. */
const ERRORES: Record<string, string> = {
  ULTIMO_ADMIN: "Tiene que quedar al menos un administrador.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
  ADMIN_NO_REVENDEDOR:
    "Un admin no puede pasar a revendedor. Si necesita operar como revendedor, habilitale su propio espacio desde Admins.",
  TRANSICION_INVALIDA: "Ese cambio de rol no está permitido.",
  VENDEDOR_INVALIDO: "No encontramos a esa persona.",
  ROL_INVALIDO: "Rol inválido.",
};

/**
 * Botón + confirmación para `asignar_rol_revendedor` — usado en
 * `/revendedores` (tabla de Pendientes, para aprobarlos como admin o
 * revendedor) y en `/revendedores/[id]` (para devolver un revendedor a
 * admin, o pasar un admin a coordinador y viceversa,
 * 0057_coordinador_plata_stock.sql). La confirmación siempre nombra a la
 * persona ("¿Hacer revendedor a Caro?").
 */
export function AsignarRolButton({
  vendedorId,
  nombre,
  rolDestino,
  label,
  className,
}: AsignarRolButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titulo = `¿${label} a ${nombre}?`;

  async function handleConfirmar() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("asignar_rol_revendedor", {
      p_vendedor_id: vendedorId,
      p_rol: rolDestino,
    });

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo cambiar el rol. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex min-h-11 items-center justify-center border border-primary px-4 text-[13px] font-medium tracking-[0.12em] text-primary uppercase"
        }
      >
        {label}
      </button>

      <BottomSheet open={open} ariaLabel={titulo} variant="mark">
        <h2 className="font-display text-[24px] text-primary">{titulo}</h2>
        <p className="mt-2 text-sm text-text-muted">{CUERPO[rolDestino]}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            type="button"
            onClick={handleConfirmar}
            className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            {`Sí, ${label.toLowerCase()}`}
          </BotonAccion>
          <button
            type="button"
            onClick={() => !saving && setOpen(false)}
            disabled={saving}
            className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
