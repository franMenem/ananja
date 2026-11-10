"use client";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
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
  const confirmacion = useConfirmacion();
  const titulo = `¿${label} a ${nombre}?`;

  function handleConfirmar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("asignar_rol_revendedor", {
          p_vendedor_id: vendedorId,
          p_rol: rolDestino,
        });
        return rpcError ? traducirErrorRpc(rpcError.message, ERRORES, "No se pudo cambiar el rol. Probá de nuevo.") : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className={
          className ??
          "flex min-h-11 items-center justify-center border border-primary px-4 text-[16px] font-medium text-primary"
        }
      >
        {label}
      </button>

      <BottomSheet open={confirmacion.abierta} onClose={confirmacion.cancelar} ariaLabel={titulo} variant="mark">
        <h2 className="font-display text-[24px] text-text">{titulo}</h2>
        <p className="mt-2 text-[16px] text-text-muted">{CUERPO[rolDestino]}</p>

        {confirmacion.error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {confirmacion.error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={confirmacion.ocupada}
            textoCargando="Guardando…"
            type="button"
            onClick={() => void handleConfirmar()}
            className={`${BOTON_PRIMARIO} flex-[1.6] px-4`}
          >
            {`Sí, ${label.toLowerCase()}`}
          </BotonAccion>
          <button
            type="button"
            onClick={confirmacion.cancelar}
            disabled={confirmacion.ocupada}
            className={`${BOTON_SECUNDARIO} flex-1 px-4`}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
