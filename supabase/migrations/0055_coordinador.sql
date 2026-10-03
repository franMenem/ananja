-- Ananja: rol "coordinador" — pedido de Fran (dueño), decisiones cerradas
-- 2026-09-17. Parte B de la tanda (ver plan-coordinador-redondeo.md; la
-- numeración cambió porque A ya entró a main como 0054
-- costo_ananja_redondeado y C ("sacar la diferencia de encargado") fue
-- solo UI, sin migración — esta es la primera migración de la tanda que
-- sigue a 0054).
--
-- Un coordinador es una persona que reparte botellas a un grupo de
-- revendedoras y les cobra por Ananja, pero NO es una revendedora (sin
-- stock propio, no vende) ni necesariamente un admin (Tere sigue siendo
-- `rol = 'admin'`, un coordinador NO-admin es una fila nueva con
-- `rol = 'coordinador'`). Reusa `vendedores.encargado_id` — ya modela
-- exactamente "a quién le rinde la plata esta revendedora" desde 0037 — en
-- vez de una tabla nueva; el renombre "encargado" → "coordinador" es solo
-- de UI (textos), ninguna columna ni función cambia de nombre.
--
-- Diseño (verificado contra prod, schema `public`,
-- 2026-09-17, con `pg_get_functiondef`/`pg_get_viewdef`/
-- `information_schema.columns`/`pg_policies` — no contra los .sql de
-- migraciones anteriores, que pueden no ser 100% lo que corre hoy: 0049 se
-- aplicó a mano):
--
--  1) `vendedores_rol_check` — el `check` de `vendedores.rol` (es `text`
--     con `check`, NO un enum real, confirmado) se reemplaza para admitir
--     `'coordinador'`.
--
--  2) `public.es_coordinador()` / `public.es_coordinador_de(uuid)` —
--     mismo patrón que `es_admin()`: `STABLE SECURITY DEFINER`, resuelven
--     `auth.uid()` adentro. `es_coordinador_de(p_vendedor_id)` es `true`
--     solo si el usuario logueado es un coordinador ACTIVO y
--     `p_vendedor_id` es una de SUS revendedoras (`encargado_id` apunta a
--     él) — la usan las policies de abajo y `registrar_entrega_revendedor`.
--
--  3) RLS ampliada (agrega `es_coordinador_de(...)`, todo lo demás igual)
--     en `vendedores_select`, `entregas_revendedor_select`,
--     `entrega_items_select`, `ventas_revendedor_select` y
--     `rendiciones_select` — lo mínimo que necesitan `v_deuda_vendedor` y
--     `v_stock_revendedor` (security_invoker, 0019: corren con los
--     permisos del que consulta) para que un coordinador vea SOLO sus
--     revendedoras. Nada de `comprobantes`, `gastos`, `lote_costos`,
--     `depositos_cuenta` ni ninguna vista de Producción/Plata/Ganancia se
--     toca: un coordinador sigue sin poder leerlas.
--
--  4) `v_deuda_vendedor` — `create or replace view` (mismas columnas):
--     agrega `es_coordinador_de(id)` a su WHERE, así un coordinador ve la
--     fila de deuda de cada una de sus revendedoras (mismo `saldo_centavos`
--     que ya usan `/revendedores/[id]` y `/mi` — "cuánto le debe a
--     Ananja").
--
--  5) `v_plata_en_manos` (0037) — `create or replace view` (mismas
--     columnas): pasa de `WHERE rol = 'admin' AND es_admin()` a
--     `WHERE rol IN ('admin', 'coordinador') AND es_admin()`. El gate de
--     quién puede CONSULTAR la vista sigue siendo `es_admin()` (un
--     coordinador no ve Plata, pedido de Fran) — el cambio es solo qué
--     FILAS aparecen, para que un admin pueda ver cuánta plata tiene en
--     mano un coordinador no-admin (antes esa fila no existía: la vista
--     solo mostraba tenedores con `rol = 'admin'`).
--
--  6) `registrar_deposito_cuenta` — `create or replace function` (misma
--     firma): `TENEDOR_INVALIDO` pasa de exigir `rol = 'admin'` a
--     `rol IN ('admin', 'coordinador')`. Sigue exigiendo `es_admin()` para
--     ejecutarla — quien pasa la plata a la Cuenta Ananja sigue siendo un
--     admin (Fran/Tere), nunca el coordinador (pedido de Fran: "no carga
--     ni ve nada de Plata"), el cambio es solo que el TENEDOR puede ser un
--     coordinador no-admin.
--
--  6b) `informar_pago_revendedor` — mismo BLOCKER que en (7): el
--     `destinatario_id` que resuelve el flujo de "informar pago" de
--     `/mi/pagar` exigía `rol = 'admin'`; se amplía a
--     `rol IN ('admin', 'coordinador')`.
--
--  6c/6d) `confirmar_pago_revendedor`/`rechazar_pago_revendedor` — SEGUNDA
--     vuelta (BLOCKER real de la revisión adversarial sobre la primera
--     versión de esta migración): ampliar el ROL del destinatario no
--     alcanza si la autorización sigue exigiendo "quien confirma/rechaza
--     ES el destinatario" — un coordinador NUNCA puede llamar a estas
--     funciones (siguen exigiendo `es_admin()`, a propósito), así que un
--     pago dirigido a un coordinador no-admin quedaba pendiente PARA
--     SIEMPRE (todo admin recibía `NO_AUTORIZADO`). Arreglo: la
--     restricción "solo ESE destinatario puede resolverlo" queda IGUAL
--     quando el destinatario es OTRO ADMIN activo (comportamiento
--     histórico, sin cambios — ej. un pago a Laura solo lo resuelve
--     Laura), pero NO aplica cuando el destinatario es un COORDINADOR
--     activo: ahí cualquier admin puede confirmar/rechazar en su nombre,
--     manteniendo `tenedor_id = destinatario_id` (nunca se colapsa al
--     admin que resuelve). `rechazar_pago_revendedor` no se había tocado
--     en la primera versión — quedó con `rol = 'admin'` a secas y un
--     comentario "mismo criterio que confirmar" que ya no era cierto; acá
--     se alinean las dos con el mismo criterio, de verdad.
--
--  7) `registrar_rendicion` — `create or replace function` (misma firma):
--     la resolución de `tenedor_id` para `via = 'encargado'` exigía
--     `enc.rol = 'admin'`; pasa a `enc.rol IN ('admin', 'coordinador')`.
--     BLOCKER evitado: sin este cambio, la plata que una revendedora le
--     rinde a un coordinador NO-admin quedaría atribuida al admin que
--     carga la rendición (`coalesce(v_encargado_id, v_admin_id)` caía
--     siempre a `v_admin_id` porque `v_encargado_id` nunca resolvía) en vez
--     de al coordinador — exactamente la plata "desaparecida" que la
--     revisión adversarial de 0037 ya había encontrado una vez con
--     `via='encargado'` (ver memoria "Plata: rediseño").
--
--  8) `asignar_encargado_revendedor` — `create or replace function` (misma
--     firma): `ENCARGADO_INVALIDO` exigía `enc.rol = 'admin'`; pasa a
--     `enc.rol IN ('admin', 'coordinador')` — así se puede asignar un
--     coordinador como "a quién le rinde" desde la ficha de la revendedora
--     (mismo selector que ya existe, `EncargadoRevendedor`, renombrado en
--     UI).
--
--  9) `asignar_rol_revendedor` — `create or replace function` (misma
--     firma): agrega la transición `pendiente -> coordinador` (alta desde
--     "Sumar persona"). No agrega otras transiciones (`revendedor ->
--     coordinador`, `coordinador -> admin`, etc.) — fuera del pedido de
--     Fran, y cualquier combo revendedora+coordinadora queda para una
--     migración aparte si hace falta (ver open question 5 del plan,
--     Fran no la confirmó).
--
-- 10) `registrar_entrega_revendedor` — `create or replace function` (misma
--     firma): un coordinador (no-admin) puede llamarla, pero SOLO con
--     `p_tipo = 'entrega'` (nunca devolución) y SOLO para
--     `es_coordinador_de(p_vendedor_id)`; `p_permitir_negativo` se fuerza a
--     `false` para un coordinador. Un coordinador NUNCA manda
--     `costo_ananja_unitario_centavos` a mano — se congela siempre desde
--     `v_costo_lote_vigente.costo_ananja_centavos` del lote (ya redondeado
--     por 0054 si Fran cargó un redondeo); si ese lote no tiene costos
--     completos, `COSTO_FALTANTE`.
--     SEGUNDA vuelta (decisión de Fran): si un pedido no entra en UN solo
--     lote, hay que repartirlo entre varios (30 de uno + 20 de otro), NO
--     quedarse en "el que más alcance y listo" como hacía la primera
--     versión. En vez de reimplementar ese reparto acá adentro, se REUSA
--     `repartirCantidadEntreLotes` (`lib/lotes-split.ts`, la misma función
--     pura que ya arma el reparto de un admin en `SelectorLote`, testeada
--     en `tests/lotes-split.test.ts`): el CLIENTE del coordinador arma el
--     reparto y manda una fila por `(producto_id, lote_id)`, como
--     cualquier entrega con varios lotes — esta función ya sabía manejar
--     eso, no hace falta nada especial acá más que exigir que un ítem de
--     coordinador SIEMPRE traiga `lote_id` (nunca hay auto-selección
--     adentro de la función). Ver (11): de dónde saca el cliente el stock
--     por lote SIN ver costos.
--     Efecto colateral (mejora, no rotura): el mismo fallback
--     "sin costo explícito pero con lote_id, usar el vigente" queda
--     disponible para CUALQUIER caller (admin incluido) cuando omite
--     `costo_ananja_unitario_centavos` — hoy el formulario de admin
--     (`EntregaForm`) siempre lo manda (campo `required`), así que esto no
--     cambia ningún comportamiento actual, solo cierra un hueco latente.
--     El resto de la función (stock del depósito, `entrega_items`,
--     `movimientos_stock`, devolución) sigue exactamente igual.
--
-- 11) `lotes_disponibles_coordinador` — función NUEVA: stock por lote de un
--     producto (`lote_id`, `fecha`, `quedan`), SIN ningún costo, gateada a
--     `es_coordinador()` — lo que necesita el cliente del coordinador para
--     armar el reparto de (10) sin poder leer costos. Filtra lotes con
--     `tiene_costos = false` (nunca se los ofrece, evita el dead-end de
--     `COSTO_FALTANTE` en el caso común).
--
-- 12) SEGURIDAD (BLOCKER de la revisión adversarial, preexistente — no lo
--     causó esta rama, pero rompía la premisa del coordinador):
--     `v_costo_lote_vigente`/`v_costo_lote_desglose` no tenían
--     `security_invoker = true` (a diferencia de sus vistas hermanas) y
--     bypaseaban la RLS de `lote_items`/`lotes_produccion`/`lote_costos` —
--     cualquier usuario logueado podía leerlas por REST y ver costos,
--     márgenes y precios sugeridos reales. Se agrega
--     `alter view ... set (security_invoker = true)` a las dos —
--     verificado leyendo el código que ningún consumidor admin cambia de
--     comportamiento y que ninguna pantalla de revendedora/coordinador
--     depende de que bypaseen RLS (detalle en el bloque de la migración).
--
-- Fuera de esta migración (decisión explícita, no un olvido): pantallas
-- nuevas (`app/(mi)/mi/page.tsx` variante coordinador, "Sumar persona",
-- shell), `lib/types.ts` (se regenera aparte con
-- `generate_typescript_types` cuando esto se aplique), y una tabla/UI para
-- listar coordinadores en `/revendedores` (se gestionan hoy desde la ficha
-- de cada revendedora, igual que un encargado admin).
--
-- Migración sin templating (mismo criterio que 0049-0054): hardcodea
-- `public.` y `search_path = public` — Ananja es hoy el único negocio
-- activo (schema `miel` en pausa).

