-- Ananja: Laura admin -> coordinador + stock disponible del coordinador +
-- plata del coordinador — pedido de Fran, 2026-09-18. Sigue a
-- 0055_coordinador.sql (rol "coordinador") y 0056 (revoke anon).
--
-- Tres cosas:
--
--  1) `asignar_rol_revendedor` — create or replace (misma firma: no cambia
--     ni agrega parámetros). Agrega dos transiciones nuevas:
--       - `admin -> coordinador`, con la MISMA guardia "último admin" que
--         ya existía en 0018_revendedores.sql para `* -> revendedor`
--         (contar admins activos EXCLUYENDO a este vendedor, exigir >= 1).
--         Esa guardia quedó código muerto desde 0026 (admin->revendedor se
--         bloquea antes, sin condición, con ADMIN_NO_REVENDEDOR) — acá se
--         reusa el mismo patrón para la transición nueva, que si sí puede
--         pasar.
--       - `coordinador -> admin` (la vuelta, simétrica a
--         `revendedor -> admin` que ya existe): sin guardia de último
--         admin, porque sumar un admin nunca puede dejar la app sin
--         ninguno.
--     `ADMIN_NO_REVENDEDOR` sigue exactamente igual (un admin sigue sin
--     poder pasar a revendedor directo). No se toca ninguna otra
--     transición (`revendedor <-> coordinador` sigue sin existir, fuera de
--     este pedido).
--
--  2) `v_plata_en_manos` (0037, ampliada en 0055) — create or replace view
--     (mismas columnas): el gate de qué FILAS puede leer cada quien pasa
--     de `es_admin()` a solas a `es_admin() or (es_coordinador() and
--     id = mi_vendedor_id())`. Un admin sigue viendo TODAS las filas
--     (admin + coordinador) igual que hoy; un coordinador ahora puede
--     consultar la vista pero la condición `id = mi_vendedor_id()` deja
--     pasar SOLO su propia fila — nunca la de otro coordinador ni la de
--     un admin. Nada de Producción/Gastos/Comprobantes/Ganancia se toca:
--     un coordinador sigue sin acceso a esas vistas.
--
--  3) Plata informada por el coordinador — mismo patrón que
--     `pagos_revendedor`/`informar_pago_revendedor`/
--     `confirmar_pago_revendedor`/`rechazar_pago_revendedor` (0040), pero
--     más chico: acá no hay variación de destinatario (un coordinador
--     siempre "avisa" que pasó plata a la Cuenta Ananja, nunca a una
--     persona) así que no hace falta nada como `destinatario_id`/el split
--     admin-activo/coordinador-activo de 0055 — CUALQUIER admin puede
--     confirmar o rechazar.
--       - Tabla nueva `depositos_informados` (chica, mismo shape que
--         `depositos_cuenta` + el estado pendiente/confirmado/rechazado de
--         `pagos_revendedor`).
--       - `informar_deposito_cuenta(p_medio_pago, p_monto_centavos,
--         p_fecha, p_nota)`: gateada a `es_coordinador()`, `tenedor_id`
--         SIEMPRE `mi_vendedor_id()` (nunca viaja del cliente). Valida
--         medio <> efectivo (no hay caja física), monto > 0, y no deja
--         avisar más de lo que `v_plata_en_manos` dice que tiene en mano
--         ahora (mismo criterio que `registrar_deposito_cuenta` sin
--         `p_permitir_negativo`) — evita un aviso que el admin no podría
--         confirmar sin dejarlo en negativo. Notifica a todos los admins
--         (`destinatario_id = null`, mismo patrón que `stock_bajo`/
--         `gasto_nuevo`).
--       - `confirmar_deposito_informado(p_deposito_informado_id)`: gateada
--         a `es_admin()`. NO reimplementa el insert — llama directo a
--         `registrar_deposito_cuenta(v_dep.tenedor_id, ...)` (el tenedor
--         SIEMPRE es el coordinador que avisó, nunca el admin que
--         confirma — el bug de plata mal atribuida que ya encontró la
--         revisión adversarial de 0037 y volvió a evitar 0055 en (6b)/(7))
--         así el depósito real que se crea es exactamente el mismo que si
--         un admin lo hubiera cargado directo desde `/plata/depositar`:
--         mismo efecto en `v_cuenta_ananja`, `v_saldos_caja` y
--         `v_plata_en_manos`. `auth.uid()` no cambia por estar anidada
--         adentro de otra función `security definer` (lee el session GUC
--         de PostgREST, no el rol efectivo), así que `es_admin()` adentro
--         de `registrar_deposito_cuenta` sigue viendo al admin que
--         confirma — se verifica ese mismo `es_admin()` accedido acá antes
--         igual, por las dudas y para el mensaje de error correcto.
--       - `rechazar_deposito_informado(p_deposito_informado_id, p_motivo)`:
--         gateada a `es_admin()`, exige motivo, no toca `depositos_cuenta`.
--       - El camino de admin directo (`registrar_deposito_cuenta` desde
--         `DepositarRapido`/`/plata/depositar`) sigue exactamente igual,
--         sin cambios de este punto — ya aceptaba un tenedor coordinador
--         desde 0055.
--
-- Fuera de esta migración (decisión explícita): no se agrega
-- `revendedor <-> coordinador` a `asignar_rol_revendedor` (fuera del
-- pedido de Fran); `depositos_informados` no tiene `destinatario_id` (sin
-- variación posible, a diferencia de `pagos_revendedor`).
--
-- SEGUNDA vuelta (revisión adversarial, sin BLOCKERs, 3 correcciones antes
-- de aplicar):
--
--  a) `informar_deposito_cuenta` — chequeaba el monto contra
--     `v_plata_en_manos.total_centavos`, que NO descuenta un aviso
--     `pendiente` ya cargado: un coordinador con $400.000 en mano podía
--     avisar $300.000 dos veces, y el segundo aviso quedaba trabado para
--     siempre (`confirmar_deposito_informado` le pega `SALDO_INSUFICIENTE`
--     porque la plata real ya no alcanza, y la única salida era
--     rechazarlo). Arreglado con DOS capas: (1) `uq_depositos_informados_pendiente_por_tenedor`,
--     índice único parcial `(tenedor_id) where estado = 'pendiente'` — un
--     coordinador nunca puede tener más de un aviso pendiente a la vez,
--     ni siquiera con dos requests simultáneos (el índice lo bloquea a
--     nivel de base, no solo la función); (2) un chequeo explícito en
--     `informar_deposito_cuenta` ANTES del insert, con un error propio
--     `AVISO_PENDIENTE` (en vez de dejar que la violación del índice
--     único llegue como un error de Postgres genérico sin traducir en la
--     UI).
--
--  b) `asignar_rol_revendedor` — al pasar `admin -> coordinador` ahora
--     también apaga `revende` (un coordinador no vende, decisión de Fran:
--     el flag quedaba prendido pero inútil — `registrar_entrega_revendedor`
--     no contempla `p_tipo` para un coordinador con `revende`, y la UI ya
--     no ofrece el botón para apagarlo a mano porque `EspacioRevendedorButton`
--     en `cabecera.tsx` solo aparece para `rol = 'admin'`). Verificado
--     contra prod (schema `public`, 2026-09-18, SELECTs de
--     solo lectura): Laura (`revende = true` hoy) tiene 0 filas en
--     `ventas_revendedor` y 0 en `entregas_revendedor` — apagar `revende`
--     no le borra ni le esconde ningún dato real, no tiene espacio de
--     revendedor en uso. Las demás transiciones (`* -> admin`,
--     `pendiente -> revendedor`) no tocan `revende` — solo se apaga al
--     ENTRAR a `coordinador`.
--
--  c) Coordinador entrando a `(app)` por URL directa — evaluado, NO
--     necesita código nuevo: `lib/supabase/middleware.ts` §
--     `decidirRedireccion` (0055_coordinador.sql, YA en `main`) ya
--     redirige CUALQUIER pathname que no sea exactamente `/mi` a `/mi`
--     para `rol = 'coordinador'` (`vendedor.rol === "coordinador" &&
--     !isPublicPath && pathname !== MI_PREFIX`), corriendo en
--     `updateSession` — que `proxy.ts` llama para TODO el matcher, `/tareas`
--     y `/plata` incluidos, no hace falta que la ruta esté en una lista
--     aparte. Ya estaba probado (`tests/decidir-redireccion.test.ts`) para
--     `/`, `/caja`, `/revendedores`, subrutas de `/mi` y `/login`; esta
--     migración no lo toca, `tests/decidir-redireccion.test.ts` suma casos
--     explícitos para `/tareas` y `/plata` (mismo comportamiento, ya
--     cubierto por la regla general — el test es para dejarlo documentado
--     con esos nombres concretos, no porque hiciera falta código nuevo).
--
-- Migración sin templating (mismo criterio que 0049-0056): hardcodea
-- `public.` y `search_path = public`.

