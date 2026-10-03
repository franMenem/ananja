import { AjustarSaldoButton } from "@/components/caja/ajustar-saldo-button";
import { DestinoEfectivoButton } from "@/components/caja/destino-efectivo-button";
import { AnanjaDebe } from "@/components/plata/ananja-debe";
import { CuentaHeader } from "@/components/plata/cuenta-header";
import { EnManosLista } from "@/components/plata/en-manos-lista";
import { LeDeben } from "@/components/plata/le-deben";
import { MovimientosPaginados } from "@/components/plata/movimientos-paginados";
import { Separador } from "@/components/plata/separador";
import { listarVendedoresNombre } from "@/lib/data/catalogos";
import {
  cargarDeudaAnanja,
  cargarMovimientosPlata,
  itemsGenerales,
  listarDeudaClienteMontos,
  listarDeudaVendedor,
  listarPlataEnManos,
  listarSaldosCaja,
  obtenerCuentaAnanja,
  obtenerDestinoEfectivo,
  PASO_MOVIMIENTOS,
} from "@/lib/data/plata";
import { DESTINO_EFECTIVO_DEFAULT } from "@/lib/dominio/transferencias";
import { hoyISO } from "@/lib/fechas";
import { resumirClientes } from "@/lib/dominio/inicio";
import { diasEnManoPorPersona, type MedioCuenta } from "@/lib/dominio/movimientos-plata";
import { createClient } from "@/lib/supabase/server";

/** Cuántas filas trae la primera carga de "Últimos movimientos" — el resto
 * llega con "Ver más" (`MovimientosPaginados`), de a `PASO_MOVIMIENTOS`. */
const LIMITE_INICIAL_MOVIMIENTOS = 10;

// Los saldos deben reflejar el último comprobante/gasto/ajuste/rendición al
// abrir, igual que antes en /caja.
export const dynamic = "force-dynamic";

/**
 * `/plata` — 2026-09-16: /caja se fundió en /plata para que la plata y las
 * deudas estén en un solo lugar. Responde una sola pregunta, "¿dónde está
 * la plata y quién debe?", en el orden que decidió Fran:
 *  1. Oliva con dos cifras — Cuenta Ananja (`v_cuenta_ananja`, con link al
 *     historial de cada medio en `/plata/cuenta/[medio]`) y En manos de
 *     (`v_plata_en_manos`). Sin un tercer "Total combinado": confunde más
 *     de lo que aclara.
 *  2. `EnManosLista` — una fila por persona con plata en mano.
 *  3. `LeDeben` — revendedoras + clientes.
 *  4. `AnanjaDebe` — pedidos al proveedor y deudas del negocio
 *     (`lib/deuda-ananja.ts`), cada una con su "Pagar".
 *  5. Últimos movimientos (`cargarMovimientosPlata`, arranca en 10 con
 *     "Ver más" para recorrer todo el historial — `MovimientosPaginados`,
 *     2026-09-18) y, al pie, "Ajustar saldo" / cuenta destino del efectivo.
 * Ya no hay una lista de accesos del sector al pie: Gastos, Ganancia y
 * Precios se llegan por el rail/tab bar (`lib/navegacion.ts`).
 */
