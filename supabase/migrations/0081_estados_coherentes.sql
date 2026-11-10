-- 0081_estados_coherentes.sql
--
-- Red de seguridad en la base para tres máquinas de estado (ver
-- docs/maquinas-de-estado.md): que la base se defienda sola de estados
-- incoherentes, sin cambiar firmas ni pantallas.
--
--   1) Deuda del aceite: `sincronizar_deuda_aceite_lote` (0047) cambia el
--      monto de la deuda automática de un lote pero no tocaba `saldada_en`.
--      Si se re-editaban los costos de un pedido ya pagado y el monto
--      SUBÍA, quedaba `saldada_en` con fecha y saldo restante > 0:
--      `registrar_pago_deuda` rechaza con DEUDA_YA_SALDADA y la pantalla de
--      pago da 404, o sea la deuda quedaba impagable. A la inversa, si el
--      monto BAJABA hasta igualar lo ya pagado, quedaba restante = 0 con
--      `saldada_en` nulo (deuda "parcial" eterna). Ahora la función deja
--      `saldada_en` coherente con el saldo.
--   2) `feria_participantes`: CHECK `feria_participantes_estado_coherente`
--      (pendiente => sin `cerrada_at` y montos en 0; cerrada => con
--      `cerrada_at`), al estilo de `pagos_revendedor_estado_coherente` (0040).
--   3) `rendiciones`: CHECK `rendiciones_via_tenedor_coherente`
--      (`via = 'encargado'` <=> `tenedor_id` no nulo).
--
-- ── 1) Decisiones de la deuda del aceite ────────────────────────────────
--   * Mismo criterio que `registrar_pago_deuda` (0036): una deuda está
--     saldada cuando `restante <= 0` (monto - pagos). `eliminar_pago_deuda`
--     (0027) usa el mismo criterio al reabrirla (`restante > 0`).
--   * Fecha: `sincronizar_deuda_aceite_lote(p_lote_id)` no recibe fecha y
--     NO se cambia la firma. Para reabrir (`saldada_en = null`) no hace
--     falta fecha. Para saldar usa `max(pagos_deuda.fecha)` de esa deuda:
--     es la fecha de negocio (Argentina) que el cliente mandó al registrar
--     el último pago, la misma fuente que `registrar_pago_deuda` usa para
--     `saldada_en` (su `p_fecha`). NO se usa `current_date` (corre en UTC;
--     ver 0036_fechas_argentina.sql). El caso necesita al menos un pago, así
--     que `max(fecha)` nunca es nulo ahí.
--   * Una deuda marcada saldada A MANO sin estar pagada (`marcarDeudaSaldada`
--     en lib/precios.ts: perdón/anulación) NO se reabre: solo se reabre una
--     deuda que estaba saldada porque estaba pagada del todo con el monto
--     anterior (`monto_anterior <= pagado`) y el monto nuevo ya no alcanza.
--   * Si el monto nuevo quedara por debajo de lo pagado, no se toca nada
--     acá: `fijar_costos_lote` ya aborta con DEUDA_ACEITE_MENOR_A_PAGADO y
--     revierte toda la transacción.
--   * `create or replace` con la misma firma: conserva `security definer`,
--     `set search_path` y los permisos; el `revoke` se repite igual que 0047.
--     El resto del cuerpo es idéntico al vigente en producción (verificado
--     con `pg_get_functiondef`).
--
-- ── 2) y 3) Sobre los CHECK ─────────────────────────────────────────────
--   Se verificó leyendo TODAS las funciones que escriben esas tablas que
--   cada sentencia deja una fila coherente (ninguna pasa por un estado
--   intermedio inválido):
--   * `feria_participantes`: insert con defaults (`feria_agregar_participante`
--     0078, `feria_cargar_degustacion` 0079, `registrar_entrega_revendedor`
--     0080: estado 'pendiente', `cerrada_at` null, montos 0);
--     `feria_cerrar_participacion` (0079) pone estado 'cerrada' +
--     `cerrada_at = now()` + montos en el MISMO update;
--     `feria_reabrir_participacion` (0079) vuelve a 'pendiente' +
--     `cerrada_at = null` + montos en 0 en el MISMO update;
--     `feria_quitar_participante` solo borra. Sin grant de escritura para
--     `authenticated`.
--   * `rendiciones`: las únicas escrituras son `registrar_rendicion` (0055),
--     `confirmar_pago_revendedor` (0055) y `registrar_venta_coordinador`
--     (0073): todas dejan `via = 'encargado'` con `tenedor_id` (encargado o
--     admin que registra, o la coordinadora) y `via` 'directo_cuenta' /
--     'cliente_directo' con `tenedor_id` null. `authenticated` solo tiene
--     select. Excepción posible: rendiciones anteriores a 0037 tienen el
--     default `via = 'encargado'` con `tenedor_id` null y 0037 no las
--     rellenó; por eso el VALIDATE puede fallar (ver abajo).
--
--   Cada CHECK va `NOT VALID` y se valida en una sentencia aparte. OJO: la
--   migración se aplica en UNA sola transacción, así que si un
--   `VALIDATE CONSTRAINT` falla se revierte TODO (función, reparación y los
--   dos CHECK): no queda nada aplicado. Correr ANTES estas consultas; tienen
--   que dar 0 filas:
--
--     select feria_id, vendedor_id, estado, cerrada_at
--     from public.feria_participantes
--     where not ((estado = 'pendiente' and cerrada_at is null
--                 and efectivo_centavos = 0 and mercado_pago_centavos = 0
--                 and banco_centavos = 0)
--             or (estado = 'cerrada' and cerrada_at is not null));
--
--     select id, vendedor_id, via, tenedor_id, fecha
--     from public.rendiciones
--     where not ((via = 'encargado' and tenedor_id is not null)
--             or (via <> 'encargado' and tenedor_id is null));
--
-- Migración sin templating, `public.` explícito (como 0072-0080) y
-- `set search_path = public` sin comillas (render multi-schema).
-- `lib/types.ts` no cambia (no hay cambios de firma ni columnas).
--
-- ============================================================
-- Cómo verificar después de aplicar (SOLO LECTURA)
-- ============================================================
--
--   select conname, convalidated from pg_constraint
--   where conname in ('feria_participantes_estado_coherente',
--                     'rendiciones_via_tenedor_coherente');   -- convalidated = true
--   select position('saldada_en' in pg_get_functiondef(oid)) > 0
--   from pg_proc where proname = 'sincronizar_deuda_aceite_lote'
--     and pronamespace = 'public'::regnamespace;               -- true
--   select has_function_privilege('authenticated',
--     'public.sincronizar_deuda_aceite_lote(uuid)', 'execute'); -- false
--   -- deudas incoherentes (esperado 0):
--   select count(*) from public.v_saldo_deuda
--   where (saldada_en is not null and restante_centavos > 0 and pagado_centavos > 0)
--      or (saldada_en is null and restante_centavos <= 0 and pagado_centavos > 0);
--
-- ============================================================
-- Rollback
-- ============================================================
--
--   alter table public.rendiciones drop constraint rendiciones_via_tenedor_coherente;
--   alter table public.feria_participantes drop constraint feria_participantes_estado_coherente;
--   -- sincronizar_deuda_aceite_lote: volver al cuerpo de 0047 (create or replace).
--   -- El bloque 1b (reparación) no se revierte solo: sólo puso `saldada_en`
--   -- en deudas de aceite con restante <= 0 y algún pago.