-- ============================================================
-- 1) asignar_rol_revendedor — agrega admin->coordinador (con guardia de
--    último admin) y coordinador->admin (sin guardia, simétrica a
--    revendedor->admin).
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
    or (v_rol_actual = 'admin' and p_rol = 'coordinador')
    or (v_rol_actual = 'coordinador' and p_rol = 'admin')
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

  -- admin -> coordinador: misma guardia que arriba (>= 1 admin activo
  -- distinto de este vendedor), para nunca dejar la app sin admins.
  if v_rol_actual = 'admin' and p_rol = 'coordinador' then
    select count(*) into v_admins_restantes
    from vendedores
    where rol = 'admin' and activo and id <> p_vendedor_id;

    if v_admins_restantes < 1 then
      raise exception 'ULTIMO_ADMIN';
    end if;
  end if;

  -- Al pasar a coordinador, apaga `revende`: un coordinador no vende (no
  -- corre `puede_revender()`, no tiene sentido conservar el flag prendido)
  -- y sin esto quedaba encendido pero inútil, sin forma de apagarlo desde
  -- la UI (`EspacioRevendedorButton` en `cabecera.tsx` solo aparece para
  -- `rol = 'admin'`). Ninguna otra transición toca `revende`.
  update vendedores set
    rol = p_rol,
    revende = case when p_rol = 'coordinador' then false else revende end
  where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id, 'rol', p_rol);