export default async function PlataPage() {
  const supabase = await createClient();

  // Consulta compartida entre las dos llamadas a `cargarMovimientosPlata`
  // de abajo ("todo" y, más adelante, "manos") — antes cada una pedía
  // `vendedores` por su cuenta, dos veces por request.
  const vendedoresPromise = listarVendedoresNombre(supabase);

  const [
    { data: saldos },
    cuenta,
    { data: plataEnManos },
    { data: deudaVendedor },
    { data: deudaCliente },
    movimientos,
    destino,
    deudaAnanja,
  ] = await Promise.all([
    listarSaldosCaja(supabase),
    obtenerCuentaAnanja(supabase),
    listarPlataEnManos(supabase),
    listarDeudaVendedor(supabase),
    listarDeudaClienteMontos(supabase),
    cargarMovimientosPlata(supabase, { tipo: "todo", limite: LIMITE_INICIAL_MOVIMIENTOS }, vendedoresPromise),
    obtenerDestinoEfectivo(supabase).then((d) => d ?? DESTINO_EFECTIVO_DEFAULT),
    cargarDeudaAnanja(supabase),
  ]);

  const saldoPorMedio = new Map<string, number>(
    (saldos ?? []).map((row) => [row.medio_pago ?? "", row.saldo_centavos ?? 0]),
  );

  const cuentaTotal = cuenta?.total_centavos ?? 0;
  const saldoCuenta: Record<MedioCuenta, number> = {
    mercado_pago: cuenta?.mercado_pago_centavos ?? 0,
    banco: cuenta?.banco_centavos ?? 0,
  };

  // Personas con algo que contar (≠ 0), por nombre — mismo criterio que
  // usaba /caja.
  const personas = (plataEnManos ?? [])
    .filter(
      (p): p is typeof p & { tenedor_id: string; nombre: string; total_centavos: number } =>
        Boolean(p.tenedor_id && p.nombre) && (p.total_centavos ?? 0) !== 0,
    )
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const totalEnManos = personas.reduce((acc, p) => acc + p.total_centavos, 0);

  // Efectivo que no está en manos de ningún admin (saldo inicial de la vieja
  // caja efectivo, o una venta en efectivo de alguien que no es admin).
  const efectivoSinDueno = (saldoPorMedio.get("efectivo") ?? 0) - totalEnManos;

  // Desde cuándo tiene cada uno la plata: la carga de filas queda acá, el
  // cálculo es puro (`lib/movimientos-plata.ts`).
  const conPlata = personas.filter((p) => p.total_centavos > 0).map((p) => p.tenedor_id);
  const filasEnManos = await cargarMovimientosPlata(supabase, { tipo: "manos", personaIds: conPlata }, vendedoresPromise);
  const diasPorPersona = diasEnManoPorPersona(personas, filasEnManos, hoyISO());

  // Deudores con saldo > 0, del más grande al más chico (pedido explícito
  // de Fran).
  const deudores = (deudaVendedor ?? [])
    .filter(
      (d): d is typeof d & { vendedor_id: string; nombre: string; saldo_centavos: number } =>
        Boolean(d.vendedor_id && d.nombre) && (d.saldo_centavos ?? 0) > 0,
    )
    .sort((a, b) => b.saldo_centavos - a.saldo_centavos);
  const clientes = resumirClientes(deudaCliente ?? []);
  const totalLeDeben = deudores.reduce((acc, d) => acc + d.saldo_centavos, 0) + clientes.totalCentavos;

  const itemsMovimientos = itemsGenerales(movimientos);

  return (
    <div className="flex min-w-0 flex-col pb-8">
      <CuentaHeader cuentaTotal={cuentaTotal} saldoCuenta={saldoCuenta} totalEnManos={totalEnManos} />

      <div className="hidden items-center py-6 md:flex">
        <h1 className="font-display text-[38px] leading-[1.05] text-primary">Plata</h1>
      </div>

      <EnManosLista personas={personas} diasPorPersona={diasPorPersona} efectivoSinDueno={efectivoSinDueno} />
      <LeDeben deudores={deudores} clientes={clientes} total={totalLeDeben} />
      <AnanjaDebe deudaAnanja={deudaAnanja} />

      {/* Últimos movimientos */}
      <div className="flex flex-col pt-8">
        <Separador titulo="Últimos movimientos" />
        <MovimientosPaginados
          itemsIniciales={itemsMovimientos}
          limiteInicial={LIMITE_INICIAL_MOVIMIENTOS}
          paso={PASO_MOVIMIENTOS}
          vacio="Todavía no hay movimientos."
        />

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <DestinoEfectivoButton destinoActual={destino} />
          <AjustarSaldoButton className="flex min-h-11 items-center justify-center border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase" />
        </div>
      </div>
    </div>
  );
}
