-- 0092_eliminar_pago_revendedor.sql
--
-- MIGRACIÓN ADITIVA. Agrega UNA función (RPC) para que un admin pueda
-- ELIMINAR un pago de una revendedora que ya quedó registrado (una
-- "rendición"), con todo lo que cuelga de ella coherente:
--
--   eliminar_rendicion_revendedor(p_rendicion_id uuid) returns json
--
-- No toca datos, no cambia ninguna función ni vista existente, no revoca nada.
-- (Para un pago todavía PENDIENTE de confirmar ya existe
-- `rechazar_pago_revendedor`; esto es para los que ya se confirmaron o los que
-- un admin cargó directo con `registrar_rendicion` / `registrar_carga_revendedor`.)
--
-- ── El modelo real (verificado en producción, schema `public`, solo catálogos)
--   * `rendiciones` es la ÚNICA fila que cuenta plata. Nace de tres maneras:
--       a) `confirmar_pago_revendedor`: crea la rendición y deja el pago
--          (`pagos_revendedor`) en `confirmado` con `rendicion_id`.
--       b) `registrar_rendicion` / `registrar_carga_revendedor` (admin carga
--          directo, sin pago informado).
--       c) `registrar_venta_coordinador`: rendición de la coordinadora hacia
--          sí misma, con `venta_grupo_id`.
--     Las ferias NO crean rendiciones.
--   * Todo lo que se mira se CALCULA a partir de ellas, no hay total guardado:
--       v_deuda_vendedor (entregado = suma de rendiciones), v_saldos_caja
--       (efectivo: rendiciones `via='encargado'`; Mercado Pago/banco:
--       `directo_cuenta`/`cliente_directo` por `medio_pago`), v_plata_en_manos
--       (por `v_rendiciones_ananja` = `rendiciones_parte_ananja()`, un reparto
--       FIFO por `created_at` de cada vendedor), v_diferencia_encargado /
--       v_deuda_encargados (devengado por cruce FIFO por fecha). Borrar la fila
--       revierte todo solo, incluido el corrimiento del FIFO de los pagos
--       posteriores. `v_margen_ventas` no mira rendiciones (la ganancia no
--       depende de lo rendido).
--   * Lo GUARDADO que apunta a una rendición:
--       - `pagos_revendedor.rendicion_id` (FK sin cascade; CHECK
--         `pagos_revendedor_estado_coherente`: confirmado exige rendicion_id,
--         rechazado exige rendicion_id null + motivo + resuelto_por/en).
--       - `cargas_revendedor.rendicion_id` (FK ON DELETE SET NULL; solo es el
--         registro de idempotencia de la carga).
--     No hay imputaciones FIFO guardadas, ni flags, ni tareas guardadas, ni
--     notificaciones ligadas (confirmar no notifica).
--   * Triggers: `rendiciones` solo tiene uno BEFORE INSERT
--     (`rendiciones_encargado_diferencia`); no hay triggers de DELETE ni en
--     `pagos_revendedor`.
--
-- ── Qué hace
--   Solo admin. Bloquea (`for no key update`) la fila de la revendedora (mismo
--   orden que el resto: vendedores -> rendición -> pago), después la rendición
--   y el pago que la originó (`for update`). Archiva la fila en
--   `rendiciones_borradas` (la tabla de archivo que ya usa
--   `eliminar_venta_revendedor`), deja el pago en estado `rechazado` con el
--   motivo "Eliminado por la administración" (reutiliza un estado existente
--   que todas las vistas ya ignoran, así no se agregan columnas ni valores:
--   queda el rastro, el comprobante y se ve en `/mi` y en la ficha) y borra la
--   rendición. Con la rendición ya fuera revisa que nada quede imposible; si
--   algo quedara mal lanza una excepción y se deshace TODO.
--   Efecto: la revendedora vuelve a deber ese monto y la plata deja de figurar
--   en la cuenta o en las manos del encargado donde estaba.
--
-- ── Qué rechaza (cada código con su `detail` donde la pantalla lo necesita)
--   NO_AUTORIZADO           no es admin.
--   RENDICION_NO_ENCONTRADA no existe (id null o ya eliminada).
--   RENDICION_DE_VENTA      es la rendición de una venta de coordinadora
--                           (`venta_grupo_id`): se deshace borrando esa venta
--                           (`eliminar_venta_revendedor`), que ya la archiva y
--                           devuelve el stock.
--   PLATA_YA_DEPOSITADA     al sacarla, la plata en manos de algún encargado
--                           (efectivo) queda negativa o por debajo de un aviso
--                           de depósito pendiente, y es peor que antes: esa
--                           plata ya se pasó a la Cuenta Ananja o se gastó.
--                           `detail` = {tenedor, en_mano_centavos,
--                           pendiente_centavos, monto_centavos}. Primero hay
--                           que eliminar el depósito (o el gasto) que la usó.
--   CAJA_SIN_SALDO          al sacarla, Mercado Pago/banco/efectivo quedan en
--                           negativo (y peor que antes). `detail` = {medio,
--                           disponible}. Esa plata ya se usó (gasto, pago de
--                           deuda, transferencia): eliminar eso primero.
--   DIFERENCIA_YA_PAGADA    al sacarla, a un encargado se le habría pagado más
--                           de lo que devengó (saldo de `v_deuda_encargados`
--                           negativo y peor que antes). `detail` = {encargado,
--                           saldo_centavos}. Primero hay que eliminar el gasto
--                           "Diferencias de encargados" que se le pagó.
--   El chequeo compara "después" contra "antes" (se guarda una foto de los
--   saldos antes de borrar), así un negativo que ya existía por otra causa no
--   bloquea borrar algo que no lo empeora.
--
-- ── Borrar vs. marcar
--   Se BORRA la rendición (con archivo en `rendiciones_borradas`) porque todas
--   las vistas suman filas de `rendiciones`; agregar un estado a la rendición
--   obligaría a tocar 6 vistas y una función. Se MARCA el pago (reutilizando
--   `rechazado`) porque `pagos_revendedor` ya admite ese estado y las vistas
--   lo ignoran: es el rastro de quién pagó qué y con qué comprobante, sin
--   cambiar ningún tipo. Rollback del dato: no hay botón de "deshacer"; se
--   vuelve a cargar el pago.
--
-- ── Qué NO hace
--   * No edita: eliminar y volver a cargar lo cubre.
--   * No toca pagos pendientes ni rechazados (no tienen rendición).
--   * No elimina depósitos, gastos ni transferencias en cascada: los rechaza
--     y dice cuál borrar primero.
--
-- ── Carreras conocidas (igual que `eliminar_venta_revendedor`)
--   `registrar_deposito_cuenta` no toma ningún lock, así que un depósito
--   cargado en el mismo instante que esta eliminación puede leer el saldo
--   anterior. Solo admins, ventana de milisegundos; si pasara, la plata en
--   manos queda negativa y se arregla eliminando ese depósito.
--
-- Compatibilidad con el código desplegado: solo agrega una función. Si el
-- código nuevo sale antes que esta migración, el botón devuelve el mensaje
-- genérico de error; ninguna pantalla se rompe.
--
-- Migración sin templating (mismo criterio que 0049-0091): hardcodea
-- `public.`. `set search_path = public` va SIN comillas a propósito: con
-- comillas rompe el render multi-schema (supabase/render.mjs).
--
-- ── Verificación posterior (SOLO LECTURA) ────────────────────────────────
--   select p.oid::regprocedure as firma, p.prosecdef, p.proconfig, p.proacl::text
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname = 'eliminar_rendicion_revendedor';
--   -- esperado: 1 fila, prosecdef = true, proconfig = {search_path=public},
--   --   proacl con postgres, authenticated y service_role; sin anon ni PUBLIC.
--
-- ── Rollback ─────────────────────────────────────────────────────────────
--   drop function public.eliminar_rendicion_revendedor(uuid);
--   (solo agrega una función; lo ya eliminado queda en `rendiciones_borradas`
--   y los pagos marcados `rechazado` no se revierten solos.)