-- ============================================================
-- 1) vendedores.rol admite 'coordinador'
-- ============================================================

alter table vendedores drop constraint vendedores_rol_check;
alter table vendedores add constraint vendedores_rol_check
  check (rol = any (array['admin'::text, 'revendedor'::text, 'pendiente'::text, 'coordinador'::text]));

-- ============================================================
-- 2) Funciones de rol — mismo patrón que es_admin()/mi_vendedor_id().
-- ============================================================

create or replace function public.es_coordinador()
returns boolean
language sql stable security definer
set search_path = 'public'
as $$
  select exists (
    select 1 from vendedores where user_id = auth.uid() and activo and rol = 'coordinador'
  );
$$;

revoke all on function public.es_coordinador() from public;
grant execute on function public.es_coordinador() to authenticated;

create or replace function public.es_coordinador_de(p_vendedor_id uuid)
returns boolean
language sql stable security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from vendedores rv
    join vendedores yo on yo.id = rv.encargado_id
    where rv.id = p_vendedor_id
      and yo.user_id = auth.uid()
      and yo.activo
      and yo.rol = 'coordinador'
  );
$$;

revoke all on function public.es_coordinador_de(uuid) from public;
grant execute on function public.es_coordinador_de(uuid) to authenticated;

-- ============================================================
-- 3) RLS ampliada — agrega "es coordinador de esta fila", el resto de cada
--    policy queda igual.
-- ============================================================

