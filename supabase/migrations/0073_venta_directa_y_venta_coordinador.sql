-- Ananja: "agarra directo del depósito" y "la coordinadora vendió N botellas".
--
-- Por qué (pedido del dueño):
--
--  1) Hay una revendedora muy desordenada que agarra botellas del depósito
--     sin que nadie le cargue la entrega. Hoy, para cargar su venta, alguien
--     tiene que cargarle ANTES una entrega a mano (si no, la venta falla con
--     `STOCK_REVENDEDOR_INSUFICIENTE`). El dueño quiere marcar a ciertas
--     personas con un interruptor ("agarra directo") para que puedan cargar
--     una venta aunque no tengan botellas entregadas: lo que les falte en su
--     poder se saca del depósito (del lote más viejo con stock), el sistema
--     anota sola la entrega (marcada como automática) y registra la venta
--     contra esa entrega. Su deuda se calcula como siempre.
--
--  2) A veces la coordinadora agarra botellas y las vende ella. Se carga en
--     un solo paso "vendió N botellas del lote X" (la carga un admin o ella
--     misma). El precio no importa: las botellas bajan del depósito y a ella
--     le suma N × costo Ananja a lo que tiene que pasar a Ananja.
--
-- Diseño: se reutiliza la maquinaria que ya existe (entrega + venta +
-- rendición) en vez de inventar un circuito paralelo. La venta de la
-- coordinadora es, en UNA transacción, una entrega automática a sí misma +
-- una fila de `ventas_revendedor` a precio = costo Ananja + una `rendiciones`
-- de ella hacia ella (`vendedor_id = tenedor_id`, `via = 'encargado'`). Así
-- `v_rendiciones_ananja`, `v_plata_en_manos`, `v_saldos_caja`, el desglose
-- por lote, la cobranza del lote y la ganancia dan bien SIN tocar ninguna
-- vista (esta migración NO modifica vistas): para sus vistas la coordinadora
-- es una vendedora más que ya rindió exactamente lo que vendió. Se verificó
-- una por una (ver "Cómo se verificó"):
--   - `v_rendiciones_ananja` parte las rendiciones por `vendedor_id`, así
--     que la rendición propia NO se mezcla con las que ella recibe de sus
--     revendedoras (esas tienen otro `vendedor_id`); la parte Ananja sale
--     exacta porque `costo_lote_unitario` (foto) = `costo_ananja_unitario`
--     (lo cobrado) = el costo vigente del lote.
--   - `v_plata_en_manos`: la rendición propia suma exactamente N × costo.
--   - `v_deuda_vendedor` / `v_resumen_revendedor` filtran por rol
--     (`revendedor` o admin que revende): la coordinadora no entra, sin
--     deuda fantasma.
--   - `v_margen_ventas`: margen de vendedor 0 (precio = costo) y margen
--     Ananja correcto.
--
-- Qué toca:
--
--  1) Columnas nuevas (`add column if not exists`, idempotente):
--       - `vendedores.toma_directo boolean not null default false`: el
--         interruptor. SIN `grant update` de columna: `authenticated` solo
--         puede actualizar `vendedores.nombre` (0007/0035), así que ni un
--         `update` por REST ni la propia persona pueden activarlo; se escribe
--         únicamente con `fijar_toma_directo` (RPC de admin).
--       - `entregas_revendedor.automatica boolean not null default false`:
--         la entrega (o su devolución compensatoria) la generó el sistema,
--         no una persona.
--       - `entregas_revendedor.venta_grupo_id uuid` y
--         `rendiciones.venta_grupo_id uuid` (null): `ventas_revendedor.grupo_id`
--         de la venta que originó la fila, para poder deshacer y para
--         describir la operación en pantalla. SIN foreign key a propósito
--         (`grupo_id` no es único: una venta partida en dos tramos son dos
--         filas con el mismo `grupo_id`).
--       - Índices parciales `where venta_grupo_id is not null`.
--
--  2) Tabla `public.rendiciones_borradas`: archivo de las rendiciones que
--     borra esta feature (solo las de una venta de coordinadora que se
--     elimina): todas las columnas de la fila original (con su id en
--     `rendicion_id` y su `created_at`) + `borrada_por` + `borrada_at`. Sin
--     FKs (registro histórico, mismo criterio que
--     `ventas_revendedor_borradas` de 0045 y `movimientos_stock_borrados` de
--     0072: no puede impedir borrar nada más adelante y no vuelve ambiguo
--     ningún embed de PostgREST). RLS activada, select solo `es_admin()`, sin
--     escritura por REST: solo la escribe `eliminar_venta_revendedor`.
--
--  3) `public.fijar_toma_directo(p_vendedor_id, p_habilitar) returns json`:
--     security definer, solo admins. Mismo molde que
--     `fijar_espacio_revendedor` (0026).
--
--  4) `public.tomar_del_deposito(...)`: helper INTERNO (sin chequeo de rol,
--     sin grants para anon/authenticated). Crea la entrega automática: elige
--     lotes con stock y costos completos del más viejo al más nuevo (o solo
--     el lote pedido), inserta `entregas_revendedor` + `entrega_items` +
--     `movimientos_stock` con EXACTAMENTE la misma forma que los de
--     `registrar_entrega_revendedor` (el trigger de foto de costo sigue
--     congelando `costo_lote_unitario`/`costo_produccion_unitario`), y
--     serializa el depósito con un advisory lock por producto (dos personas
--     agarrando a la vez del mismo lote ya no pueden pisarse).
--
--     COSTO COBRADO de la entrega automática (la regla): el costo Ananja
--     VIGENTE del lote (`v_costo_lote_vigente.costo_ananja_centavos`, con el
--     redondeo de 0054 y las actualizaciones de 0052) y, de sugerido, el
--     minorista sugerido vigente del lote. Evidencia (investigado en el
--     código y en la base antes de elegirla):
--       - Es lo que precarga hoy el formulario de entrega del admin
--         (`components/revendedores/carga/use-entrega.ts`: `costo` =
--         `lote.costoAnanjaCentavos`, `sugerido` =
--         `lote.precioMinoristaSugeridoCentavos`, ambos de
--         `v_costo_lote_vigente`) y es lo que cobra SIEMPRE, sin poder
--         editarlo, `registrar_entrega_revendedor` cuando la llama una
--         coordinadora (0055 § 10: "nunca confía en lo que mande el
--         cliente: siempre el vigente").
--       - NO existe una regla persistida de "plus" por persona. El plus de
--         una revendedora a cargo de una coordinadora (que le cobra por
--         encima del costo Ananja) solo existe como un número que un admin
--         tipea a mano en cada ítem de entrega
--         (`entrega_items.costo_ananja_unitario_centavos`); ninguna tabla lo
--         guarda como regla. `revendedor_precios` (0018) es solo el respaldo
--         para entregas VIEJAS sin costo (0040: "queda solo como respaldo"),
--         `insertar_venta_revendedor` lo usa únicamente cuando el tramo no
--         tiene costo, y una entrega nueva cargada hoy lo ignora. Se podría
--         inferir un plus con `costo_ananja_unitario - costo_lote_unitario`
--         de la última entrega del mismo producto, pero es una heurística
--         (puede ser un descuento puntual, o de un lote con otro costo), y
--         no hay una fuente de verdad sin ambigüedad.
--     RIESGO conocido: una revendedora "agarra directo" que además tiene
--     coordinadora y un plus acordado paga el costo Ananja pelado por lo
--     que agarra del depósito (el plus de ESA parte no se cobra). Ananja
--     cobra bien su costo; lo que se pierde es el margen de la coordinadora
--     en esas botellas. Si se quiere otra regla, es cambiar una línea del
--     helper.
--
--  5) `create or replace` de `public.insertar_venta_revendedor` (MISMA firma,
--     mismos grants, sigue sin ser security definer): si la persona tiene
--     `toma_directo` y le falta stock (en total, o del lote pedido), llama al
--     helper por el FALTANTE (del lote pedido si vino `p_lote_id`) pasando el
--     `grupo_id` de la venta, y después sigue con el reparto por tramos de
--     siempre. Para quien NO tiene el flag el código que corre es el mismo de
--     siempre (mismos resultados y mismos errores, en el mismo orden). El
--     reintento idempotente por `p_grupo_id` (`ya_existia`) retorna ANTES de
--     tocar el depósito, así que no crea una segunda entrega automática. La
--     entrega automática lleva `fecha = p_fecha`, así que no dispara
--     `FECHA_ANTERIOR_A_ENTREGA` para la venta que la originó, y lleva el
--     costo cobrado, así que no dispara `PRECIO_NO_ASIGNADO`.
--
--  6) `create or replace` de `public.eliminar_venta_revendedor` (MISMA firma,
--     mismos grants, misma regla de quién puede): después de borrar las
--     ventas del grupo (el trigger de 0045 las sigue archivando):
--       a) si hay entregas automáticas con `venta_grupo_id` = ese grupo, las
--          compensa con una DEVOLUCIÓN automática (`tipo = 'devolucion'`,
--          `automatica`, mismo `venta_grupo_id`, mismo producto y lote, más
--          el `movimientos_stock` `ingreso` con `entrega_id` y `lote_id`, con
--          la forma de una devolución normal), por la cantidad que puso la
--          entrega automática acotada a lo que la persona tiene en poder en
--          ese momento de ese producto/lote (y descontando lo ya compensado).
--          Append-only: no se borra ninguna entrega ni movimiento.
--       b) si hay una rendición con `venta_grupo_id` = ese grupo (venta de
--          coordinadora), la archiva en `rendiciones_borradas` y la borra;
--          si al sacarla el total de `v_plata_en_manos` del tenedor queda
--          negativo, o queda por debajo de un aviso de depósito PENDIENTE de
--          esa coordinadora, lanza `YA_PASO_LA_PLATA` y no se borra nada
--          (la excepción deshace toda la transacción).
--     Una venta normal (sin entrega automática ni rendición enlazada) queda
--     idéntica. Se extiende la función existente y no se crea una paralela
--     porque es la que llaman el botón "Eliminar" de la ficha y la propia
--     persona: `eliminar_venta_revendedor` no chequea `puede_revender()`, así
--     que una coordinadora ya puede borrar su propia venta, y si no limpiara
--     la rendición quedaría una deuda huérfana.
--
--  7) `public.registrar_venta_coordinador(p_coordinador_id, p_producto_id,
--     p_cantidad, p_lote_id, p_fecha, p_nota default null) returns json`:
--     security definer. Autoriza a un admin (cualquier coordinadora activa) o
--     a la propia coordinadora para sí misma. Una carga = un lote (por eso
--     `p_lote_id` es obligatorio): así el precio de venta de todas las filas
--     es el costo de ESE lote y el margen de vendedor queda en 0. En una
--     transacción: (a) `tomar_del_deposito` por N de ese lote al costo
--     vigente; (b) `insertar_venta_revendedor` a precio = ese costo; (c)
--     `rendiciones` de ella hacia ella por Σ cantidad × costo, `medio_pago =
--     'efectivo'` (convención: es plata que ella tiene en mano; ver riesgo
--     abajo). Devuelve `{grupo_id, entrega_id, rendicion_id, monto_centavos}`.
--
-- Errores NUEVOS (la UI tiene que traducirlos):
--   - `DEPOSITO_INSUFICIENTE`: no hay tantas botellas en el depósito.
--     `detail` JSON `{producto, producto_id, disponible}` (+ `lote_id` si se
--     pidió un lote). Distinto A PROPÓSITO de `STOCK_REVENDEDOR_INSUFICIENTE`
--     ("no tenés tantas"): acá lo que falta es el depósito. Puede salir de
--     `registrar_venta_revendedor`, `registrar_venta_revendedor_admin`,
--     `registrar_carga_revendedor` (con el prefijo `ventas:`) y
--     `registrar_venta_coordinador`.
--   - `YA_PASO_LA_PLATA`: no se puede eliminar la venta de una coordinadora
--     porque la plata que sumó ya salió (la depositó o tiene un aviso de
--     depósito pendiente). `detail` JSON `{en_mano_centavos, ...}`.
--   - `COORDINADOR_INVALIDO`: el destino de `registrar_venta_coordinador` no
--     es una coordinadora activa.
--   Existentes que también salen de las funciones nuevas: `NO_AUTORIZADO`,
--   `REVENDEDOR_INVALIDO` (`fijar_toma_directo`), `LOTE_INVALIDO` (falta el
--   lote o no corresponde al producto), `COSTO_FALTANTE` (el lote pedido
--   tiene stock pero todavía no tiene costos cargados), `CANTIDAD_INVALIDA`,
--   `FECHA_INVALIDA`, `FECHA_FUTURA`.
--
-- Riesgos y decisiones a tener presentes:
--   - Carrera sobre el depósito: el advisory lock serializa SOLO a quienes
--     pasan por `tomar_del_deposito`. `registrar_entrega_revendedor` y
--     `crear_comprobante` no lo toman (esta migración no los toca), así que
--     una entrega manual simultánea del mismo producto sigue pudiendo
--     pisarse con una toma; en ese caso la red de seguridad final del helper
--     (`v_stock_actual` no puede quedar negativo) corta la toma.
--   - La rendición propia de la coordinadora lleva `medio_pago = 'efectivo'`
--     por convención (no hay un pago real): si algún día se audita por medio
--     de pago, esas filas figuran como efectivo recibido. Se reconocen por
--     `vendedor_id = tenedor_id` (y `venta_grupo_id` no nulo).
--   - La entrega automática de una persona a cargo de una coordinadora figura
--     en el hilo de esa persona como entrega de la persona misma
--     (`admin_id` = quien cargó la venta); la UI la identifica por
--     `automatica`.
--   - La toma directa saca del depósito a la fecha de la VENTA (`p_fecha`),
--     no a la de hoy: una venta vieja cargada tarde deja el egreso en el
--     stock actual pero con la fecha de entrega de la venta.
--
-- Compatibilidad con la UI desplegada: solo agrega (columnas con default,
-- tabla, funciones). Las dos funciones reescritas se comportan igual para
-- todo lo que existía antes (nadie tiene el flag ni hay entregas
-- automáticas), así que la UI vieja sigue andando igual hasta que salga la
-- nueva.
--
-- Migración sin templating (mismo criterio que 0049-0072): hardcodea
-- `public.`. `set search_path = public` va SIN comillas a propósito: con
-- comillas rompe el render multi-schema (supabase/render.mjs). (Esto cambia
-- el texto de `insertar_venta_revendedor`, que en 0062 lo tenía con comillas;
-- el efecto en `proconfig` es el mismo: `search_path=public`.)
--
-- Cómo se verificó: aplicada la cadena 0001-0073 renderizada para `public` en
-- un Postgres 15 descartable (no en producción) con stubs mínimos de `auth` y
-- `storage`, contra otra base de la misma instancia con la cadena hasta 0072
-- para comparar el comportamiento previo. Con usuarios simulados (admin,
-- coordinadora, revendedora de esa coordinadora, dos revendedoras sueltas) y
-- datos ficticios (2 presentaciones, 3 lotes: 2 con costos distintos y 1 sin
-- costos):
--   - sin flag, el mismo guion (ventas, errores de stock, reintentos,
--     entregas, carga unificada, eliminaciones) da resultados y estado final
--     idénticos con la cadena hasta 0072 y hasta 0073;
--   - con flag: venta con 0 en poder, con algo en poder (usa primero lo
--     propio), cruzando dos lotes del depósito, con lote elegido, lote sin
--     costos, depósito insuficiente (nada escrito), reintento idempotente,
--     carga unificada, fechas; eliminar la venta (stock del depósito y
--     `en_poder` vuelven a cerrar, quedan la entrega y la devolución
--     automáticas) incluido el tope por lo que sigue en poder;
--   - venta de coordinadora por admin y por ella misma (plata en mano sube
--     exacto, parte Ananja, caja de efectivo, margen, cobranza, sin deuda
--     fantasma, sin interferir con lo que recibe de sus revendedoras), todos
--     los errores, eliminar (por admin y por ella), `YA_PASO_LA_PLATA` por
--     plata ya depositada y por aviso de depósito pendiente;
--   - seguridad: anon sin acceso, `authenticated` no ejecuta las internas, el
--     flag no se escribe por REST, `rendiciones_borradas` solo la lee un
--     admin, una sola firma por función;
--   - concurrencia con dos sesiones: dos tomas que juntas superan el stock →
--     la segunda espera y recibe `DEPOSITO_INSUFICIENTE`, sin stock negativo.
--
-- SIN APLICAR: queda para que Fran la aplique.