create function public.eliminar_rendicion_revendedor(p_rendicion_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_vendedor_id uuid;
  v_rend public.rendiciones%rowtype;
  v_pago_id uuid;
  v_pre_manos jsonb;
  v_pre_cajas jsonb;
  v_pre_enc jsonb;
  v_antes numeric;
  v_fila record;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  select vendedor_id into v_vendedor_id
  from public.rendiciones
  where id = p_rendicion_id;

  if not found then
    raise exception 'RENDICION_NO_ENCONTRADA';
  end if;

  -- Orden de locks: vendedores -> rendición -> pago.
  perform 1 from public.vendedores where id = v_vendedor_id for no key update;

  select * into v_rend
  from public.rendiciones
  where id = p_rendicion_id
  for update;

  if not found then
    raise exception 'RENDICION_NO_ENCONTRADA';
  end if;

  if v_rend.venta_grupo_id is not null then
    raise exception 'RENDICION_DE_VENTA';
  end if;

  select id into v_pago_id
  from public.pagos_revendedor
  where rendicion_id = v_rend.id
  for update;

  -- Foto de los saldos ANTES de borrar, para no bloquear por un negativo que
  -- ya existía y que esta eliminación no empeora.
  select coalesce(jsonb_object_agg(tenedor_id::text, total_centavos), '{}'::jsonb)
    into v_pre_manos from public.v_plata_en_manos;
  select coalesce(jsonb_object_agg(medio_pago, saldo_centavos), '{}'::jsonb)
    into v_pre_cajas from public.v_saldos_caja where medio_pago <> 'total';
  select coalesce(jsonb_object_agg(encargado_id::text, saldo_centavos), '{}'::jsonb)
    into v_pre_enc from public.v_deuda_encargados;

  insert into public.rendiciones_borradas (
    rendicion_id, vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id,
    created_at, via, tenedor_id, encargado_diferencia_id, venta_grupo_id, borrada_por
  ) values (
    v_rend.id, v_rend.vendedor_id, v_rend.monto_centavos, v_rend.medio_pago, v_rend.fecha,
    v_rend.nota, v_rend.admin_id, v_rend.created_at, v_rend.via, v_rend.tenedor_id,
    v_rend.encargado_diferencia_id, v_rend.venta_grupo_id, v_admin_id
  );

  -- El pago que la originó queda como rechazado (CHECK estado_coherente:
  -- rechazado exige rendicion_id null, motivo y resuelto_por/en).
  if v_pago_id is not null then
    update public.pagos_revendedor
    set estado = 'rechazado',
        rendicion_id = null,
        resuelto_por = v_admin_id,
        resuelto_en = now(),
        motivo_rechazo = 'Eliminado por la administración (ya estaba confirmado)'
    where id = v_pago_id;
  end if;

  delete from public.rendiciones where id = v_rend.id;

  -- ── Con la rendición ya fuera: nada puede haber quedado imposible. La
  -- excepción deshace TODO lo de esta función.

  -- (1) Plata en manos de un encargado (efectivo): ni negativa ni por debajo
  -- de un aviso de depósito pendiente.
  for v_fila in
    select pm.tenedor_id, pm.nombre, pm.total_centavos,
           coalesce((
             select sum(di.monto_centavos)
             from public.depositos_informados di
             where di.tenedor_id = pm.tenedor_id and di.estado = 'pendiente'
           ), 0) as pendiente
    from public.v_plata_en_manos pm
  loop
    v_antes := coalesce((v_pre_manos ->> v_fila.tenedor_id::text)::numeric, 0);
    if v_fila.total_centavos < v_antes
       and (v_fila.total_centavos < 0 or v_fila.pendiente > v_fila.total_centavos) then
      raise exception 'PLATA_YA_DEPOSITADA'
        using detail = json_build_object(
          'tenedor', v_fila.nombre,
          'en_mano_centavos', v_fila.total_centavos,
          'pendiente_centavos', v_fila.pendiente,
          'monto_centavos', v_rend.monto_centavos
        )::text;
    end if;
  end loop;

  -- (2) Cajas (efectivo, Mercado Pago, banco): ninguna en negativo por esto.
  for v_fila in
    select medio_pago, saldo_centavos
    from public.v_saldos_caja
    where medio_pago <> 'total'
  loop
    v_antes := coalesce((v_pre_cajas ->> v_fila.medio_pago)::numeric, 0);
    if v_fila.saldo_centavos < 0 and v_fila.saldo_centavos < v_antes then
      raise exception 'CAJA_SIN_SALDO'
        using detail = json_build_object(
          'medio', v_fila.medio_pago,
          'disponible', v_antes
        )::text;
    end if;
  end loop;

  -- (3) Diferencias de encargados: a nadie se le pagó más de lo que devengó.
  for v_fila in
    select de.encargado_id, de.nombre, de.saldo_centavos
    from public.v_deuda_encargados de
  loop
    v_antes := coalesce((v_pre_enc ->> v_fila.encargado_id::text)::numeric, 0);
    if v_fila.saldo_centavos < 0 and v_fila.saldo_centavos < v_antes then
      raise exception 'DIFERENCIA_YA_PAGADA'
        using detail = json_build_object(
          'encargado', v_fila.nombre,
          'saldo_centavos', v_fila.saldo_centavos
        )::text;
    end if;
  end loop;

  return json_build_object(
    'id', v_rend.id,
    'vendedor_id', v_rend.vendedor_id,
    'monto_centavos', v_rend.monto_centavos,
    'pago_id', v_pago_id
  );
end;
$$;

revoke all on function public.eliminar_rendicion_revendedor(uuid) from public, anon;
grant execute on function public.eliminar_rendicion_revendedor(uuid) to authenticated;