alter policy vendedores_select on vendedores
  using (user_id = auth.uid() or es_vendedor() or public.es_coordinador_de(id));

alter policy entregas_revendedor_select on entregas_revendedor
  using (es_admin() or vendedor_id = mi_vendedor_id() or public.es_coordinador_de(vendedor_id));

alter policy entrega_items_select on entrega_items
  using (
    exists (
      select 1 from entregas_revendedor e
      where e.id = entrega_items.entrega_id
        and (es_admin() or e.vendedor_id = mi_vendedor_id() or public.es_coordinador_de(e.vendedor_id))
    )
  );

alter policy ventas_revendedor_select on ventas_revendedor
  using (es_admin() or vendedor_id = mi_vendedor_id() or public.es_coordinador_de(vendedor_id));

alter policy rendiciones_select on rendiciones
  using (es_admin() or vendedor_id = mi_vendedor_id() or public.es_coordinador_de(vendedor_id));

-- ============================================================
-- 4) v_deuda_vendedor — create or replace view, mismas columnas, agrega
--    es_coordinador_de(id) al WHERE.
-- ============================================================

create or replace view public.v_deuda_vendedor as
select
  id as vendedor_id,
  nombre,
  coalesce(
    (select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr where vr.vendedor_id = v.id),
    0::numeric
  ) as costo_vendido_centavos,
  coalesce(
    (select sum(r.monto_centavos) from rendiciones r where r.vendedor_id = v.id),
    0::numeric
  ) as entregado_centavos,
  coalesce(
    (select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr where vr.vendedor_id = v.id),
    0::numeric
  ) - coalesce(
    (select sum(r.monto_centavos) from rendiciones r where r.vendedor_id = v.id),
    0::numeric
  ) as saldo_centavos
from vendedores v
where (rol = 'revendedor'::text or (rol = 'admin'::text and revende))
  and (es_admin() or id = mi_vendedor_id() or public.es_coordinador_de(id));

-- ============================================================
-- 5) v_plata_en_manos (0037) — create or replace view, mismas columnas,
--    amplía qué FILAS aparecen (rol admin o coordinador); el gate de quién
--    puede consultarla sigue siendo es_admin().
-- ============================================================

