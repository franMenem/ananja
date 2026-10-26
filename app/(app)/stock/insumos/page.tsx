import Link from "next/link";

import { FilaInsumo } from "@/components/stock/insumos/fila-insumo";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { listarStockInsumos } from "@/lib/data/insumos";
import { obtenerRecetasYPresentaciones } from "@/lib/data/stock";
import { alcancePorPresentacion } from "@/lib/dominio/botellas";
import { agruparPorTipo } from "@/lib/dominio/insumos";
import { createClient } from "@/lib/supabase/server";

// Datos en vivo: nunca cachear el stock de insumos (debe reflejar el
// último movimiento), mismo criterio que /stock.
export const dynamic = "force-dynamic";

/**
 * "Insumos": responde "¿qué tengo para producir?". Una tarjeta por tipo
 * (materia prima, envases, etiquetas) con lo que queda de cada insumo; para la
 * materia prima, para cuántas botellas alcanza (las recetas, igual que "Para
 * producir" de `/stock`).
 */
export default async function InsumosPage() {
  const supabase = await createClient();
  const [{ data: stock, error }, { recetas, productos }] = await Promise.all([
    listarStockInsumos(supabase),
    obtenerRecetasYPresentaciones(supabase),
  ]);
  const grupos = agruparPorTipo(stock);

  const stockPorInsumo = new Map(stock.map((s) => [s.insumo_id ?? "", s.stock ?? 0]));
  const alcanceMateriaPrima = alcancePorPresentacion({
    productos,
    recetas: recetas.map((r) => ({
      producto_id: r.producto_id,
      insumo_id: r.insumo_id,
      cantidad: r.cantidad,
      tipoInsumo: r.insumos?.tipo ?? null,
    })),
    stockPorInsumo,
    tipo: "materia_prima",
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-8">
      <EncabezadoPantalla titulo="Insumos" pregunta="¿Qué tengo para producir?" />

      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:max-w-[480px]">
        <Link href="/stock/insumos/factura" className={`${BOTON_SECUNDARIO} flex px-4`}>
          Cargar compra
        </Link>
        <Link href="/stock/insumos/ajuste" className={`${BOTON_SECUNDARIO} flex px-4`}>
          Ajuste
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-[16px] text-accent">
          {error}
        </p>
      )}

      {!error && grupos.length === 0 && (
        <p className="text-[16px] text-text-muted">Todavía no cargaste ningún insumo.</p>
      )}

      {grupos.map((grupo) => (
        <Tarjeta key={grupo.tipo} como="section" aria-labelledby={`insumos-${grupo.tipo}`} className="flex flex-col gap-1">
          <h2 id={`insumos-${grupo.tipo}`} className="text-[20px] leading-tight font-semibold text-text">
            {grupo.nombre}
          </h2>
          <div className="flex flex-col divide-y divide-line">
            {grupo.insumos.map((insumo) => (
              <FilaInsumo
                key={insumo.insumo_id}
                id={insumo.insumo_id ?? ""}
                nombre={insumo.nombre ?? ""}
                stock={insumo.stock ?? 0}
                unidad={insumo.unidad ?? "unidad"}
                bajoUmbral={insumo.bajo_umbral ?? false}
                alcance={grupo.tipo === "materia_prima" ? alcanceMateriaPrima : undefined}
              />
            ))}
          </div>
        </Tarjeta>
      ))}

      <Link
        href="/stock/insumos/nuevo"
        className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-text-muted underline decoration-[#d0cec8] underline-offset-4"
      >
        Nuevo insumo
      </Link>
    </div>
  );
}