end;
$$;

-- Grants sin cambios (create or replace, misma firma) — ya aplicados en
-- 0018/0026/0055.

-- ============================================================
-- 2) v_plata_en_manos — create or replace view, mismas columnas: un
--    coordinador puede consultarla pero solo ve su propia fila.
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
where rol in ('admin', 'coordinador')
  and (public.es_admin() or (public.es_coordinador() and id = public.mi_vendedor_id()));

-- security_invoker / revoke / grant sin cambios (create or replace,
-- mismas columnas) — ya aplicados en 0037.

-- ============================================================
-- 3a) depositos_informados — "avisar que la pasé" de un coordinador.
-- ============================================================

create table depositos_informados (
  id uuid primary key default gen_random_uuid(),
  -- A quién le pertenece esta plata: SIEMPRE mi_vendedor_id() de quien
  -- llama a informar_deposito_cuenta (nunca viaja del cliente) — el
  -- coordinador que la tiene en mano.
  tenedor_id uuid not null references vendedores(id),
  medio_pago medio_pago not null check (medio_pago <> 'efectivo'),
  monto_centavos bigint not null check (monto_centavos > 0),
  fecha date not null,
  nota text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'rechazado')),
  -- Al confirmar, el id del depósito real que crea
  -- confirmar_deposito_informado (vía registrar_deposito_cuenta).
  deposito_id uuid references depositos_cuenta(id),
  resuelto_por uuid references vendedores(id),
  resuelto_en timestamptz,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  constraint depositos_informados_estado_coherente check (
    (estado = 'pendiente' and deposito_id is null and resuelto_por is null
      and resuelto_en is null and motivo_rechazo is null)
    or (estado = 'confirmado' and deposito_id is not null and resuelto_por is not null
      and resuelto_en is not null and motivo_rechazo is null)
    or (estado = 'rechazado' and deposito_id is null and resuelto_por is not null
      and resuelto_en is not null and motivo_rechazo is not null)
  )
);