create or replace view public.v_plata_en_manos as
select
  id as tenedor_id,
  nombre,
  coalesce((select sum(cp.cobrado_centavos) from comprobantes cp where cp.vendedor_id = v.id and cp.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(co.monto_centavos) from cobros co where co.vendedor_id = v.id and co.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as ventas_cobros_centavos,
  coalesce((select sum(r.monto_centavos) from rendiciones r where r.tenedor_id = v.id and r.via = 'encargado'::text), 0::numeric)
    as rendiciones_centavos,
  coalesce((select sum(g.monto_centavos) from gastos g where g.vendedor_id = v.id and g.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as gastos_centavos,
  coalesce((select sum(pd.monto_caja_centavos) from pagos_deuda pd where pd.vendedor_id = v.id and pd.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as pagos_deuda_centavos,
  coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.vendedor_id = v.id and a.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as ajustes_centavos,
  coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.destino = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.origen = 'efectivo'::medio_pago), 0::numeric)
    as transferencias_centavos,
  coalesce((select sum(dc.monto_centavos) from depositos_cuenta dc where dc.tenedor_id = v.id), 0::numeric)
    as depositos_centavos,
  coalesce((select sum(cp.cobrado_centavos) from comprobantes cp where cp.vendedor_id = v.id and cp.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(co.monto_centavos) from cobros co where co.vendedor_id = v.id and co.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(r.monto_centavos) from rendiciones r where r.tenedor_id = v.id and r.via = 'encargado'::text), 0::numeric)
    - coalesce((select sum(g.monto_centavos) from gastos g where g.vendedor_id = v.id and g.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(pd.monto_caja_centavos) from pagos_deuda pd where pd.vendedor_id = v.id and pd.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.vendedor_id = v.id and a.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.destino = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.origen = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(dc.monto_centavos) from depositos_cuenta dc where dc.tenedor_id = v.id), 0::numeric)
    as total_centavos
from vendedores v
where rol in ('admin', 'coordinador') and es_admin();

-- ============================================================
-- 6) registrar_deposito_cuenta — create or replace (misma firma): tenedor
--    puede ser admin o coordinador; sigue exigiendo es_admin() para
--    ejecutarla.
-- ============================================================

create or replace function public.registrar_deposito_cuenta(
  p_tenedor_id uuid,
  p_medio_pago medio_pago,
  p_monto_centavos bigint,
  p_fecha date,
  p_nota text default null::text,
  p_permitir_negativo boolean default false
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_deposito_id uuid;
  v_en_mano bigint;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if not exists (select 1 from vendedores where id = p_tenedor_id and rol in ('admin', 'coordinador') and activo) then
    raise exception 'TENEDOR_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  select total_centavos into v_en_mano from v_plata_en_manos where tenedor_id = p_tenedor_id;

  if coalesce(v_en_mano, 0) - p_monto_centavos < 0 and not p_permitir_negativo then
    raise exception 'SALDO_INSUFICIENTE'
      using detail = json_build_object('disponible', coalesce(v_en_mano, 0))::text;
  end if;

  insert into depositos_cuenta (tenedor_id, medio_pago, monto_centavos, fecha, nota)
  values (p_tenedor_id, p_medio_pago, p_monto_centavos, coalesce(p_fecha, current_date), p_nota)
  returning id into v_deposito_id;

  return json_build_object('id', v_deposito_id);
end;
$$;

-- ============================================================
-- 6b) informar_pago_revendedor — create or replace (misma firma): el
--     `destinatario_id` que resuelve cuando una revendedora informa un
--     pago desde `/mi/pagar` puede ser admin o coordinador. BLOCKER
--     evitado (mismo patrón que 7 y 6c): sin este cambio, una revendedora
--     con coordinador NO-admin nunca podría informar un pago en efectivo
--     (`MEDIO_INVALIDO`, `v_destinatario_id` quedaba siempre null) y
--     cualquier otro medio quedaría mal marcado como "directo a la
--     cuenta" en vez de "a mi coordinador".
-- ============================================================

create or replace function public.informar_pago_revendedor(
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_imagen_path text default null::text,
  p_nota text default null::text
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_vendedor_id uuid;
  v_nombre text;
  v_encargado_id uuid;
  v_destinatario_id uuid;
  v_imagen text;
  v_pago_id uuid;
begin
  if not public.puede_revender() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_vendedor_id := public.mi_vendedor_id();

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  select nombre, encargado_id into v_nombre, v_encargado_id
  from vendedores where id = v_vendedor_id;

  select id into v_destinatario_id
  from vendedores where id = v_encargado_id and rol in ('admin', 'coordinador') and activo;

  if v_destinatario_id is null and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  v_imagen := nullif(btrim(p_imagen_path), '');

  if v_imagen is null and p_medio_pago <> 'efectivo' then
    raise exception 'COMPROBANTE_REQUERIDO';
  end if;

  if v_imagen is not null
    and left(v_imagen, length('revendedores/' || v_vendedor_id::text || '/'))
      <> 'revendedores/' || v_vendedor_id::text || '/'
  then
    raise exception 'COMPROBANTE_INVALIDO';
  end if;

  insert into pagos_revendedor (
    vendedor_id, destinatario_id, monto_centavos, medio_pago, fecha, imagen_path, nota
  ) values (
    v_vendedor_id, v_destinatario_id, p_monto_centavos, p_medio_pago, p_fecha, v_imagen,
    nullif(btrim(p_nota), '')
  ) returning id into v_pago_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id, destinatario_id)
  values (
    'pago_revendedor',
    'Pago de ' || v_nombre,
    'Revisalo en Tareas para confirmarlo.',
    v_pago_id,
    v_destinatario_id
  );

  return json_build_object('id', v_pago_id, 'destinatario_id', v_destinatario_id);
end;
$$;

-- ============================================================
-- 6c) confirmar_pago_revendedor — create or replace (misma firma).
--     BLOCKER de la revisión adversarial (corregido acá): la versión
--     anterior de esta migración ampliaba QUIÉN puede ser destinatario
--     (admin o coordinador) pero seguía exigiendo que quien confirma SEA
--     ese destinatario — y un coordinador nunca puede llamar a esta
--     función (sigue exigiendo `es_admin()`, a propósito: confirmar sigue
--     siendo una acción de admin). Con destinatario coordinador, NINGÚN
--     admin pasaba el chequeo (`destinatario_id <> v_admin_id` para
--     cualquier admin que no fuera ese coordinador, que nunca puede serlo)
--     y el pago quedaba pendiente para siempre.
--     Arreglo: se separa "el destinatario es OTRO ADMIN activo" (mantiene
--     la restricción histórica: ese pago lo confirma ESE admin, o quien
--     pagó) de "el destinatario es un COORDINADOR activo" (nuevo: como el
--     coordinador nunca puede confirmar nada él mismo, CUALQUIER admin
--     puede hacerlo en su nombre) — `tenedor_id` sigue siendo
--     `destinatario_id` en los dos casos, nunca se colapsa al admin que
--     aprieta el botón (mismo cuidado que (7)/(6b), el bug de plata mal
--     atribuida de 0037).
-- ============================================================

create or replace function public.confirmar_pago_revendedor(p_pago_id uuid)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_destinatario_rol text;
  v_destinatario_activo_col boolean;
  v_destinatario_admin_activo boolean;
  v_destinatario_coordinador_activo boolean;
  v_tenedor_valido boolean;
  v_via text;
  v_tenedor_id uuid;
  v_rendicion_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  if v_pago.destinatario_id is not null then
    select rol, activo into v_destinatario_rol, v_destinatario_activo_col
    from vendedores where id = v_pago.destinatario_id;
  end if;
  v_destinatario_admin_activo := v_destinatario_activo_col is true and v_destinatario_rol = 'admin';
  v_destinatario_coordinador_activo := v_destinatario_activo_col is true and v_destinatario_rol = 'coordinador';
  v_tenedor_valido := v_destinatario_admin_activo or v_destinatario_coordinador_activo;

  -- Un admin puede confirmar SU PROPIO pago (decisión de Fran, 2026-09-15),
  -- aunque el destinatario informado sea otro admin (ej. un encargado tipo
  -- Laura): el chequeo de destinatario de abajo solo aplica a pagos
  -- ajenos, y SOLO restringe cuando el destinatario es OTRO ADMIN activo
  -- (comportamiento histórico, sin cambios). Un destinatario coordinador
  -- activo NUNCA bloquea: no hay "ese coordinador" que lo pueda confirmar
  -- él mismo, así que cualquier admin puede.
  if v_pago.vendedor_id <> v_admin_id then
    if v_destinatario_admin_activo and v_pago.destinatario_id <> v_admin_id then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  v_via := case when v_pago.destinatario_id is null then 'directo_cuenta' else 'encargado' end;

  if v_via <> 'encargado' and v_pago.medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  v_tenedor_id := case
    when v_via <> 'encargado' then null
    when v_tenedor_valido then v_pago.destinatario_id
    else v_admin_id
  end;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id)
  values (
    v_pago.vendedor_id, v_pago.monto_centavos, v_pago.medio_pago, v_pago.fecha,
    coalesce(v_pago.nota, 'Pago informado desde la app'), v_admin_id, v_via, v_tenedor_id
  )
  returning id into v_rendicion_id;

  update pagos_revendedor set
    estado = 'confirmado',
    rendicion_id = v_rendicion_id,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id, 'rendicion_id', v_rendicion_id, 'via', v_via, 'tenedor_id', v_tenedor_id);