-- ============================================================
-- 1) Columnas nuevas
-- ============================================================

alter table public.vendedores
  add column if not exists toma_directo boolean not null default false;

alter table public.entregas_revendedor
  add column if not exists automatica boolean not null default false,
  add column if not exists venta_grupo_id uuid;

alter table public.rendiciones
  add column if not exists venta_grupo_id uuid;

create index if not exists idx_entregas_revendedor_venta_grupo_id
  on public.entregas_revendedor (venta_grupo_id)
  where venta_grupo_id is not null;

create index if not exists idx_rendiciones_venta_grupo_id
  on public.rendiciones (venta_grupo_id)
  where venta_grupo_id is not null;

-- ============================================================
-- 2) Rendiciones borradas
-- ============================================================

create table public.rendiciones_borradas (
  id uuid primary key default gen_random_uuid(),
  -- Columnas de la fila borrada, tal cual estaban (id y created_at originales).
  rendicion_id uuid not null,
  vendedor_id uuid not null,
  monto_centavos bigint not null,
  medio_pago public.medio_pago not null,
  fecha date not null,
  nota text,
  admin_id uuid not null,
  created_at timestamptz not null,
  via text not null,
  tenedor_id uuid,
  encargado_diferencia_id uuid,
  venta_grupo_id uuid,
  -- vendedores.id de quien la borró.
  borrada_por uuid,
  borrada_at timestamptz not null default now()
);