-- ============================================================
-- 1) sincronizar_deuda_aceite_lote — deja saldada_en coherente
-- ============================================================

create or replace function public.sincronizar_deuda_aceite_lote(p_lote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date;
  v_litros numeric;
  v_usa_usd boolean;
  v_usd_por_litro_centavos bigint;
  v_monto_usd_centavos bigint;
  v_deuda_id uuid;
  v_pagado_centavos bigint;
  v_descripcion text;
  v_nota text;
  v_monto_anterior_centavos bigint;
  v_saldada_en_anterior date;
begin
  select fecha into v_fecha from lotes_produccion where id = p_lote_id;
  if not found then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  select coalesce(sum(cantidad), 0), bool_or(descripcion is not null)
    into v_litros, v_usa_usd
  from lote_costos
  where lote_id = p_lote_id and concepto = 'aceite';

  v_monto_usd_centavos := null;
  if v_litros > 0 and v_usa_usd then
    select precio_litro_aceite_usd_centavos into v_usd_por_litro_centavos
    from lotes_produccion where id = p_lote_id;

    if v_usd_por_litro_centavos is not null then
      v_monto_usd_centavos := round(v_litros * v_usd_por_litro_centavos);
    end if;
  end if;

  select id into v_deuda_id from deudas where lote_id = p_lote_id;

  if v_monto_usd_centavos is null or v_monto_usd_centavos <= 0 then
    -- Sin USD confiable (ARS explícito, tanque, o sin litros de aceite en
    -- este lote): no se inventa una deuda. Si ya había una y no tiene
    -- pagos, se borra (el pedido dejó de tener este pasivo automático);
    -- con pagos, se deja intacta.
    if v_deuda_id is not null then
      select coalesce(pagado_centavos, 0) into v_pagado_centavos
      from v_saldo_deuda where deuda_id = v_deuda_id;

      if coalesce(v_pagado_centavos, 0) = 0 then
        delete from deudas where id = v_deuda_id;
      end if;
    end if;
    return;
  end if;

  v_descripcion := 'Pagarle al proveedor el aceite del pedido del ' || to_char(v_fecha, 'DD/MM');
  v_nota := round(v_litros, 3) || ' L a USD ' || round(v_usd_por_litro_centavos::numeric / 100, 2) || '/L';

  if v_deuda_id is null then
    insert into deudas (descripcion, moneda, monto_centavos, fecha, nota, lote_id)
    values (v_descripcion, 'USD', v_monto_usd_centavos, v_fecha, v_nota, p_lote_id);
  else
    -- Estado de la deuda ANTES de cambiar el monto (para saber si estaba
    -- saldada por estar pagada del todo, o a mano).
    select monto_centavos, saldada_en
      into v_monto_anterior_centavos, v_saldada_en_anterior
    from deudas where id = v_deuda_id
    for update;

    update deudas
    set descripcion = v_descripcion,
        monto_centavos = v_monto_usd_centavos,
        fecha = v_fecha,
        nota = v_nota
    where id = v_deuda_id;

    select coalesce(sum(monto_centavos), 0) into v_pagado_centavos
    from pagos_deuda where deuda_id = v_deuda_id;

    if v_saldada_en_anterior is not null
       and v_monto_anterior_centavos <= v_pagado_centavos
       and v_monto_usd_centavos > v_pagado_centavos then
      -- Estaba saldada por pago completo y el monto subió: vuelve a tener
      -- saldo, así que se reabre (igual que eliminar_pago_deuda, 0027).
      update deudas set saldada_en = null where id = v_deuda_id;
    elsif v_saldada_en_anterior is null
          and v_pagado_centavos > 0
          and v_monto_usd_centavos <= v_pagado_centavos then
      -- El monto bajó hasta cubrirse con lo ya pagado: queda saldada, con
      -- la fecha del último pago (misma fuente que registrar_pago_deuda,
      -- 0036; no current_date). Si el monto nuevo es menor que lo pagado,
      -- fijar_costos_lote revierte todo con DEUDA_ACEITE_MENOR_A_PAGADO.
      update deudas
      set saldada_en = (select max(fecha) from pagos_deuda where deuda_id = v_deuda_id)
      where id = v_deuda_id;
    end if;
  end if;
end;
$$;

revoke execute on function public.sincronizar_deuda_aceite_lote(uuid) from anon, authenticated, public;

-- ============================================================
-- 1b) REPARACIÓN OPCIONAL de filas ya incoherentes (idempotente)
-- ============================================================
-- Solo el caso seguro: deuda de aceite (lote_id no nulo) con algún pago,
-- sin saldada_en y restante <= 0 -> se salda con la fecha del último pago.
-- El caso inverso (saldada_en con fecha y restante > 0) NO se repara: no se
-- distingue de una deuda saldada a mano a propósito; revisar con la
-- consulta de abajo antes de tocar nada:
--   select deuda_id, saldada_en, pagado_centavos, restante_centavos
--   from public.v_saldo_deuda s join public.deudas d on d.id = s.deuda_id
--   where d.lote_id is not null and s.saldada_en is not null
--     and s.restante_centavos > 0;

