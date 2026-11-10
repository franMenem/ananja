import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { Fila } from "@/components/ui/fila";
import { LinkBoton } from "@/components/ui/link-boton";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { diferenciaPlata } from "@/lib/dominio/feria";
import { sePuedeCerrarMiFeria, textoDegustacionMi } from "@/lib/dominio/feria-mi";
import { formatFecha, hoyISO } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { envase } from "@/lib/negocio";

export type ProductoFeriaMi = {
  productoId: string;
  nombre: string;
  entregadas: number;
  /** Pendiente: ventas normales ya cargadas. Cerrada: todo lo vendido. */
  vendidas: number;
  devueltas: number;
  /** Total: la que cargó el admin de antemano + la del cierre. */
  degustadas: number;
  /** Cargada de antemano por el admin, a cargo de Ananja (no es suya ni suma deuda). */
  degustadasCarga: number;
  degustadasCierre: number;
  precioFeriaCentavos: number | null;
};

export type FeriaMiDatos = {
  nombre: string;
  fecha: string;
  lugar: string | null;
  cerrada: boolean;
  productos: ProductoFeriaMi[];
  totalVendidoCentavos: number;
  efectivoCentavos: number;
  mercadoPagoCentavos: number;
  bancoCentavos: number;
};

/** Texto de la diferencia entre lo que juntó y lo que vendió. */
export function textoDiferencia(diferenciaCentavos: number): string {
  if (diferenciaCentavos === 0) return "Cuadra justo";
  return diferenciaCentavos < 0
    ? `Te faltan ${formatCentavos(-diferenciaCentavos)}`
    : `Te sobran ${formatCentavos(diferenciaCentavos)}`;
}

/** Contenido de `/mi/feria` (los datos los arma la página). `hoy` lo pasa la página, calculado una sola vez; el valor por defecto es solo para tests. */
export function FeriaMiVista({ feria, hoy = hoyISO() }: { feria: FeriaMiDatos | null; hoy?: string }) {
  if (!feria) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 pb-8">
        <p className="text-[16px] text-text-muted">No tenés ninguna feria en curso.</p>
      </div>
    );
  }

  const productos = feria.productos.filter((p) => p.entregadas > 0 || p.vendidas > 0 || p.degustadasCarga > 0);
  const totalLlevadas = productos.reduce((a, p) => a + p.entregadas, 0);
  const totalDevueltas = productos.reduce((a, p) => a + p.devueltas, 0);
  const totalDegustadasCarga = productos.reduce((a, p) => a + p.degustadasCarga, 0);
  const totalDegustadasCierre = productos.reduce((a, p) => a + p.degustadasCierre, 0);
  const totalVendidas = productos.reduce((a, p) => a + p.vendidas, 0);
  const juntado = feria.efectivoCentavos + feria.mercadoPagoCentavos + feria.bancoCentavos;
  const subtitulo = [formatFecha(feria.fecha), feria.lugar].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 pb-8">
      <EncabezadoPantalla
        titulo={`Feria ${feria.nombre}`}
        pregunta={subtitulo}
        acciones={
          feria.cerrada ? (
            <Pastilla variante="ok">Ya cerraste tu feria</Pastilla>
          ) : (
            <Pastilla variante="aviso">Pendiente de cerrar</Pastilla>
          )
        }
      />

      {!feria.cerrada ? (
        <>
          <Tarjeta como="section" className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] leading-tight font-bold text-text">Lo que te llevaste</h2>
            {productos.length === 0 ? (
              <p className="py-2 text-[16px] text-text-muted">Todavía no te cargaron {envase(2)}.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line">
                {productos.map((p) => (
                  <Fila
                    key={p.productoId}
                    titulo={p.nombre}
                    detalle={
                      <>
                        {p.precioFeriaCentavos !== null && <span>Precio de feria {formatCentavos(p.precioFeriaCentavos)}</span>}
                        {p.vendidas > 0 && (
                          <span className="block">
                            Ya vendiste {p.vendidas}
                          </span>
                        )}
                        {p.degustadasCarga > 0 && (
                          <span className="block">
                            {p.degustadasCarga} para degustación (a cargo de Ananja)
                          </span>
                        )}
                      </>
                    }
                    valor={`${p.entregadas} para vender`}
                  />
                ))}
              </div>
            )}
          </Tarjeta>
          {productos.length > 0 &&
            (sePuedeCerrarMiFeria(null, feria.fecha, hoy) ? (
              <LinkBoton href="/mi/feria/cerrar" className={`${BOTON_PRIMARIO} flex w-full px-4`}>
                Cerrar mi feria
              </LinkBoton>
            ) : (
              <p className="text-[16px] text-text-muted">Vas a poder cerrar tu feria el día de la feria.</p>
            ))}
        </>
      ) : (
        <>
          <Tarjeta como="section" className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] leading-tight font-bold text-text">Cómo te fue</h2>
            <div className="flex flex-col divide-y divide-line">
              {productos.map((p) => (
                <Fila
                  key={p.productoId}
                  titulo={p.nombre}
                  detalle={`Te llevaste ${p.entregadas} · devolviste ${p.devueltas} · degustación ${textoDegustacionMi(p.degustadasCarga, p.degustadasCierre)}`}
                  valor={`Vendiste ${p.vendidas}`}
                />
              ))}
            </div>
            <div className="flex flex-col gap-1 border-t border-line pt-3 text-[16px] text-text">
              <p>
                Vendiste {totalVendidas} {envase(totalVendidas)} por{" "}
                <span className="font-semibold tabular-nums">{formatCentavos(feria.totalVendidoCentavos)}</span>.
              </p>
              <p className="text-text-muted">
                Devolviste {totalDevueltas} de las {totalLlevadas} que te llevaste · degustación{" "}
                {textoDegustacionMi(totalDegustadasCarga, totalDegustadasCierre)}.
              </p>
            </div>
          </Tarjeta>

          <Tarjeta como="section" className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] leading-tight font-bold text-text">La plata que juntaste</h2>
            <div className="flex flex-col divide-y divide-line">
              <Fila titulo="Efectivo" valor={formatCentavos(feria.efectivoCentavos)} />
              <Fila titulo="Mercado Pago" valor={formatCentavos(feria.mercadoPagoCentavos)} />
              <Fila titulo="Banco" valor={formatCentavos(feria.bancoCentavos)} />
            </div>
            <p className="pt-2 text-[15px] text-text-muted">
              {textoDiferencia(diferenciaPlata(feria.totalVendidoCentavos, juntado))}
            </p>
          </Tarjeta>

          <p className="text-[14px] text-text-muted">
            Si algo está mal, pedile a un admin que reabra tu participación.
          </p>
        </>
      )}
    </div>
  );
}