create index idx_depositos_informados_tenedor_id on depositos_informados(tenedor_id, fecha desc);
create index idx_depositos_informados_pendientes on depositos_informados(estado) where estado = 'pendiente';
-- Un depósito confirmado genera exactamente un depósito real, y un
-- depósito real viene a lo sumo de un aviso (mismo criterio que
-- uq_pagos_revendedor_rendicion_id, 0040).
create unique index uq_depositos_informados_deposito_id on depositos_informados(deposito_id)
  where deposito_id is not null;

-- Un coordinador nunca puede tener más de un aviso PENDIENTE a la vez
-- (revisión adversarial: sin esto, avisar dos veces sin esperar la
-- confirmación deja el segundo aviso trabado para siempre —
-- `confirmar_deposito_informado` le pega SALDO_INSUFICIENTE porque la
-- plata real ya no alcanza, y la única salida es rechazarlo). El índice
-- único es la garantía de verdad (bloquea incluso dos avisos
-- simultáneos, que el chequeo `select` de `informar_deposito_cuenta` solo
-- no cubre); el chequeo explícito de esa función es para devolver
-- `AVISO_PENDIENTE` en vez de que la violación del índice llegue como un
-- error de Postgres sin traducir.
create unique index uq_depositos_informados_pendiente_por_tenedor on depositos_informados(tenedor_id)
  where estado = 'pendiente';

alter table depositos_informados enable row level security;
revoke all on depositos_informados from anon, authenticated, public;
grant select on depositos_informados to authenticated;

-- El coordinador ve SOLO sus propios avisos; un admin los ve todos (nunca
-- al revés: un coordinador nunca ve la plata de otro coordinador ni la de
-- un admin acá tampoco). Sin insert/update/delete directo: solo RPCs.
create policy depositos_informados_select on depositos_informados for select to authenticated
  using (public.es_admin() or tenedor_id = public.mi_vendedor_id());

-- Nuevo valor de enum ANTES de las funciones de abajo (mismo orden que
-- 0040_revendedores_pagos_precios.sql § 'pago_revendedor'): el body de
-- `informar_deposito_cuenta` lo usa como literal de texto contra la
-- columna `notificaciones.tipo`.
alter type tipo_notificacion add value if not exists 'deposito_informado';

-- ============================================================
-- 3b) informar_deposito_cuenta — el coordinador avisa que pasó su plata.
-- ============================================================

create function public.informar_deposito_cuenta(
  p_medio_pago medio_pago,
  p_monto_centavos bigint,
  p_fecha date default current_date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_tenedor_id uuid;
  v_nombre text;
  v_en_mano numeric;
  v_deposito_informado_id uuid;
begin
  if not public.es_coordinador() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_tenedor_id := public.mi_vendedor_id();
  select nombre into v_nombre from vendedores where id = v_tenedor_id;

  if p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  -- Un aviso pendiente por vez (revisión adversarial): si ya hay uno
  -- esperando confirmación, avisar otro de nuevo dejaría el segundo
  -- trabado (v_plata_en_manos no descuenta lo ya avisado, así que el
  -- monto disponible de acá abajo estaría inflado). El índice único
  -- parcial `uq_depositos_informados_pendiente_por_tenedor` es la
  -- garantía real (cubre la carrera de dos avisos simultáneos); este
  -- chequeo es solo para devolver un error propio y claro.
  if exists (select 1 from depositos_informados where tenedor_id = v_tenedor_id and estado = 'pendiente') then
    raise exception 'AVISO_PENDIENTE';
  end if;

  -- No dejar avisar más de lo que tiene en mano ahora (mismo criterio que
  -- registrar_deposito_cuenta sin p_permitir_negativo): evita un aviso que
  -- después ningún admin puede confirmar sin dejarlo en negativo.
  select total_centavos into v_en_mano from v_plata_en_manos where tenedor_id = v_tenedor_id;
  if coalesce(v_en_mano, 0) - p_monto_centavos < 0 then
    raise exception 'SALDO_INSUFICIENTE'
      using detail = json_build_object('disponible', coalesce(v_en_mano, 0))::text;
  end if;

  insert into depositos_informados (tenedor_id, medio_pago, monto_centavos, fecha, nota)
  values (v_tenedor_id, p_medio_pago, p_monto_centavos, p_fecha, nullif(btrim(p_nota), ''))
  returning id into v_deposito_informado_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id, destinatario_id)
  values (
    'deposito_informado',
    'Depósito de ' || coalesce(v_nombre, 'un coordinador'),
    'Revisalo en Tareas para confirmarlo.',
    v_deposito_informado_id,
    null
  );

  return json_build_object('id', v_deposito_informado_id);
