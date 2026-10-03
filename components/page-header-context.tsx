"use client";

import { createContext, useContext, useEffect, useState } from "react";

type FormHeaderValue = {
  title: string;
  backHref: string;
  backLabel: string;
};

type PageHeaderContextValue = {
  formHeader: FormHeaderValue | null;
  setFormHeader: (value: FormHeaderValue | null) => void;
};

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

/**
 * Envuelve todo `app/(app)/layout.tsx` para que las páginas de formulario
 * (server o client components) puedan registrar el título/back-href que
 * `AppHeader` necesita para su variante "← + título" (design/handoff README § Chrome
 * compartido) sin duplicar la barra dentro del contenido.
 */
export function PageHeaderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [formHeader, setFormHeader] = useState<FormHeaderValue | null>(null);

  return (
    <PageHeaderContext.Provider value={{ formHeader, setFormHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

function usePageHeaderContext(): PageHeaderContextValue {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) {
    throw new Error(
      "usePageHeaderContext debe usarse dentro de <PageHeaderProvider>",
    );
  }
  return ctx;
}

/** Consumido por `AppHeader` para decidir wordmark/sección vs. "← + título". */
export function useFormHeader(): FormHeaderValue | null {
  return usePageHeaderContext().formHeader;
}

/**
 * Registra el título de formulario de la pantalla actual. Se monta al
 * principio de cada página de formulario (nuevo/editar/detalle-editable) en
 * vez de dibujar su propio "← + título" — así queda una sola barra oliva
 * (la de `AppHeader`) en vez de dos. Se limpia sola al desmontar, así al
 * navegar a una pantalla normal la cabecera vuelve al wordmark/nombre de
 * sección.
 */
export function SetFormHeader({ title, backHref, backLabel }: FormHeaderValue) {
  const { setFormHeader } = usePageHeaderContext();

  useEffect(() => {
    setFormHeader({ title, backHref, backLabel });
    return () => setFormHeader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, backHref, backLabel]);

  return null;
}