end;
$$;

-- ============================================================
-- 6d) rechazar_pago_revendedor — create or replace (misma firma): mismo
--     BLOCKER y mismo arreglo que (6c) — la versión en prod (sin tocar
--     hasta esta migración) filtraba el destinatario-bloqueante con
--     `rol = 'admin'` únicamente, con un comentario que decía "mismo
--     criterio que confirmar_pago_revendedor" que dejó de ser cierto en
--     cuanto (6c) empezó a distinguir admin de coordinador. Se alinean
--     las dos: mismo criterio, ahora sí, con el mismo split
--     admin-activo/coordinador-activo.
-- ============================================================

create or replace function public.rechazar_pago_revendedor(p_pago_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_motivo text;
  v_destinatario_rol text;
  v_destinatario_activo_col boolean;
  v_destinatario_admin_activo boolean;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  v_motivo := nullif(btrim(p_motivo), '');
  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  if v_pago.destinatario_id is not null then
    select rol, activo into v_destinatario_rol, v_destinatario_activo_col
    from vendedores where id = v_pago.destinatario_id;
  end if;
  v_destinatario_admin_activo := v_destinatario_activo_col is true and v_destinatario_rol = 'admin';

  -- Mismo criterio que confirmar_pago_revendedor (6c): un admin puede
  -- rechazar SU PROPIO pago aunque el destinatario informado sea otro
  -- admin; el chequeo de destinatario solo bloquea cuando el destinatario
  -- es OTRO ADMIN activo (comportamiento histórico). Un destinatario
  -- coordinador activo nunca bloquea, por el mismo motivo que en (6c):
  -- el coordinador no puede rechazar nada él mismo.
  if v_pago.vendedor_id <> v_admin_id then
    if v_destinatario_admin_activo and v_pago.destinatario_id <> v_admin_id then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  update pagos_revendedor set
    estado = 'rechazado',
    motivo_rechazo = v_motivo,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id);
end;
$$;

-- ============================================================
-- 7) registrar_rendicion — create or replace (misma firma): el tenedor
--    resuelto por via='encargado' puede ser admin o coordinador. BLOCKER
--    evitado: sin esto, la plata rendida a un coordinador no-admin quedaba
--    atribuida al admin que carga la rendición.
-- ============================================================

create or replace function public.registrar_rendicion(
  p_vendedor_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null::text,
  p_via text default null::text
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin_id uuid;
  v_rendicion_id uuid;
  v_encargado_id uuid;
  v_tenedor_id uuid;
  v_via text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  -- Sin via explícito: se deriva del medio_pago, igual que se comportaba
  -- la base ANTES de 0037 (toda rendición acreditaba su medio_pago tal
  -- cual, sin distinción de via).
  v_via := coalesce(p_via, case when p_medio_pago = 'efectivo' then 'encargado' else 'directo_cuenta' end);

  if v_via not in ('encargado', 'directo_cuenta', 'cliente_directo') then
    raise exception 'VIA_INVALIDA';
  end if;

  if v_via <> 'encargado' and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if v_via = 'encargado' then
    select enc.id into v_encargado_id
    from vendedores yo
    join vendedores enc on enc.id = yo.encargado_id
    where yo.id = p_vendedor_id and enc.rol in ('admin', 'coordinador') and enc.activo;
    v_tenedor_id := coalesce(v_encargado_id, v_admin_id);
  else
    v_tenedor_id := null;
  end if;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id)
  values (p_vendedor_id, p_monto_centavos, p_medio_pago, coalesce(p_fecha, current_date), p_nota, v_admin_id, v_via, v_tenedor_id)
  returning id into v_rendicion_id;

  return json_build_object('id', v_rendicion_id, 'via', v_via, 'tenedor_id', v_tenedor_id);
end;
$$;

-- ============================================================
-- 8) asignar_encargado_revendedor — create or replace (misma firma): el
--    encargado (coordinador, en UI) puede ser admin o coordinador.
-- ============================================================

create or replace function public.asignar_encargado_revendedor(
  p_vendedor_id uuid,
  p_encargado_id uuid default null::uuid
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if p_encargado_id is not null then
    if p_encargado_id = p_vendedor_id then
      raise exception 'ENCARGADO_INVALIDO';
    end if;

    if not exists (
      select 1 from vendedores where id = p_encargado_id and rol in ('admin', 'coordinador') and activo
    ) then
      raise exception 'ENCARGADO_INVALIDO';
    end if;
  end if;

  update vendedores set encargado_id = p_encargado_id where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id, 'encargado_id', p_encargado_id);
end;
$$;

-- ============================================================
-- 8b) mi_encargado_revendedor — create or replace (misma firma): el
--     encargado que ve una revendedora en `/mi` ("Pagar a {encargado}")
--     puede ser admin o coordinador. Sin este cambio, una revendedora con
--     un coordinador NO-admin vería "sin encargado" en su propia pantalla
--     aunque `asignar_encargado_revendedor`/`registrar_rendicion` ya lo
--     reconocieran — mismo criterio que el resto de esta migración.
-- ============================================================

create or replace function public.mi_encargado_revendedor()
returns table(id uuid, nombre text)
language sql stable security definer
set search_path = 'public'
as $$
  select enc.id, enc.nombre
  from vendedores yo
  join vendedores enc on enc.id = yo.encargado_id
  where yo.id = public.mi_vendedor_id()
    and public.puede_revender()
    and enc.rol in ('admin', 'coordinador')
    and enc.activo;
