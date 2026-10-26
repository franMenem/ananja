import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { AjustarSaldoButton } from "@/components/caja/ajustar-saldo-button";
import { DestinoEfectivoButton } from "@/components/caja/destino-efectivo-button";
import { CuentaHeader } from "@/components/plata/cuenta-header";
import { FueraDeLaCuenta } from "@/components/plata/fuera-de-la-cuenta";
import { MovimientosPaginados } from "@/components/plata/movimientos-paginados";
import { TarjetaResultado } from "@/components/plata/resultado-mes";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { listarVendedoresNombre } from "@/lib/data/catalogos";
import { listarGastosConCategoria, listarMargenVentas } from "@/lib/data/ganancia";
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
import { NOMBRES_MES, hoyISO, partesFechaHoraArgentina } from "@/lib/fechas";
import { periodoDeMes, resumirClientes, resumirPlataEnManos, totalLeDeben } from "@/lib/dominio/inicio";
import { desgloseResultadoDelPeriodo, filtrarGastosOperativos, mapearFilasMargenVentas } from "@/lib/dominio/margen";
import { diasEnManoPorPersona, type MedioCuenta } from "@/lib/dominio/movimientos-plata";
import { createClient } from "@/lib/supabase/server";

/** Cuántas filas trae la primera carga de "Últimos movimientos" — el resto
 * llega con "Ver más" (`MovimientosPaginados`), de a `PASO_MOVIMIENTOS`. */
const LIMITE_INICIAL_MOVIMIENTOS = 10;

// Los saldos deben reflejar el último comprobante/gasto/ajuste/rendición al
// abrir, igual que antes en /caja.
export const dynamic = "force-dynamic";

/**
 * `/plata` — "Cuenta" (rediseño 2026-10, fase 4). Responde "¿cuánta hay,
 * dónde está y cuánto ganamos?", de arriba a abajo:
 *  1. Héroe: lo que hay en la cuenta de Ananja (`v_cuenta_ananja`, con link
 *     al historial de Mercado Pago y Banco en `/plata/cuenta/[medio]`).
 *  2. "Fuera de la cuenta": en manos de personas (`v_plata_en_manos`), lo que
 *     te deben (`totalLeDeben`, la misma cifra que Hoy) y lo que Ananja debe.
 *  3. "Resultado de <mes>": cobrado − costo − gastos = ganaste, con la MISMA
 *     función que Hoy y `/ganancia` (`desgloseResultadoDelPeriodo` parte de
 *     `gananciaAnanjaDelPeriodo`).
 *  4. Movimientos (con filtro Entradas/Salidas y "Ver más") y "Opciones".
 * En ancho de contenido ≥ `@3xl`, dónde está la plata a la izquierda y el
 * resultado a la derecha.
 */
export default async function PlataPage() {
  const supabase = await createClient();

  // Consulta compartida entre las dos llamadas a `cargarMovimientosPlata`
  // de abajo ("todo" y, más adelante, "manos") — antes cada una pedía
  // `vendedores` por su cuenta, dos veces por request.
  const vendedoresPromise = listarVendedoresNombre(supabase);

  // Mes en curso (hora de Argentina) para el resultado: solo las filas de
  // este mes, como hace Hoy.
  const { anio, mes } = partesFechaHoraArgentina(new Date());
  const periodoMes = periodoDeMes(anio, mes);

  const [
    { data: saldos },
    cuenta,
    { data: plataEnManos },
    { data: deudaVendedor },
    { data: deudaCliente },
    movimientos,
    destino,
    deudaAnanja,
    margenRes,
    gastosRes,
  ] = await Promise.all([
    listarSaldosCaja(supabase),
    obtenerCuentaAnanja(supabase),
    listarPlataEnManos(supabase),
    listarDeudaVendedor(supabase),
    listarDeudaClienteMontos(supabase),
    cargarMovimientosPlata(supabase, { tipo: "todo", limite: LIMITE_INICIAL_MOVIMIENTOS }, vendedoresPromise),
    obtenerDestinoEfectivo(supabase).then((d) => d ?? DESTINO_EFECTIVO_DEFAULT),
    cargarDeudaAnanja(supabase),
    listarMargenVentas(supabase, `${periodoMes}-01`),
    listarGastosConCategoria(supabase, `${periodoMes}-01`),
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
  // Misma cuenta que "Plata en la cuenta › en manos de" de Hoy.
  const totalEnManos = resumirPlataEnManos(plataEnManos ?? []).totalCentavos;

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
  // Misma función que "Te deben" de Hoy.
  const totalLeDebenCentavos = totalLeDeben(deudaVendedor ?? [], deudaCliente ?? []);

  // Resultado del mes: la misma ganancia que Hoy y `/ganancia`, abierta en
  // filas. Si falla la carga se avisa en la tarjeta (no se inventa un cero).
  const desglose =
    margenRes.error || gastosRes.error
      ? null
      : desgloseResultadoDelPeriodo(
          mapearFilasMargenVentas(margenRes.data),
          filtrarGastosOperativos(gastosRes.data),
          "mes",
          periodoMes,
        );

  const itemsMovimientos = itemsGenerales(movimientos);

  return (
    <div className="@container flex w-full min-w-0 flex-col gap-6 pb-8">
      <EncabezadoPantalla titulo="Plata" pregunta="¿Cuánta hay, dónde está y cuánto ganamos?" />

      <div className="grid grid-cols-1 items-start gap-6 @3xl:grid-cols-2 @3xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <CuentaHeader cuentaTotal={cuentaTotal} saldoCuenta={saldoCuenta} />
          <FueraDeLaCuenta
            personas={personas}
            diasPorPersona={diasPorPersona}
            totalEnManos={totalEnManos}
            efectivoSinDueno={efectivoSinDueno}
            deudores={deudores}
            clientes={clientes}
            totalLeDeben={totalLeDebenCentavos}
            deudaAnanja={deudaAnanja}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <TarjetaResultado nombreMes={NOMBRES_MES[mes].toLowerCase()} desglose={desglose} />
        </div>
      </div>

      <Tarjeta como="section" aria-labelledby="plata-movimientos" className="flex flex-col gap-3">
        <h2 id="plata-movimientos" className="text-[20px] leading-tight font-semibold text-text">
          Movimientos
        </h2>
        <MovimientosPaginados
          itemsIniciales={itemsMovimientos}
          limiteInicial={LIMITE_INICIAL_MOVIMIENTOS}
          paso={PASO_MOVIMIENTOS}
          vacio="Todavía no hay movimientos."
        />
      </Tarjeta>

      <Tarjeta como="section" aria-labelledby="plata-opciones" className="flex flex-col gap-3">
        <h2 id="plata-opciones" className="text-[20px] leading-tight font-semibold text-text">
          Opciones
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <DestinoEfectivoButton destinoActual={destino} />
          <AjustarSaldoButton className={`${BOTON_SECUNDARIO} flex px-4`} />
        </div>
      </Tarjeta>
    </div>
  );
}
