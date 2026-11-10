import Link from "next/link";

import { Pastilla } from "@/components/ui/pastilla";
import { Fila, ListaTarjeta } from "@/components/ui/fila";
import type { FeriaConConteo } from "@/lib/data/ferias-admin";
import { feriaAbierta, ordenarFerias, textoParticipantes } from "@/lib/dominio/feria-admin";
import { formatFecha } from "@/lib/fechas";

/** Lista de ferias: abiertas primero. Cada fila lleva al detalle. */
export function ListaFerias({ ferias }: { ferias: FeriaConConteo[] }) {
  if (ferias.length === 0) {
    return <p className="text-[16px] text-text-muted">Todavía no armaste ninguna feria.</p>;
  }
  return (
    <ListaTarjeta>
      {ordenarFerias(ferias).map((f) => (
        <Link key={f.id} href={`/ferias/${f.id}`} prefetch={false} className="block px-4 hover:bg-background">
          <Fila
            titulo={f.nombre}
            detalle={[formatFecha(f.fecha), f.lugar, textoParticipantes(f.participantes)]
              .filter(Boolean)
              .join(" · ")}
            valor={
              <Pastilla variante={feriaAbierta(f.estado) ? "ok" : "neutra"}>
                {feriaAbierta(f.estado) ? "Abierta" : "Cerrada"}
              </Pastilla>
            }
          />
        </Link>
      ))}
    </ListaTarjeta>
  );
}