create index idx_rendiciones_borradas_borrada_at
  on public.rendiciones_borradas (borrada_at desc);

alter table public.rendiciones_borradas enable row level security;
revoke all on public.rendiciones_borradas from anon, authenticated, public;
grant select on public.rendiciones_borradas to authenticated;

create policy rendiciones_borradas_select on public.rendiciones_borradas
  for select to authenticated
  using (public.es_admin());
-- Sin insert/update/delete por REST: solo eliminar_venta_revendedor.

-- ============================================================
-- 3) fijar_toma_directo — el interruptor "agarra directo del depósito"
-- ============================================================

create function public.fijar_toma_directo(p_vendedor_id uuid, p_habilitar boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_habilitar boolean;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_habilitar := coalesce(p_habilitar, false);

  -- Para ACTIVARLO el destino tiene que ser una persona activa que puede
  -- revender (misma regla que `registrar_venta_revendedor_admin`). Para
  -- APAGARLO alcanza con que exista: si alguien quedó con el flag prendido y
  -- después lo dieron de baja o cambió de rol, un admin tiene que poder
  -- limpiarlo igual.
  if v_habilitar then
    if not exists (
      select 1 from public.vendedores
      where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
    ) then
      raise exception 'REVENDEDOR_INVALIDO';
    end if;
  else
    if not exists (select 1 from public.vendedores where id = p_vendedor_id) then
      raise exception 'REVENDEDOR_INVALIDO';
    end if;
  end if;

  update public.vendedores set toma_directo = v_habilitar where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id, 'toma_directo', v_habilitar);
