import { EncargadoRevendedor } from "@/components/revendedores/encargado-revendedor";

type Coordinador = { id: string; nombre: string };

/** Cómo se llama a la persona en el subtítulo de la ficha. */
export function textoRol(rol: string, revende: boolean): string {
  if (rol === "coordinador") return "Coordinadora";
  if (rol === "admin") return revende ? "Admin que también revende" : "Admin";
  return "Revendedora";
}

export type CabeceraFichaProps = {
  vendedorId: string;
  nombre: string;
  /** `vendedores.rol` es `string` en los tipos generados (es un `check`). */
  rol: "admin" | "revendedor" | "coordinador" | string;
  revende: boolean;
  /** Solo una revendedora tiene encargado al que rinde la plata. */
  mostrarEncargado: boolean;
  encargadoActualId: string | null;
  /** Admins y coordinadores activos, elegibles como encargado
   * (0055_coordinador.sql). */
  coordinadores: Coordinador[];
};

/**
 * Cabecera de la ficha (`/revendedores/[id]`): el nombre (28px/700) y, debajo,
 * "Revendedora · su encargado es X" con el link "Cambiar" (la misma acción
 * de siempre, `EncargadoRevendedor`). Un coordinador no tiene encargado: solo
 * se ve su rol. Los cambios de rol y "agarra directo" viven en "Ajustes".
 */
export function CabeceraFicha({
  vendedorId,
  nombre,
  rol,
  revende,
  mostrarEncargado,
  encargadoActualId,
  coordinadores,
}: CabeceraFichaProps) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-[28px] leading-[1.1] font-bold break-words text-text">{nombre}</h1>
      <div className="flex flex-wrap items-center gap-x-2 text-[15px] text-text-muted">
        <span>{textoRol(rol, revende)}</span>
        {mostrarEncargado && (
          <>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <EncargadoRevendedor
              vendedorId={vendedorId}
              revendedorNombre={nombre}
              encargadoActualId={encargadoActualId}
              coordinadores={coordinadores}
            />
          </>
        )}
      </div>
    </header>
  );
}
