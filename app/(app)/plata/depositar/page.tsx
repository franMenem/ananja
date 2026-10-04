import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { DepositarForm } from "@/components/plata/depositar-form";
import { listarMontosPlataEnManos, listarTenedoresActivos } from "@/lib/data/plata";
import { resolverTenedorInicial } from "@/lib/dominio/plata";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/plata/depositar` — "Pasar a la cuenta" (docs de negocio en el prompt
 * de la tarea "Plata", ver memoria "Plata: rediseño"): un admin registra
 * que la plata que tiene en mano (la propia o la que le rindió una
 * revendedora, `v_plata_en_manos`) ya llegó a la Cuenta Ananja real (RPC
 * `registrar_deposito_cuenta`, `supabase/migrations/0037_plata_en_manos.sql`).
 * Se llega acá desde la fila de una persona en `/plata` o desde su propia
 * tarea en `/tareas` — ambas mandan `?tenedor=<id>&monto=<centavos>` para
 * precargar el formulario; sin query params (entrada directa) el admin
 * elige a mano y el monto arranca vacío.
 */
export default async function DepositarPage({
  searchParams,
}: PageProps<"/plata/depositar">) {
  const params = await searchParams;
  const tenedorParam = Array.isArray(params.tenedor) ? params.tenedor[0] : params.tenedor;
  const montoParam = Array.isArray(params.monto) ? params.monto[0] : params.monto;
  const montoQuery =
    montoParam && /^[1-9]\d*$/.test(montoParam) ? Number(montoParam) : null;

  const supabase = await createClient();

  const [{ data: tenedores }, { data: plataEnManos }, { vendedor: miVendedor }] = await Promise.all([
    listarTenedoresActivos(supabase),
    listarMontosPlataEnManos(supabase),
    sesionActual(),
  ]);

  const personas = (tenedores ?? []).filter(
    (a): a is typeof a & { id: string; nombre: string } => Boolean(a.id && a.nombre),
  );

  const montosPorPersona: Record<string, number> = {};
  for (const fila of plataEnManos ?? []) {
    if (fila.tenedor_id) montosPorPersona[fila.tenedor_id] = fila.total_centavos ?? 0;
  }
  // El monto que llega por query string (de la fila/tarea que trajo acá)
  // manda sobre lo que diga `v_plata_en_manos` en este instante — evita
  // que un segundo depósito concurrente (poco probable, pero posible)
  // cambie silenciosamente el monto que el admin ya vio y decidió cargar.
  // Solo si el `?tenedor=` es una opción real del select (admin o
  // coordinador activo): si no, `resolverTenedorInicial` cae en el default.
  const tenedorInicial = resolverTenedorInicial(
    tenedorParam,
    miVendedor?.id,
    personas.map((p) => p.id),
  );
  if (tenedorInicial !== null && tenedorInicial === tenedorParam && montoQuery !== null) {
    montosPorPersona[tenedorInicial] = montoQuery;
  }

  if (personas.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[720px]">
        <p className="text-sm text-text-muted">
          No hay personas activas para registrar un depósito.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-col gap-5">
        {/* Sin <FormPage>/SetFormHeader propio acá: DepositarForm ya
            registra "Pasar a la cuenta" con su propio SetFormHeader (título
            fijo, pero la fuente sigue siendo el form component, no la
            página — mismo criterio que los casos E/F del plan). Antes esta
            página duplicaba el mismo texto a mano en el bloque de
            escritorio; con FormHeaderDesktop leyendo la fuente única, la
            duplicación desaparece sin cambiar nada visible. */}
        <FormHeaderDesktop />
        <DepositarForm
          personas={personas}
          montosPorPersona={montosPorPersona}
          tenedorInicial={tenedorInicial}
        />
      </div>
    </div>
  );
}