update public.deudas d
set saldada_en = (select max(p.fecha) from public.pagos_deuda p where p.deuda_id = d.id)
where d.lote_id is not null
  and d.saldada_en is null
  and exists (select 1 from public.pagos_deuda p where p.deuda_id = d.id)
  and d.monto_centavos <= (select coalesce(sum(p.monto_centavos), 0) from public.pagos_deuda p where p.deuda_id = d.id);

-- ============================================================
-- 2) feria_participantes_estado_coherente
-- ============================================================

alter table public.feria_participantes
  add constraint feria_participantes_estado_coherente
  check (
    (estado = 'pendiente' and cerrada_at is null
       and efectivo_centavos = 0 and mercado_pago_centavos = 0 and banco_centavos = 0)
    or (estado = 'cerrada' and cerrada_at is not null)
  ) not valid;

-- Si hay filas viejas que lo violan, falla y se revierte toda la migración
-- (consulta en la cabecera).
alter table public.feria_participantes
  validate constraint feria_participantes_estado_coherente;

-- ============================================================
-- 3) rendiciones_via_tenedor_coherente
-- ============================================================

alter table public.rendiciones
  add constraint rendiciones_via_tenedor_coherente
  check (
    (via = 'encargado' and tenedor_id is not null)
    or (via <> 'encargado' and tenedor_id is null)
  ) not valid;

-- Si hay rendiciones viejas (pre-0037: 'encargado' con tenedor_id nulo) que
-- lo violan, falla y se revierte toda la migración; consulta en la cabecera.
alter table public.rendiciones
  validate constraint rendiciones_via_tenedor_coherente;