end;
$$;

revoke execute on function public.fijar_toma_directo(uuid, boolean) from anon, public;
grant execute on function public.fijar_toma_directo(uuid, boolean) to authenticated;

-- ============================================================
-- 4) tomar_del_deposito — helper interno: la entrega automática
-- ============================================================

-- Sin security definer (como `insertar_venta_revendedor`): solo la llaman
-- funciones definer ya autorizadas, que corren como el dueño de las
-- funciones. Sin chequeo de rol y sin grants para anon/authenticated.
--
-- Devuelve el id de la `entregas_revendedor` creada. Todo o nada: si el
-- depósito no alcanza se lanza `DEPOSITO_INSUFICIENTE` ANTES de escribir.
create function public.tomar_del_deposito(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_fecha date,
  p_lote_id uuid,
  p_venta_grupo_id uuid,
  p_nota text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_entrega_id uuid;
  v_nombre text;
  v_disponible int;
  v_resto int;
  v_tomar int;
  v_stock bigint;
  v_lote record;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  v_admin_id := public.mi_vendedor_id();
  if v_admin_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_lote_id is not null and not exists (
    select 1 from lote_items where lote_id = p_lote_id and producto_id = p_producto_id
  ) then
    raise exception 'LOTE_INVALIDO';
  end if;

  -- Serializa a quienes agarran del depósito: el lock de la fila del
  -- vendedor (que ya toma `insertar_venta_revendedor`) solo ordena a la
  -- MISMA persona, y el stock del depósito es compartido. Dos tomas del
  -- mismo producto se ejecutan una atrás de la otra; la segunda lee el stock
  -- ya descontado por la primera (READ COMMITTED: cada sentencia ve lo
  -- commiteado hasta ese momento).
  perform pg_advisory_xact_lock(hashtext('deposito'), hashtext(p_producto_id::text));

  select coalesce(sum(s.quedan), 0)::int into v_disponible
  from v_stock_por_lote s
  join v_costo_lote_vigente c on c.lote_id = s.lote_id and c.producto_id = s.producto_id
  where s.producto_id = p_producto_id
    and s.quedan > 0
    and c.tiene_costos
    and c.costo_ananja_centavos > 0
    and (p_lote_id is null or s.lote_id = p_lote_id);

  if v_disponible < p_cantidad then
    -- El lote pedido tiene botellas pero todavía no tiene los costos
    -- completos (no se puede cobrar): error propio, igual que
    -- `registrar_entrega_revendedor` de una coordinadora.
    if p_lote_id is not null
      and exists (
        select 1 from v_stock_por_lote s
        where s.lote_id = p_lote_id and s.producto_id = p_producto_id and s.quedan > 0
      )
      and not exists (
        select 1 from v_costo_lote_vigente c
        where c.lote_id = p_lote_id and c.producto_id = p_producto_id
          and c.tiene_costos and c.costo_ananja_centavos > 0
      )
    then
      raise exception 'COSTO_FALTANTE';
    end if;

    select nombre into v_nombre from productos where id = p_producto_id;
    raise exception 'DEPOSITO_INSUFICIENTE'
      using detail = (
        case
          when p_lote_id is not null then
            json_build_object(
              'producto', v_nombre,
              'producto_id', p_producto_id,
              'lote_id', p_lote_id,
              'disponible', v_disponible
            )
          else
            json_build_object(
              'producto', v_nombre,
              'producto_id', p_producto_id,
              'disponible', v_disponible
            )
        end
      )::text;
  end if;

  insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, automatica, venta_grupo_id)
  values (p_vendedor_id, 'entrega', p_fecha, p_nota, v_admin_id, true, p_venta_grupo_id)
  returning id into v_entrega_id;

  v_resto := p_cantidad;

  for v_lote in
    select
      s.lote_id,
      s.quedan::int as quedan,
      c.costo_ananja_centavos as costo,
      c.precio_minorista_sugerido_centavos as sugerido
    from v_stock_por_lote s
    join v_costo_lote_vigente c on c.lote_id = s.lote_id and c.producto_id = s.producto_id
    join lotes_produccion l on l.id = s.lote_id
    where s.producto_id = p_producto_id
      and s.quedan > 0
      and c.tiene_costos
      and c.costo_ananja_centavos > 0
      and (p_lote_id is null or s.lote_id = p_lote_id)
    order by l.fecha, l.created_at, l.id
  loop
    exit when v_resto <= 0;

    v_tomar := least(v_lote.quedan, v_resto);

    -- Misma forma que `registrar_entrega_revendedor` (tipo 'entrega'): el
    -- trigger entrega_items_foto_costo_lote congela costo_lote_unitario y
    -- costo_produccion_unitario.
    insert into entrega_items (
      entrega_id, producto_id, cantidad, lote_id,
      costo_ananja_unitario_centavos, precio_sugerido_centavos
    ) values (
      v_entrega_id, p_producto_id, v_tomar, v_lote.lote_id,
      v_lote.costo,
      case when v_lote.sugerido > 0 then v_lote.sugerido end
    );

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
    values (p_producto_id, 'egreso', v_tomar, v_admin_id, v_entrega_id, v_lote.lote_id, null, 'venta');

    v_resto := v_resto - v_tomar;
  end loop;

  -- No debería pasar (se validó arriba con la misma consulta y bajo el lock).
  if v_resto > 0 then
    select nombre into v_nombre from productos where id = p_producto_id;
    raise exception 'DEPOSITO_INSUFICIENTE'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', p_producto_id,
        'disponible', p_cantidad - v_resto
      )::text;
  end if;

  -- Red de seguridad: el stock global del producto no puede quedar negativo
  -- (por ejemplo si en el medio una entrega manual sacó del mismo producto
  -- sin pasar por el lock de arriba). Mismo chequeo que
  -- `registrar_entrega_revendedor`.
  select s.stock into v_stock from v_stock_actual s where s.producto_id = p_producto_id;
  if coalesce(v_stock, 0) < 0 then
    select nombre into v_nombre from productos where id = p_producto_id;
    raise exception 'DEPOSITO_INSUFICIENTE'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', p_producto_id,
        'disponible', greatest(coalesce(v_stock, 0) + p_cantidad, 0)
      )::text;
  end if;

  return v_entrega_id;
