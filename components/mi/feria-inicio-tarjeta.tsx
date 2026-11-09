import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { LinkBoton } from "@/components/ui/link-boton";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import type { FeriaInicio } from "@/lib/dominio/feria-mi";
import { formatFecha } from "@/lib/fechas";
import { envase } from "@/lib/negocio";

/** Tarjeta destacada de Inicio cuando la revendedora participa de una feria abierta. */
export function FeriaInicioTarjeta({ feria }: { feria: FeriaInicio }) {
  const cerrada = feria.accion === "cerrada";
  const titulo = [`Feria ${feria.nombre}`, formatFecha(feria.fecha), feria.lugar].filter(Boolean).join(" · ");

  return (
    <Tarjeta como="section" className="flex flex-col gap-3 border-mark">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[20px] leading-tight font-bold break-words text-text">{titulo}</h2>
        {cerrada ? (
          <p className="text-[16px] text-text">
            Ya cerraste tu feria: vendiste {feria.vendidas} {envase(feria.vendidas)} y devolviste{" "}
            {feria.devueltas}.
          </p>
        ) : (
          <p className="text-[16px] text-text">
            Te llevaste {feria.llevadas} {envase(feria.llevadas)}.
          </p>
        )}
      </div>
      {cerrada && (
        <Pastilla variante="ok" className="w-fit">
          Ya cerraste tu feria
        </Pastilla>
      )}
      <LinkBoton
        href={feria.accion === "cerrar" ? "/mi/feria/cerrar" : "/mi/feria"}
        className={`${feria.accion === "cerrar" ? BOTON_PRIMARIO : BOTON_SECUNDARIO} flex w-full px-4`}
      >
        {feria.accion === "cerrar" ? "Cerrar mi feria" : "Ver mi feria"}
      </LinkBoton>
    </Tarjeta>
  );
}
