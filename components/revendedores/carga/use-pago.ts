"use client";

import { useState } from "react";

import { textoMonto } from "@/components/revendedores/carga/formato";
import type { MedioPago, PagoCarga, ViaPago } from "@/lib/dominio/carga-revendedor";
import { parseMontoInput } from "@/lib/money";

/**
 * Estado + handlers de la sección 3 (Pago) de `CargaForm`: cómo se la dio
 * (encargado / directo a la cuenta / cliente directo), monto (precargado
 * con `montoSugerido` — lo que va a deber después de las ventas, ya
 * calculado afuera — hasta que el admin lo toca), medio, fecha y nota.
 */
export function usePagoCarga({
  hoy,
  montoSugerido,
  activaInicial,
}: {
  hoy: string;
  montoSugerido: number;
  activaInicial: boolean;
}) {
  const [activa, setActiva] = useState(activaInicial);
  const [fecha, setFecha] = useState(hoy);
  // `null` = sigue lo que va a deber después de las ventas.
  const [montoTexto, setMontoTexto] = useState<string | null>(null);
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [via, setVia] = useState<ViaPago>("encargado");
  const [nota, setNota] = useState("");

  function cambiarVia(nueva: ViaPago) {
    setVia(nueva);
    if (nueva !== "encargado" && medioPago === "efectivo") setMedioPago(null);
  }

  const montoEnPantalla = montoTexto ?? textoMonto(montoSugerido);

  const input: PagoCarga | null = activa
    ? {
        fecha,
        montoCentavos: parseMontoInput(montoEnPantalla),
        medioPago,
        via,
        nota,
      }
    : null;

  return {
    activa,
    toggle: () => setActiva((v) => !v),
    fecha,
    setFecha,
    montoTexto,
    setMontoTexto,
    montoEnPantalla,
    medioPago,
    setMedioPago,
    via,
    cambiarVia,
    nota,
    setNota,
    input,
  };
}

export type PagoCargaState = ReturnType<typeof usePagoCarga>;