end;
$$;

revoke execute on function public.tomar_del_deposito(uuid, uuid, int, date, uuid, uuid, text) from anon, authenticated, public;

-- ============================================================
-- 5) insertar_venta_revendedor — misma firma; agrega "agarra directo"
-- ============================================================

-- Respecto de 0062: dos variables nuevas y UN bloque nuevo (marcado abajo),
-- después de resolver el reintento idempotente y antes de validar el stock.
-- Todo lo demás es idéntico.
create or replace function public.insertar_venta_revendedor(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text,
  p_registrada_por uuid,
  p_grupo_id uuid,
  p_lote_id uuid default null
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_dueño_grupo uuid;
  v_vendedor_id uuid := p_vendedor_id;
  v_precio_manual_centavos bigint;
  v_costo_centavos bigint;
  v_en_poder int;
  v_en_lote int;
  v_nombre text;
  v_grupo_id uuid := gen_random_uuid();
  v_venta_id uuid;
  v_ids uuid[] := '{}';
  v_resto int;
  v_tomar int;
  v_tramo record;
  v_toma_directo boolean;
  v_faltante int;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Opcional acá (una venta cargada por un admin puede no tenerlo); si
  -- viene, tiene que ser > 0. registrar_venta_revendedor lo exige antes.
  if p_precio_venta_centavos is not null and p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  perform 1 from vendedores where id = v_vendedor_id for no key update;

  if p_grupo_id is not null then
    select vendedor_id into v_dueño_grupo from ventas_revendedor where grupo_id = p_grupo_id limit 1;
    if v_dueño_grupo is not null then
      if v_dueño_grupo <> v_vendedor_id then
        raise exception 'GRUPO_INVALIDO';
      end if;
      select array_agg(id order by created_at, id) into v_ids
      from ventas_revendedor where grupo_id = p_grupo_id;
      return json_build_object('id', v_ids[1], 'grupo_id', p_grupo_id, 'ids', v_ids, 'ya_existia', true);
    end if;
    v_grupo_id := p_grupo_id;
  end if;

  -- ── NUEVO: "agarra directo del depósito" ────────────────────────────────
  -- Si la persona tiene el interruptor y no le alcanza lo que tiene en poder
  -- (en total, o del lote elegido), lo que falta se saca del depósito ahora:
  -- se crea una entrega automática atada a esta venta (`v_grupo_id`) y las
  -- validaciones y el reparto de más abajo corren sobre el stock ya
  -- completado. Sin el flag este bloque no hace nada.
  select v.toma_directo into v_toma_directo from vendedores v where v.id = v_vendedor_id;

  if coalesce(v_toma_directo, false) then
    if p_lote_id is null then
      select coalesce(en_poder, 0) into v_en_poder
      from v_stock_revendedor where vendedor_id = v_vendedor_id and producto_id = p_producto_id;
      v_faltante := p_cantidad - coalesce(v_en_poder, 0);
    else
      select coalesce(sum(s.quedan), 0) into v_en_lote
      from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
      where s.lote_id = p_lote_id;
      v_faltante := p_cantidad - v_en_lote;
    end if;

    if v_faltante > 0 then
      perform public.tomar_del_deposito(
        v_vendedor_id, p_producto_id, v_faltante, p_fecha, p_lote_id, v_grupo_id, null
      );
    end if;
  end if;
  -- ── fin de lo nuevo ─────────────────────────────────────────────────────

  select en_poder into v_en_poder
  from v_stock_revendedor where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  if coalesce(v_en_poder, 0) < p_cantidad then
    select nombre into v_nombre from productos where id = p_producto_id;
    raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', p_producto_id,
        'disponible', coalesce(v_en_poder, 0)
      )::text;
  end if;

  -- Si se eligió lote, ese lote puntual tiene que alcanzar por sí solo —
  -- no cae a los demás lotes aunque el total de arriba sobre. Chequeo
  -- aparte (antes de repartir) para no dejar filas parciales insertadas: el
  -- loop de abajo, filtrado al mismo lote, es la garantía real (misma fila
  -- bloqueada con `for no key update`, no hay carrera en el medio).
  if p_lote_id is not null then
    select coalesce(sum(s.quedan), 0) into v_en_lote
    from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
    where s.lote_id = p_lote_id;

    if v_en_lote < p_cantidad then
      select nombre into v_nombre from productos where id = p_producto_id;
      raise exception 'STOCK_INSUFICIENTE_LOTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'lote_id', p_lote_id,
          'disponible', v_en_lote
        )::text;
    end if;
  end if;

  select precio_centavos into v_precio_manual_centavos
  from revendedor_precios where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  v_resto := p_cantidad;

  for v_tramo in
    select s.entrega_item_id, s.lote_id, s.quedan, s.costo_ananja_unitario_centavos, s.fecha
    from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
    where s.quedan > 0
      and (p_lote_id is null or s.lote_id = p_lote_id)
    order by s.orden
  loop
    exit when v_resto <= 0;

    if v_tramo.fecha > p_fecha then
      select nombre into v_nombre from productos where id = p_producto_id;
      raise exception 'FECHA_ANTERIOR_A_ENTREGA'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'entrega_fecha', v_tramo.fecha
        )::text;
    end if;

    v_tomar := least(v_tramo.quedan, v_resto);
    v_costo_centavos := coalesce(v_tramo.costo_ananja_unitario_centavos, v_precio_manual_centavos);

    if v_costo_centavos is null then
      raise exception 'PRECIO_NO_ASIGNADO';
    end if;

    insert into ventas_revendedor (
      vendedor_id, producto_id, cantidad, precio_venta_centavos, precio_costo_centavos,
      medio_pago, fecha, nota, entrega_item_id, lote_id, grupo_id, registrada_por
    ) values (
      v_vendedor_id, p_producto_id, v_tomar, p_precio_venta_centavos, v_costo_centavos,
      p_medio_pago, p_fecha, p_nota, v_tramo.entrega_item_id,
      v_tramo.lote_id, v_grupo_id, p_registrada_por
    ) returning id into v_venta_id;

    v_ids := array_append(v_ids, v_venta_id);
    v_resto := v_resto - v_tomar;
  end loop;

  -- No debería pasar: ya se validó arriba (total y, si corresponde, el
  -- lote elegido). Red de seguridad por si los datos quedaron
  -- inconsistentes (ej. una devolución forzada con "Guardar igual").
  if v_resto > 0 then
    select nombre into v_nombre from productos where id = p_producto_id;
    if p_lote_id is not null then
      raise exception 'STOCK_INSUFICIENTE_LOTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'lote_id', p_lote_id,
          'disponible', p_cantidad - v_resto
        )::text;
    else
      raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'disponible', p_cantidad - v_resto
        )::text;
    end if;
  end if;

  return json_build_object('id', v_ids[1], 'grupo_id', v_grupo_id, 'ids', v_ids);