$$;

-- ============================================================
-- 9) asignar_rol_revendedor — create or replace (misma firma): agrega la
--    transición pendiente -> coordinador (alta desde "Sumar persona").
-- ============================================================

create or replace function public.asignar_rol_revendedor(p_vendedor_id uuid, p_rol text)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_rol_actual text;
  v_admins_restantes int;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_rol not in ('admin', 'revendedor', 'coordinador') then
    raise exception 'ROL_INVALIDO';
  end if;

  select rol into v_rol_actual from vendedores where id = p_vendedor_id;
  if v_rol_actual is null then
    raise exception 'VENDEDOR_INVALIDO';
  end if;

  if v_rol_actual = 'admin' and p_rol = 'revendedor' then
    raise exception 'ADMIN_NO_REVENDEDOR';
  end if;

  if not (
    (v_rol_actual = 'pendiente' and p_rol in ('admin', 'revendedor', 'coordinador'))
    or (v_rol_actual = 'revendedor' and p_rol = 'admin')
  ) then
    raise exception 'TRANSICION_INVALIDA';
  end if;

  if p_rol = 'revendedor' then
    select count(*) into v_admins_restantes
    from vendedores
    where rol = 'admin' and activo and id <> p_vendedor_id;

    if v_admins_restantes < 1 then
      raise exception 'ULTIMO_ADMIN';
    end if;
  end if;

  update vendedores set rol = p_rol where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id, 'rol', p_rol);
end;
$$;

-- ============================================================
-- 10) registrar_entrega_revendedor — create or replace (misma firma): un
--     coordinador puede entregar SOLO a sus revendedoras, SOLO
--     p_tipo='entrega', sin permitir_negativo y sin fijar costo a mano —
--     el costo se congela siempre desde `v_costo_lote_vigente` (redondeado
--     incluido, 0054), nunca de lo que mande el cliente.
--     Reparto entre VARIOS lotes (decisión de Fran, corregida en esta
--     revisión: si un pedido no alcanza solo, hay que repartir — 30 de uno
--     y 20 de otro — igual que ya hace la carga de un admin, NO quedarse
--     en "el que más alcance y listo"). En vez de reimplementar ese
--     reparto en SQL, se REUSA la función pura que ya lo hace
--     (`repartirCantidadEntreLotes`, `lib/lotes-split.ts`, testeada en
--     `tests/lotes-split.test.ts` — el mismo criterio "más viejo primero"
--     que ya usa `SelectorLote` para un admin): el CLIENTE del coordinador
--     (`lib/coordinador.ts`) arma el reparto ahí mismo y manda una fila
--     por `(producto_id, lote_id)`, exactamente como ya manda `EntregaForm`
--     para un admin — esta función no necesita saber que es un reparto
--     automático, la trata como cualquier entrega con varios lotes por
--     producto. Para que el cliente del coordinador pueda armar ESE
--     reparto sin ver costos, el punto 11 agrega
--     `lotes_disponibles_coordinador` (stock por lote, sin costos). Acá
--     solo se agrega: un ítem de un coordinador SIEMPRE tiene que traer
--     `lote_id` (no hay auto-selección de lote adentro de esta función —
--     ya lo resolvió el cliente); el resto de las validaciones de
--     lote/stock (`LOTE_INVALIDO`, `STOCK_LOTE_INSUFICIENTE`) son las
--     mismas de siempre, se aplican igual a cualquier caller.
--     El resto de la función (admin, devolución, stock del depósito) sigue
--     igual; el fallback "sin costo explícito con lote_id, usar el
--     vigente" queda disponible para cualquier caller pero no cambia el
--     comportamiento actual del admin (su formulario siempre manda el
--     costo).
-- ============================================================

