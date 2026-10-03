"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { formasProveedor, type FormasProveedor } from "@/lib/dominio/proveedor";

// Sin proveedor montado más arriba, los textos caen al genérico "el
// proveedor" — nunca un nombre inventado ni un error.
const ProveedorContext = createContext<FormasProveedor>(formasProveedor(null));

/**
 * Lleva el nombre del proveedor a los componentes cliente de `/stock`. Lo
 * monta `app/(app)/stock/layout.tsx` (server component) con el nombre
 * leído de la base; tras guardar el nombre, `router.refresh()` vuelve a
 * renderizar ese layout y el contexto se actualiza solo.
 */
export function ProveedorProvider({
  nombre,
  children,
}: {
  nombre: string | null;
  children: ReactNode;
}) {
  const formas = useMemo(() => formasProveedor(nombre), [nombre]);
  return <ProveedorContext.Provider value={formas}>{children}</ProveedorContext.Provider>;
}

/** Formas del nombre del proveedor para armar textos: `a`, `de`, `en`,
 * `loDe`, `sujeto` (ver `lib/dominio/proveedor.ts`). */
export function useProveedor(): FormasProveedor {
  return useContext(ProveedorContext);
}
