"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaGuardada, setYaGuardada] = useState(false);
  const [alertaStock, setAlertaStock] = useState<ErrorCarga | null>(null);

  function irArriba() {
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  function handleRevisar() {
    setError(null);
    setMostrarProblemas(true);
    if (problemas.length > 0) {
      setError("Hay cosas para corregir: están marcadas en cada parte.");
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

    setSaving(true);
    setError(null);
    setAlertaStock(null);

    const supabase = createClient();
    const { error: rpcError } = await registrarCargaRevendedor(supabase, {
      vendedorId,
      clave,
      pedido: armarPedidoCarga(aGuardar),
    });

    if (rpcError) {
      const traducido = traducirErrorCarga(rpcError.message, rpcError.details, textos);
      if (traducido.permiteGuardarIgual && !conPermisoNegativo) {
        setAlertaStock(traducido);
      } else {
        setError(traducido.mensaje);
        setYaGuardada(traducido.codigo === "CARGA_YA_GUARDADA");
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(`/revendedores/${vendedorId}`);
    router.refresh();
  }

  function volverAEditar() {
    setError(null);
    setYaGuardada(false);
    setRevisando(false);
  }

  function cerrarAlertaStock() {
    setAlertaStock(null);
    setRevisando(false);
  }

  return {
    mostrarProblemas,
    revisando,
    setRevisando,
    saving,
    error,
    setError,
    yaGuardada,
    alertaStock,
    handleRevisar,
    guardar,
    volverAEditar,
    cerrarAlertaStock,
  };
}

export type GuardadoCargaState = ReturnType<typeof useGuardadoCarga>;