end;
$$;

revoke execute on function public.informar_deposito_cuenta(medio_pago, bigint, date, text) from anon, public;
grant execute on function public.informar_deposito_cuenta(medio_pago, bigint, date, text) to authenticated;

-- ============================================================
-- 3c) confirmar_deposito_informado — un admin confirma que la plata llegó.
--     Reusa registrar_deposito_cuenta para crear EXACTAMENTE el mismo
--     depósito que hoy crea un admin a mano, con tenedor_id = el
--     coordinador que avisó (nunca el admin que confirma).
-- ============================================================

create function public.confirmar_deposito_informado(p_deposito_informado_id uuid)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin_id uuid;
  v_dep depositos_informados%rowtype;
  v_resultado json;
  v_deposito_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  select * into v_dep from depositos_informados where id = p_deposito_informado_id for update;
  if not found then
    raise exception 'DEPOSITO_NO_ENCONTRADO';
  end if;

  if v_dep.estado <> 'pendiente' then
    raise exception 'DEPOSITO_YA_RESUELTO';
  end if;

  -- Mismo RPC que /plata/depositar y DepositarRapido — vuelve a validar
  -- tenedor/medio/monto y el saldo actual (p_permitir_negativo = false).
  v_resultado := public.registrar_deposito_cuenta(
    v_dep.tenedor_id,
    v_dep.medio_pago,
    v_dep.monto_centavos,
    v_dep.fecha,
    coalesce(v_dep.nota, 'Depósito informado desde la app'),
    false
  );
  v_deposito_id := (v_resultado ->> 'id')::uuid;

  update depositos_informados set
    estado = 'confirmado',
    deposito_id = v_deposito_id,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_deposito_informado_id;

  return json_build_object('id', p_deposito_informado_id, 'deposito_id', v_deposito_id);
end;
$$;

revoke execute on function public.confirmar_deposito_informado(uuid) from anon, public;
grant execute on function public.confirmar_deposito_informado(uuid) to authenticated;

-- ============================================================
-- 3d) rechazar_deposito_informado — un admin rechaza el aviso (no toca
--     depositos_cuenta ni ninguna plata).
-- ============================================================

create function public.rechazar_deposito_informado(p_deposito_informado_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_admin_id uuid;
  v_dep depositos_informados%rowtype;
  v_motivo text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  v_motivo := nullif(btrim(p_motivo), '');
  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_dep from depositos_informados where id = p_deposito_informado_id for update;
  if not found then
    raise exception 'DEPOSITO_NO_ENCONTRADO';
  end if;

  if v_dep.estado <> 'pendiente' then
    raise exception 'DEPOSITO_YA_RESUELTO';
  end if;

  update depositos_informados set
    estado = 'rechazado',
    motivo_rechazo = v_motivo,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_deposito_informado_id;

  return json_build_object('id', p_deposito_informado_id);
end;
$$;

revoke execute on function public.rechazar_deposito_informado(uuid, text) from anon, public;
grant execute on function public.rechazar_deposito_informado(uuid, text) to authenticated;