end;
$$;

revoke execute on function public.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid, uuid) from anon, authenticated, public;

-- ============================================================
-- 6) eliminar_venta_revendedor — misma firma; deshace la toma y la rendición
-- ============================================================

create or replace function public.eliminar_venta_revendedor(
  p_venta_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_dueño_id uuid;
  v_grupo_id uuid;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_auto record;
  v_dev_id uuid;
  v_ya int;
  v_en_lote int;
  v_devolver int;
  v_rend public.rendiciones%rowtype;
  v_total numeric;
  v_pendiente numeric;
begin
  v_vendedor_id := public.mi_vendedor_id();
  if v_vendedor_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  select vendedor_id, grupo_id into v_dueño_id, v_grupo_id
  from ventas_revendedor where id = p_venta_id;
  if v_dueño_id is null then
    raise exception 'VENTA_NO_ENCONTRADA';
  end if;

  if not public.es_admin() then
    if v_dueño_id <> v_vendedor_id then
      raise exception 'NO_AUTORIZADO';
    end if;

    if exists (
      select 1 from ventas_revendedor
      where grupo_id = v_grupo_id and registrada_por is not null and registrada_por <> v_vendedor_id
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  delete from ventas_revendedor where grupo_id = v_grupo_id and vendedor_id = v_dueño_id;

  -- ── NUEVO (a): compensar las entregas automáticas de esta venta ─────────
  -- Una devolución automática por cada (producto, lote) que la toma directa
  -- sacó del depósito, por lo que SIGUE en poder de la persona (si en el
  -- medio vendió o devolvió otras botellas de ese lote, solo se devuelve el
  -- remanente) y sin repetir lo ya compensado. Nada se borra: la entrega
  -- original y sus movimientos quedan, y el ingreso de la devolución vuelve
  -- a subir el stock del depósito y del lote (v_stock_por_lote lo netea por
  -- `entrega_id` + `lote_id`).
  v_dev_id := null;

  for v_auto in
    select ei.producto_id, ei.lote_id, sum(ei.cantidad)::int as total
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    where e.vendedor_id = v_dueño_id
      and e.tipo = 'entrega'
      and e.automatica
      and e.venta_grupo_id = v_grupo_id
    group by ei.producto_id, ei.lote_id
    order by ei.producto_id, ei.lote_id
  loop
    select coalesce(sum(ei2.cantidad), 0)::int into v_ya
    from entregas_revendedor d
    join entrega_items ei2 on ei2.entrega_id = d.id
    where d.vendedor_id = v_dueño_id
      and d.tipo = 'devolucion'
      and d.automatica
      and d.venta_grupo_id = v_grupo_id
      and ei2.producto_id = v_auto.producto_id
      and ei2.lote_id is not distinct from v_auto.lote_id;

    select coalesce(sum(s.quedan), 0)::int into v_en_lote
    from public.stock_revendedor_por_entrega(v_dueño_id, v_auto.producto_id) s
    where s.lote_id is not distinct from v_auto.lote_id;

    v_devolver := least(v_auto.total - v_ya, v_en_lote);

    if v_devolver > 0 then
      if v_dev_id is null then
        insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, automatica, venta_grupo_id)
        values (v_dueño_id, 'devolucion', v_hoy, null, v_vendedor_id, true, v_grupo_id)
        returning id into v_dev_id;
      end if;

      insert into entrega_items (entrega_id, producto_id, cantidad, lote_id)
      values (v_dev_id, v_auto.producto_id, v_devolver, v_auto.lote_id);

      insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
      values (v_auto.producto_id, 'ingreso', v_devolver, v_vendedor_id, v_dev_id, v_auto.lote_id, null, null);
    end if;
  end loop;

  -- ── NUEVO (b): deshacer la rendición de una venta de coordinadora ───────
  select * into v_rend
  from rendiciones
  where venta_grupo_id = v_grupo_id and vendedor_id = v_dueño_id
  order by created_at, id
  limit 1
  for update;

  if found then
    insert into rendiciones_borradas (
      rendicion_id, vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id,
      created_at, via, tenedor_id, encargado_diferencia_id, venta_grupo_id, borrada_por
    ) values (
      v_rend.id, v_rend.vendedor_id, v_rend.monto_centavos, v_rend.medio_pago, v_rend.fecha,
      v_rend.nota, v_rend.admin_id, v_rend.created_at, v_rend.via, v_rend.tenedor_id,
      v_rend.encargado_diferencia_id, v_rend.venta_grupo_id, v_vendedor_id
    );

    delete from rendiciones where id = v_rend.id;

    -- Con la rendición ya fuera, lo que la coordinadora tiene en mano no
    -- puede quedar negativo (si ya depositó esa plata) ni por debajo de un
    -- aviso de depósito pendiente (si la avisó y todavía no la confirmaron).
    -- La excepción deshace TODO lo de esta función.
    select pm.total_centavos into v_total
    from v_plata_en_manos pm
    where pm.tenedor_id = v_rend.tenedor_id;

    if not found then
      raise exception 'NO_AUTORIZADO';
    end if;

    if v_total < 0 then
      raise exception 'YA_PASO_LA_PLATA'
        using detail = json_build_object(
          'en_mano_centavos', v_total,
          'monto_centavos', v_rend.monto_centavos
        )::text;
    end if;

    select coalesce(sum(di.monto_centavos), 0) into v_pendiente
    from depositos_informados di
    where di.tenedor_id = v_rend.tenedor_id and di.estado = 'pendiente';

    if v_pendiente > v_total then
      raise exception 'YA_PASO_LA_PLATA'
        using detail = json_build_object(
          'en_mano_centavos', v_total,
          'pendiente_centavos', v_pendiente,
          'monto_centavos', v_rend.monto_centavos
        )::text;
    end if;
  end if;

  return json_build_object('id', p_venta_id, 'grupo_id', v_grupo_id);
end;
$$;

revoke execute on function public.eliminar_venta_revendedor(uuid) from anon, public;
grant execute on function public.eliminar_venta_revendedor(uuid) to authenticated;

-- ============================================================
-- 7) registrar_venta_coordinador — "la coordinadora vendió N botellas"
-- ============================================================