create or replace function public.registrar_entrega_revendedor(
  p_vendedor_id uuid,
  p_tipo text,
  p_fecha date,
  p_nota text default null::text,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin_id uuid;
  v_entrega_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_lote_id uuid;
  v_costo bigint;
  v_sugerido bigint;
  v_quedan int;
  v_stock int;
  v_nombre text;
  v_en_poder int;
  v_tipo_movimiento tipo_movimiento;
  v_motivo text;
  v_vistos text[] := '{}';
  v_es_coordinador boolean;
  v_es_admin boolean;
begin
  v_es_admin := public.es_admin();
  v_es_coordinador := public.es_coordinador();

  if not (v_es_admin or v_es_coordinador) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if v_es_coordinador and not v_es_admin then
    if p_tipo <> 'entrega' then
      raise exception 'NO_AUTORIZADO';
    end if;
    if not public.es_coordinador_de(p_vendedor_id) then
      raise exception 'NO_AUTORIZADO';
    end if;
    -- Un coordinador nunca fuerza stock negativo: esa decisión queda
    -- reservada a un admin.
    p_permitir_negativo := false;
  end if;

  v_admin_id := public.mi_vendedor_id();

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if p_tipo not in ('entrega', 'devolucion') then
    raise exception 'TIPO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  perform 1 from vendedores where id = p_vendedor_id for no key update;

  insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id)
  values (p_vendedor_id, p_tipo, coalesce(p_fecha, current_date), p_nota, v_admin_id)
  returning id into v_entrega_id;

  v_tipo_movimiento := case when p_tipo = 'entrega' then 'egreso' else 'ingreso' end;
  v_motivo := case when p_tipo = 'entrega' then 'venta' else null end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;
    v_costo := null;
    v_sugerido := null;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    if v_es_coordinador and not v_es_admin and v_lote_id is null then
      -- Un ítem de un coordinador SIEMPRE trae lote_id: el reparto entre
      -- varios lotes (FIFO, "más viejo primero") ya lo resolvió el
      -- CLIENTE con `repartirCantidadEntreLotes` (`lib/lotes-split.ts`,
      -- misma función que usa un admin) usando
      -- `lotes_disponibles_coordinador` (punto 11) — acá no hay
      -- auto-selección de lote, solo se valida como cualquier otro ítem
      -- con lote (LOTE_INVALIDO/STOCK_LOTE_INSUFICIENTE más abajo, sin
      -- diferencia entre admin y coordinador).
      raise exception 'LOTE_INVALIDO';
    end if;

    if p_tipo = 'entrega' then
      v_costo := nullif(v_item->>'costo_ananja_unitario_centavos', '')::bigint;
      v_sugerido := nullif(v_item->>'precio_sugerido_centavos', '')::bigint;

      if v_es_coordinador and not v_es_admin then
        -- Nunca confía en lo que mande el cliente: siempre el vigente.
        v_costo := null;
      end if;

      if v_costo is null and v_lote_id is not null then
        select d.costo_ananja_centavos into v_costo
        from v_costo_lote_vigente d
        where d.lote_id = v_lote_id and d.producto_id = v_producto_id and d.tiene_costos;
      end if;

      if v_es_coordinador and not v_es_admin and v_costo is null then
        raise exception 'COSTO_FALTANTE';
      end if;

      if v_costo is not null and v_costo <= 0 then
        raise exception 'COSTO_INVALIDO';
      end if;

      if v_sugerido is not null and v_sugerido <= 0 then
        raise exception 'PRECIO_SUGERIDO_INVALIDO';
      end if;
    end if;

    if (v_producto_id::text || ':' || coalesce(v_lote_id::text, '')) = any(v_vistos) then
      raise exception 'ITEM_DUPLICADO';
    end if;
    v_vistos := array_append(v_vistos, v_producto_id::text || ':' || coalesce(v_lote_id::text, ''));

    if v_lote_id is not null and not exists (
      select 1 from lote_items where lote_id = v_lote_id and producto_id = v_producto_id
    ) then
      raise exception 'LOTE_INVALIDO';
    end if;

    if p_tipo = 'entrega' and v_lote_id is not null then
      select quedan into v_quedan from v_stock_por_lote
      where lote_id = v_lote_id and producto_id = v_producto_id;

      if coalesce(v_quedan, 0) < v_cantidad and not p_permitir_negativo then
        raise exception 'STOCK_LOTE_INSUFICIENTE'
          using detail = json_build_object(
            'lote_id', v_lote_id,
            'producto_id', v_producto_id,
            'disponible', coalesce(v_quedan, 0)
          )::text;
      end if;
    end if;

    insert into entrega_items (
      entrega_id, producto_id, cantidad, lote_id,
      costo_ananja_unitario_centavos, precio_sugerido_centavos
    )
    values (v_entrega_id, v_producto_id, v_cantidad, v_lote_id, v_costo, v_sugerido);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
    values (v_producto_id, v_tipo_movimiento, v_cantidad, v_admin_id, v_entrega_id, v_lote_id, null, v_motivo);

    if p_tipo = 'entrega' then
      select s.stock, s.nombre into v_stock, v_nombre
      from v_stock_actual s where s.producto_id = v_producto_id;

      if v_stock < 0 and not p_permitir_negativo then
        raise exception 'STOCK_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_nombre,
            'producto_id', v_producto_id,
            'disponible', v_stock + v_cantidad
          )::text;
      end if;
    else
      select en_poder into v_en_poder
      from v_stock_revendedor where vendedor_id = p_vendedor_id and producto_id = v_producto_id;

      if coalesce(v_en_poder, 0) < 0 and not p_permitir_negativo then
        select nombre into v_nombre from productos where id = v_producto_id;
        raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_nombre,
            'producto_id', v_producto_id,
            'disponible', coalesce(v_en_poder, 0) + v_cantidad
          )::text;
      end if;
    end if;
  end loop;

  return json_build_object('entrega_id', v_entrega_id);
end;
$$;

-- ============================================================
-- 11) lotes_disponibles_coordinador — función NUEVA, mínima: stock por
--     lote de UN producto (lote_id, fecha, quedan — SIN ningún dato de
--     costo), para que el cliente del coordinador arme el reparto entre
--     varios lotes con `repartirCantidadEntreLotes` (`lib/lotes-split.ts`,
--     punto 10) SIN necesitar leer costos. Filtra además
--     `v_costo_lote_vigente.tiene_costos` — un lote sin costos completos
--     ni aparece como opción (evita el dead-end de `COSTO_FALTANTE` en el
--     caso común; sigue existiendo como red de seguridad en (10) si el
--     reparto queda desactualizado entre que el cliente lo pide y confirma
--     la entrega). Gateada a `es_coordinador()` únicamente — un admin ya
--     tiene `obtenerLotesConStock`/`v_costo_lote_vigente` para lo mismo,
--     con costos incluidos.
--
--     BUG encontrado probando contra Postgres local (corregido acá, antes
--     de que esto llegara a aplicarse): `v_stock_por_lote.quedan` es
--     `numeric` (la vista lo arma con `LEAST`/`GREATEST` mezclando
--     `bigint`/`numeric`, confirmado con `information_schema.columns`),
--     no `integer`. Declarar `RETURNS TABLE(..., quedan int)` y hacer
--     `RETURN QUERY SELECT ... s.quedan ...` sin castear rompe SIEMPRE
--     (`structure of query does not match function result type`) — a
--     diferencia de un `SELECT ... INTO` a una variable `int` (como ya
--     hace `registrar_entrega_revendedor` con la misma columna), que sí
--     admite un cast de asignación implícito; `RETURN QUERY` sobre
--     `RETURNS TABLE` exige que el tipo coincida exacto. Se castea acá,
--     `s.quedan::int`, en vez de declarar la columna `numeric`: `quedan`
--     es conceptualmente una cantidad de botellas (siempre entera por
--     construcción — la vista solo suma/resta/`LEAST`/`GREATEST` sobre
--     valores que arrancan enteros, nunca divide), coherente con cómo ya
--     lo trata el resto del código (`v_quedan int` en
--     `registrar_entrega_revendedor`, `LoteConStock.quedan: number` usado
--     en aritmética entera en `lib/lotes-split.ts`) — declarar `numeric`
--     acá sería la excepción, no la regla. Revisado el resto de esta
--     migración: es el ÚNICO `RETURNS TABLE` nuevo (el otro,
--     `mi_encargado_revendedor`, ya existía en prod con esos mismos tipos
--     y no se tocó); las dos vistas (`create or replace view`, sin tipos
--     declarados aparte) no pueden tener este desajuste.
-- ============================================================

