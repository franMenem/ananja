"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MENSAJE_SIN_CONEXION } from "@/components/ui/use-confirmacion";
import { useGuardadoConAviso } from "@/components/ui/use-guardado-con-aviso";
import {
  armarPedidoCarga,
  traducirErrorCarga,
  type CargaInput,
  type ErrorCarga,
  type ProblemaCarga,
  type TextosCarga,
} from "@/lib/dominio/carga-revendedor";
import { registrarCargaRevendedor } from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/client";

/**
 * Flujo de guardado de `CargaForm`, después de "Revisar todo": arma el
 * pedido con `armarPedidoCarga` (mismo payload que ve "Revisá todo") y llama
 * a `registrar_carga_revendedor`. `guardar(conPermisoNegativo)` fuerza
 * `permitirNegativo` en la entrega cuando viene `true` (desde el aviso de
 * "No hay stock suficiente"), sin tocar el estado de la sección Entrega.
 */
export function useGuardadoCarga({
  vendedorId,
  clave,
  input,
  problemas,
  textos,
}: {
  vendedorId: string;
  clave: string;
  input: CargaInput;
  problemas: ProblemaCarga[];
  textos: Pick<TextosCarga, "nombres" | "formatFecha">;
}) {
  const router = useRouter();
  const [mostrarProblemas, setMostrarProblemas] = useState(false);
  const [revisando, setRevisando] = useState(false);
  // Aviso de stock → "Guardar igual" (ver `use-guardado-con-aviso.ts`). La
  // hoja se cierra al tocar "Guardar igual" (`aviso`, no `avisoVisible`).
  const guardado = useGuardadoConAviso<ErrorCarga>();
  const saving = guardado.ocupado;
  const error = guardado.mensajeError;
  const alertaStock = guardado.aviso;
  const [yaGuardada, setYaGuardada] = useState(false);

  function irArriba() {
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  function handleRevisar() {
    guardado.limpiarError();
    setMostrarProblemas(true);
    if (problemas.length > 0) {
      guardado.fallar("Hay cosas para corregir: están marcadas en cada parte.");
      return;
    }
    setRevisando(true);
    irArriba();
  }

  async function guardar(conPermisoNegativo: boolean) {
    const aGuardar: CargaInput =
      conPermisoNegativo && input.entrega
        ? { ...input, entrega: { ...input.entrega, permitirNegativo: true } }
        : input;

    if (!guardado.empezar(conPermisoNegativo)) return;

    try {
      const supabase = createClient();
      const { error: rpcError } = await registrarCargaRevendedor(supabase, {
        vendedorId,
        clave,
        pedido: armarPedidoCarga(aGuardar),
      });

      if (rpcError) {
        const traducido = traducirErrorCarga(rpcError.message, rpcError.details, textos);
        if (traducido.permiteGuardarIgual && !conPermisoNegativo) {
          guardado.avisar(traducido);
        } else {
          guardado.fallar(traducido.mensaje);
          setYaGuardada(traducido.codigo === "CARGA_YA_GUARDADA");
        }
        return;
      }

      // Éxito: se sale de la pantalla, así que el botón queda ocupado hasta
      // que la navegación desmonte el formulario (no hay un 2º toque posible).
      guardado.completar();
      router.push(`/revendedores/${vendedorId}`);
      router.refresh();
    } catch {
      // Una excepción inesperada (red caída) no puede dejar el botón ocupado.
      guardado.fallar(MENSAJE_SIN_CONEXION, { deConexion: true });
    } finally {
      // No-op si la máquina ya salió de `enviando` (aviso, error o `completar()`).
      guardado.liberar();
    }
  }

  function volverAEditar() {
    guardado.limpiarError();
    setYaGuardada(false);
    setRevisando(false);
  }

  function cerrarAlertaStock() {
    guardado.descartarAviso();
    setRevisando(false);
  }

  return {
    mostrarProblemas,
    revisando,
    setRevisando,
    saving,
    error,
    limpiarError: guardado.limpiarError,
    yaGuardada,
    alertaStock,
    handleRevisar,
    guardar,
    volverAEditar,
    cerrarAlertaStock,
  };
}

export type GuardadoCargaState = ReturnType<typeof useGuardadoCarga>;
