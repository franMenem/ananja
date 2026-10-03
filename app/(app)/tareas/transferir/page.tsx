import { redirect } from "next/navigation";

/**
 * `/tareas/transferir` — ruta vieja de la tarea agregada "efectivo" (una
 * sola caja "efectivo" con un único destino configurado, ver
 * `DESTINO_EFECTIVO_DEFAULT`/`obtenerDestinoEfectivo` en
 * `lib/transferencias.ts`). Con "Plata en manos de personas"
 * (`supabase/migrations/0037_plata_en_manos.sql`, ver memoria "Plata:
 * rediseño") ese modelo dejó de existir: la plata en efectivo ya no es un
 * pozo agregado sino que está en mano de cada persona, y cada una tiene su
 * propia tarea con su propio link a `/plata/depositar` (`lib/tareas.ts` §
 * `tareasPlataEnManos`). Nada en la app genera más un link a esta ruta,
 * pero se deja un redirect (en vez de borrarla) por si quedó un bookmark
 * o una notificación vieja apuntando acá — reenvía el `monto` si vino en
 * la query string, igual que antes.
 */
export default async function TransferirPage({
  searchParams,
}: PageProps<"/tareas/transferir">) {
  const params = await searchParams;
  const montoParam = Array.isArray(params.monto) ? params.monto[0] : params.monto;

  redirect(montoParam ? `/plata/depositar?monto=${montoParam}` : "/plata/depositar");
}