create or replace function public.lotes_disponibles_coordinador(p_producto_id uuid)
returns table(lote_id uuid, fecha date, quedan int)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not public.es_coordinador() then
    raise exception 'NO_AUTORIZADO';
  end if;

  return query
    select s.lote_id, s.fecha, s.quedan::int
    from v_stock_por_lote s
    join v_costo_lote_vigente v on v.lote_id = s.lote_id and v.producto_id = s.producto_id
    where s.producto_id = p_producto_id
      and s.quedan > 0
      and v.tiene_costos;
end;
$$;

revoke all on function public.lotes_disponibles_coordinador(uuid) from public;
grant execute on function public.lotes_disponibles_coordinador(uuid) to authenticated;

-- ============================================================
-- 12) SEGURIDAD (BLOCKER de la revisión adversarial, no lo causó esta
--     rama pero rompe la premisa del coordinador): `v_costo_lote_vigente`
--     y `v_costo_lote_desglose` NO tenían `security_invoker = true`
--     (confirmado en prod, `reloptions` null — a diferencia de TODAS las
--     demás vistas de este mismo grupo: `v_costo_lote_item`,
--     `v_costo_lote_venta`, `v_margen_ventas`, `v_stock_por_lote`,
--     `v_cobranza_lote`, `v_deuda_vendedor`, `v_plata_en_manos`, que sí lo
--     tienen). Sin `security_invoker`, las dos corren con los privilegios
--     del DUEÑO de la vista (bypasean la RLS de `lote_items`/
--     `lotes_produccion`/`lote_costos`/`gastos`/`productos`, todas
--     gateadas a `es_vendedor()`) — y tienen `grant select` a
--     `authenticated`: HOY, cualquier usuario logueado (cualquier
--     revendedora, y de acá en más cualquier coordinador) puede leer
--     `select * from v_costo_lote_vigente` por REST y ver el costo real de
--     Ananja, el margen y los precios sugeridos de CUALQUIER lote — nunca
--     debería haber sido así, y rompe directamente el pedido de Fran de
--     que el coordinador "no vea nada más de Ananja" si se dejaba así.
--
--     Verificado LEYENDO el código (no solo infiriendo del esquema) que
--     ningún consumidor legítimo de estas dos vistas depende de que
--     bypaseen RLS:
--      - Todo lo que las lee directo desde Supabase-js
--        (`lib/lotes-disponibles.ts` § `obtenerLotesConStock`,
--        `components/comprobante-form.tsx`) se renderiza SOLO en rutas
--        `(app)` con `exigirAdmin()`/admin-only
--        (`/revendedores/[id]/carga`, `/revendedores/[id]/devolucion`,
--        `/stock/nuevo`, `/comprobantes/*`) — todas con `es_vendedor()` =
--        `true` para quien las llama, así que agregar `security_invoker`
--        no les cambia el resultado.
--      - `lib/margen.ts`/`lib/costos-lote.ts` son funciones PURAS (sin
--        `supabase.*`, verificado con grep): no ejecutan ninguna consulta,
--        reciben filas ya traídas por `/ganancia` (admin-only, `(app)`) o
--        por los formularios de `/stock/*` (admin-only) — mismo caso.
--      - `v_margen_ventas` (`security_invoker` ya en `true`) tiene un CTE
--        (`costo_seguro`) que lee `v_costo_lote_vigente` como FALLBACK
--        solo cuando falta la foto congelada de costo de una venta
--        puntual (`v_costo_lote_venta`, ya invoker) — pero la ÚNICA
--        pantalla que consulta `v_margen_ventas` directo es `/ganancia`
--        (admin). La revendedora en `/mi/ganancia` NO consulta
--        `v_margen_ventas`: usa sus propias filas de `ventas_revendedor`
--        (`listarVentasRevendedor`, ya con su costo fotografiado por
--        fila) + `v_deuda_vendedor` — cero dependencia. Si en el futuro
--        alguna pantalla de revendedora/coordinador necesitara consultar
--        `v_margen_ventas` directo, ese fallback les devolvería `null` en
--        vez de un costo (RLS de `lote_items`/`lotes_produccion` los
--        bloquea) — degradado, no roto (la fila de margen sale con costo
--        `null` en vez de un número), y solo en el caso raro de un lote
--        con costos incompletos.
--     Conclusión: agregar `security_invoker = true` a las dos es seguro,
--     sin ningún cambio de comportamiento para admin, y cierra el hueco
--     para cualquier no-admin (revendedora o coordinador).
-- ============================================================

alter view public.v_costo_lote_desglose set (security_invoker = true);
alter view public.v_costo_lote_vigente set (security_invoker = true);

-- ============================================================
-- Nota (sin cambio de código): notificaciones de "pago informado".
-- `notificaciones_select` (RLS) exige `es_vendedor()` (= `es_admin()`):
-- un coordinador NO ve la notificación cuando una de sus revendedoras le
-- informa un pago, solo la ven los admins (igual que hoy). Decisión
-- explícita, no un olvido: el coordinador nunca puede confirmar/rechazar
-- un pago (esa función sigue exigiendo `es_admin()`, ver 6c/6d) ni tiene
-- pantalla de tareas/notificaciones — ampliarle la RLS de `notificaciones`
-- le daría un aviso que no puede accionar, sin pantalla donde mostrarlo.
-- Coherente con el resto del diseño ("no ve nada más de Ananja"): el
-- aviso le llega a un admin, que confirma o rechaza en su nombre (6c/6d).
-- Si Fran pide más adelante que el coordinador SÍ vea el estado de los
-- pagos de sus revendedoras, es una pantalla nueva + una policy nueva de
-- `notificaciones_select` con `destinatario_id = mi_vendedor_id()`, no
-- algo que se pueda colar gratis en esta migración.
-- ============================================================