create function public.registrar_venta_coordinador(
  p_coordinador_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_lote_id uuid,
  p_fecha date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_grupo_id uuid := gen_random_uuid();
  v_entrega_id uuid;
  v_costo bigint;
  v_monto bigint;
  v_rendicion_id uuid;
begin
  v_yo := public.mi_vendedor_id();

  -- Un admin carga para cualquier coordinadora; una coordinadora, solo para sí.
  if not (
    public.es_admin()
    or (public.es_coordinador() and p_coordinador_id is not null and p_coordinador_id = v_yo)
  ) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (
    select 1 from vendedores where id = p_coordinador_id and activo and rol = 'coordinador'
  ) then
    raise exception 'COORDINADOR_INVALIDO';
  end if;

  -- Una carga = un lote: así el precio (= costo Ananja) es uno solo y el
  -- margen de vendedor queda en 0.
  if p_lote_id is null then
    raise exception 'LOTE_INVALIDO';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  perform 1 from vendedores where id = p_coordinador_id for no key update;

  -- (a) Baja del depósito al costo Ananja vigente del lote.
  v_entrega_id := public.tomar_del_deposito(
    p_coordinador_id, p_producto_id, p_cantidad, p_fecha, p_lote_id, v_grupo_id, null
  );

  select ei.costo_ananja_unitario_centavos into v_costo
  from entrega_items ei
  where ei.entrega_id = v_entrega_id and ei.producto_id = p_producto_id and ei.lote_id = p_lote_id;

  -- (b) La venta, a precio = costo (margen de vendedor 0).
  perform public.insertar_venta_revendedor(
    p_coordinador_id, p_producto_id, p_cantidad, v_costo,
    'efectivo', p_fecha, p_nota, v_yo, v_grupo_id, p_lote_id
  );

  select coalesce(sum(vr.cantidad::bigint * vr.precio_costo_centavos), 0) into v_monto
  from ventas_revendedor vr
  where vr.grupo_id = v_grupo_id;

  -- (c) Lo que ella tiene que pasar a Ananja: una rendición de ella hacia
  -- ella (tiene la plata en mano; se la "rinde" a sí misma).
  insert into rendiciones (
    vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id, venta_grupo_id
  ) values (
    p_coordinador_id, v_monto, 'efectivo', p_fecha, p_nota, v_yo, 'encargado', p_coordinador_id, v_grupo_id
  )
  returning id into v_rendicion_id;

  return json_build_object(
    'grupo_id', v_grupo_id,
    'entrega_id', v_entrega_id,
    'rendicion_id', v_rendicion_id,
    'monto_centavos', v_monto
  );
end;
$$;

revoke execute on function public.registrar_venta_coordinador(uuid, uuid, int, uuid, date, text) from anon, public;
grant execute on function public.registrar_venta_coordinador(uuid, uuid, int, uuid, date, text) to authenticated;

-- ============================================================
-- Verificación post-aplicación (SOLO LECTURA — correr en el SQL Editor):
--
--   -- a) columnas nuevas
--   select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and (table_name, column_name) in (
--       ('vendedores', 'toma_directo'),
--       ('entregas_revendedor', 'automatica'),
--       ('entregas_revendedor', 'venta_grupo_id'),
--       ('rendiciones', 'venta_grupo_id'))
--   order by table_name, column_name;
--   -- esperado: 4 filas. toma_directo boolean NO default false; automatica
--   --   boolean NO default false; las dos venta_grupo_id uuid YES sin default
--
--   -- b) authenticated NO puede actualizar toma_directo (solo `nombre`)
--   select column_name
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'vendedores'
--     and grantee = 'authenticated' and privilege_type = 'UPDATE';
--   -- esperado: una sola fila (nombre); toma_directo NO figura
--
--   -- c) índices parciales
--   select indexname, indexdef from pg_indexes
--   where schemaname = 'public'
--     and indexname in ('idx_entregas_revendedor_venta_grupo_id', 'idx_rendiciones_venta_grupo_id');
--   -- esperado: 2 filas, ambas con "WHERE (venta_grupo_id IS NOT NULL)"
--
--   -- d) rendiciones_borradas: columnas, RLS y policy
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'rendiciones_borradas'
--   order by ordinal_position;
--   -- esperado, en orden: id, rendicion_id, vendedor_id, monto_centavos,
--   --   medio_pago, fecha, nota, admin_id, created_at, via, tenedor_id,
--   --   encargado_diferencia_id, venta_grupo_id, borrada_por, borrada_at
--   --   (15 filas; NOT NULL en id, rendicion_id, vendedor_id, monto_centavos,
--   --   medio_pago, fecha, admin_id, created_at, via, borrada_at)
--   select c.relrowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname = 'rendiciones_borradas';
--   -- esperado: true
--   select policyname, cmd, roles, qual
--   from pg_policies
--   where schemaname = 'public' and tablename = 'rendiciones_borradas';
--   -- esperado: 1 fila, rendiciones_borradas_select, SELECT, {authenticated},
--   --   qual = es_admin()
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'rendiciones_borradas'
--     and grantee in ('anon', 'authenticated', 'public')
--   order by grantee, privilege_type;
--   -- esperado: una sola fila (authenticated, SELECT)
--
--   -- e) UNA sola firma por función, security definer y search_path
--   select p.proname, p.oid::regprocedure as firma, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'fijar_toma_directo', 'tomar_del_deposito', 'insertar_venta_revendedor',
--       'eliminar_venta_revendedor', 'registrar_venta_coordinador')
--   order by p.proname;
--   -- esperado: exactamente 5 filas (una por nombre), todas con
--   --   proconfig = {search_path=public}; prosecdef = true en
--   --   fijar_toma_directo, eliminar_venta_revendedor y
--   --   registrar_venta_coordinador; false en tomar_del_deposito e
--   --   insertar_venta_revendedor
--
--   -- f) ACL: internas sin authenticated/anon/public; públicas sin anon/public
--   select p.proname, p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'fijar_toma_directo', 'tomar_del_deposito', 'insertar_venta_revendedor',
--       'eliminar_venta_revendedor', 'registrar_venta_coordinador')
--   order by p.proname;
--   -- esperado: tomar_del_deposito e insertar_venta_revendedor SIN entradas
--   --   "=X/..." (public), "anon=X/..." ni "authenticated=X/..." (solo
--   --   postgres y service_role); las otras tres con "authenticated=X/..." y
--   --   sin "=X/..." ni "anon=X/..."
--
--   -- g) nada raro quedó cargado: ningún flag prendido ni entrega automática
--   select
--     (select count(*) from public.vendedores where toma_directo) as con_flag,
--     (select count(*) from public.entregas_revendedor where automatica) as entregas_automaticas,
--     (select count(*) from public.rendiciones where venta_grupo_id is not null) as rendiciones_enlazadas;
--   -- esperado justo después de aplicar: 0, 0, 0
-- ============================================================
