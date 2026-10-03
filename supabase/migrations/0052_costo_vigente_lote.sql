-- Ananja: costo VIGENTE de un lote — permite actualizar el costo de las
-- botellas que TODAVÍA están en el depósito (costo de reposición: envase más
-- caro, dólar de hoy, etc.) sin tocar nada de lo ya entregado/vendido ni lo
-- pagado al proveedor. Plan aprobado:
-- /private/tmp/claude-501/.../scratchpad/plan-actualizar-costos-lote.md (rev. 2).
--
-- REV. 2 de esta migración (revisión adversarial): corrige un BLOCKER — el
-- costo de PRODUCCIÓN (no solo el costo Ananja) quedaba en vivo, así que la
-- ganancia de ventas viejas se seguía moviendo después de una actualización
-- — y cuatro observaciones (S1-S4, ver el detalle de cada sección abajo).
-- Nada de esto cambia el diseño de fondo (misma tabla, mismo RPC, mismas
-- pantallas) — todo el diff vive en QUÉ se congela y en cómo leen el
-- historial `v_cobranza_lote`/`v_perdidas_lote`.
--
-- REV. 3 (segunda vuelta de revisión adversarial, contra una copia real de
-- prod): corrige DOS bugs más.
--  BUG 1 (BLOCKER, la migración fallaba al aplicarse): `v_cobranza_lote`
--  cambiaba el tipo de `esperado_total_centavos` de `numeric` (el tipo real
--  en prod hoy) a `bigint` — `create or replace view` rechaza cambiar el
--  tipo de una columna ya publicada. Se revisó columna por columna, contra
--  `information_schema.columns` de prod, TODA vista que esta migración
--  toca (ver la tabla en el informe de esta tanda) — el único tipo que
--  no coincidía era este.
--  BUG 2: en `v_margen_ventas`, las columnas de SALIDA
--  `costo_produccion_unitario_centavos`/`costo_ananja_unitario_centavos`
--  mostraban SIEMPRE el costo en vivo del lote (ignorando la foto de la
--  venta), aunque `ingreso_ananja_centavos`/`margen_ananja_centavos` ya
--  usaran la foto correctamente — varias ventas con fotos DISTINTAS
--  terminaban mostrando el mismo número (el vigente de hoy) después de
--  actualizar costos. Mismo espejo en `lib/margen.ts`.
--
-- Decisiones de Fran (dueño), cerradas:
--  - Actualizar costos es LOTE POR LOTE y afecta SOLO las botellas que
--    siguen en el depósito. Lo ya entregado o vendido conserva su costo
--    congelado (su "foto") — costo Ananja Y costo de producción, los dos
--    (rev. 2: el primer intento solo congelaba el costo Ananja).
--  - Se carga con el MISMO modelo del formulario de costos del pedido
--    (mismo p_costos que fijar_costos_lote) y la app recalcula costo real,
--    Ananja y sugeridos.
--  - Los márgenes (ganancia/mayorista/minorista %) son EDITABLES en la
--    actualización, precargados con los vigentes.
--  - Nunca toca lote_costos, gastos, deudas, lotes_produccion, a_pagar,
--    saldo por concepto (0038/0039), deuda de aceite (0047) ni la regla de
--    IVA del envase (0048) — eso sigue siendo "con qué se compró
--    REALMENTE este pedido", lo pagado no cambia.
--  - Historial append-only (lote_valoraciones), con fecha y quién, solo de
--    consulta — sin revertir.
--  - Lo histórico (ventas ya hechas, pérdidas ya registradas) NUNCA se
--    revalúa con el costo de HOY — cada cosa queda valuada con el costo
--    vigente AL MOMENTO en que pasó, no con el de la actualización más
--    reciente (S1).
--
-- Alcance de esta migración:
--  A) Congelamiento de `comprobante_items` Y `entrega_items` (rev. 2: los
--     dos, no solo comprobante_items): columnas
--     `costo_lote_unitario_centavos` (costo Ananja, `entrega_items` ya la
--     tenía desde 0044) y `costo_produccion_unitario_centavos` (costo de
--     PRODUCCIÓN, nueva en las dos tablas — BLOCKER de la revisión
--     adversarial), trigger BEFORE INSERT en cada tabla,
--     `completar_fotos_costo_lote()` generalizada para completar las dos
--     columnas en las dos tablas, y `v_margen_ventas`/`v_costo_lote_venta`
--     usando ambas fotos. Sin esto, "actualizar costos" (o cualquier otro
--     cambio de costo de un lote) mueve retroactivamente la ganancia de
--     TODO lo ya vendido — visible en /ganancia.
--  B) BACKFILL de las filas YA EXISTENTES de `comprobante_items`/
--     `entrega_items` con el costo ORIGINAL vigente HOY (antes de que
--     exista ninguna valoración): (1) fotos que faltan por completo
--     (lote con costo completo y venta sin foto tomada todavía — en prod
--     hoy, 0 filas: los únicos `entrega_items` sin foto son devoluciones,
--     que nunca la llevan por diseño) y (2) el costo de PRODUCCIÓN de las
--     fotos de costo Ananja que YA EXISTÍAN antes de esta migración (10
--     `entrega_items` en prod, ver el conteo de la sección B) — sin esto,
--     esas ventas viejas quedarían con costo Ananja congelado pero costo
--     de producción en vivo, exactamente el BLOCKER que corrige esta rev.
--  C) `public.calcular_costos_lote` — función PURA (sin insertar/actualizar/
--     borrar nada) extraída de `public.aplicar_costos_lote`, que hace
--     EXACTAMENTE el mismo cálculo (misma precedencia de aceite, mismo IVA,
--     mismos redondeos de envase/transporte) pero devuelve las filas en vez
--     de escribirlas. `aplicar_costos_lote` pasa a ser un wrapper que borra
--     + inserta desde `calcular_costos_lote` + sincroniza la deuda de aceite
--     — mismo comportamiento exacto de hoy para `fijar_costos_lote`/
--     `crear_lote`, cero cambio. (Sin cambios en la rev. 2.)
--  D) Tabla `lote_valoraciones` (append-only) + vista `v_costo_lote_vigente`
--     (superset de `v_costo_lote_desglose`: sin ninguna actualización, es
--     IDÉNTICA — por eso se puede usar como reemplazo directo en todos los
--     consumidores "en vivo") + RPC `actualizar_costo_lote_vigente` (solo
--     admin, nunca toca lote_costos/gastos/deudas/lotes_produccion; rev. 2:
--     ahora bloquea la fila del lote con `for update`, mismo patrón que
--     `fijar_costos_lote`, para serializarse con una edición de costos
--     concurrente).
--  E) Consumidores de `v_costo_lote_desglose`/costos en vivo:
--     `entrega_items_foto_costo_lote()`/`comprobante_items_foto_costo_lote()`
--     y `completar_fotos_costo_lote()` pasan a `v_costo_lote_vigente` (el
--     costo de HOY, correcto para una foto que se toma AHORA);
--     `v_costo_lote_venta`/`v_margen_ventas` usan las fotos (Ananja Y
--     producción) con fallback a la vigente solo si la venta no tiene
--     ninguna; `v_cobranza_lote` usa las fotos para lo ya
--     entregado/vendido y la vigente solo para lo que sigue en depósito
--     (S1); `v_perdidas_lote` valúa cada egreso con el costo vigente AL
--     MOMENTO de ese movimiento — la última valoración anterior a esa
--     fecha, o el original si no había ninguna todavía (S1, rev. 2: antes
--     usaba la vigente de HOY para todo el historial).
--
-- Nota sobre `lote_valoraciones` y RLS: la policy de `select` es
-- `es_vendedor()` — en este proyecto (`supabase/auth-hooks` o
-- equivalente) `es_vendedor()` es HOY exactamente `es_admin()` (no hay
-- revendedores con acceso a costos vía esta función; la separación
-- vendedor/admin de otras tablas como `lote_costos` es la misma función
-- por el mismo motivo), así que el resultado práctico es "solo admin" —
-- intencional, sin cambios de código: se documenta acá para que quede
-- claro que no es un descuido, es el mismo criterio que ya usa
-- `lote_costos`.
--
-- S4 (revisión adversarial): los `grant`/`revoke` de las vistas nuevas y
-- recreadas dejan `select` únicamente para `authenticated` (y ningún
-- privilegio para `anon`/`public`) — intencional en TODOS los casos, mismo
-- criterio que ya usan `v_costo_lote_desglose`/`v_margen_ventas`/etc.
-- (0029/0031): estas vistas exponen costos y márgenes, nunca deben ser
-- públicas. `security_invoker = true` en todas hace que la policy de la
-- tabla de base (`lote_costos`/`lote_valoraciones`, `es_vendedor()`) sea la
-- que realmente filtra fila por fila — la vista en sí no agrega ni quita
-- acceso.
--
-- Migración sin templating (mismo criterio que 0049/0050): hardcodea
-- `public.` y `search_path = public` — Ananja es hoy el único negocio activo
-- (schema `miel` en pausa).

-- ============================================================
-- A.1) Columnas de foto — costo_lote_unitario_centavos (costo ANANJA;
--      comprobante_items no la tenía, entrega_items sí desde 0044) +
--      costo_produccion_unitario_centavos (costo de PRODUCCIÓN, NUEVA en
--      las dos tablas — BLOCKER de la revisión adversarial: sin esto,
--      margen_ananja_centavos = foto_ananja − producción EN VIVO seguía
--      moviéndose después de actualizar costos, aunque el ingreso ya
--      estuviera congelado).
-- ============================================================

alter table comprobante_items add column costo_lote_unitario_centavos bigint;
alter table comprobante_items add column costo_produccion_unitario_centavos bigint;
alter table entrega_items add column costo_produccion_unitario_centavos bigint;

-- ============================================================
-- A.2) Triggers BEFORE INSERT — mismo criterio en las dos tablas: ambas
--      columnas se congelan JUNTAS (la misma condición gatilla las dos, o
--      ninguna) leyendo `v_costo_lote_vigente` (el costo de HOY es correcto
--      para una foto que se toma AHORA — no hace falta pasar primero por
--      `v_costo_lote_desglose`: en el momento de crear esta migración las
--      dos vistas son idénticas, todavía no existe ninguna valoración).
--      `entrega_items_foto_costo_lote()` (0044, con la condición de "tipo
--      entrega" — una devolución no congela nada) se redefine más abajo,
--      junto con el resto de la sección E; acá solo la versión nueva de
--      comprobante_items (sin esa condición: un comprobante siempre es una
--      venta directa).
-- ============================================================

create function public.comprobante_items_foto_costo_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.costo_lote_unitario_centavos := null;
  new.costo_produccion_unitario_centavos := null;
  if new.lote_id is not null
     and public.lote_costos_completos(new.lote_id, new.producto_id) then
    select d.costo_ananja_centavos, d.costo_unitario_centavos
      into new.costo_lote_unitario_centavos, new.costo_produccion_unitario_centavos
    from v_costo_lote_vigente d
    where d.lote_id = new.lote_id and d.producto_id = new.producto_id and d.tiene_costos;
  end if;
  return new;
end;
$$;

create trigger trg_comprobante_items_foto_costo_lote
  before insert on comprobante_items
  for each row execute function public.comprobante_items_foto_costo_lote();

-- ============================================================
-- B) BACKFILL — con el costo ORIGINAL vigente HOY (v_costo_lote_desglose;
--    en este punto de la migración es idéntica a v_costo_lote_vigente,
--    todavía no existe lote_valoraciones). Dos backfills distintos:
--
--    B.1) Fotos que faltan POR COMPLETO (venta con lote asignado, lote ya
--    completo, sin ninguna de las dos columnas todavía) — mismo criterio
--    que el trigger/`completar_fotos_costo_lote` de siempre: una fila de
--    un lote incompleto se queda con foto null y sigue cayendo al
--    fallback "en vivo" hasta que se complete. Relevamiento en prod antes
--    de aplicar (SELECT de solo lectura, 2026-09-16): 0 comprobante_items
--    con lote_id asignado (la base se vació el 2026-09-12 para arrancar
--    limpio, y las ventas directas del admin no vienen asignando lote
--    todavía). 0 entrega_items de tipo 'entrega' sin foto con el lote
--    completo — las 4 filas que en un principio parecían "sin fotografiar"
--    son en realidad DEVOLUCIONES (entregas_revendedor.tipo =
--    'devolucion'), que por diseño nunca llevan foto (ver
--    entrega_items_foto_costo_lote, más abajo) — corrección de la revisión
--    adversarial a un comentario anterior que las contaba mal. Este
--    UPDATE no toca ninguna fila hoy en prod, pero es obligatorio igual
--    para cualquier dato futuro y para que la migración sea correcta si se
--    corre contra otro estado de la base.
--
--    B.2) `costo_produccion_unitario_centavos` de las fotos de costo
--    ANANJA que YA EXISTÍAN antes de esta migración (columna nueva, sin
--    trigger que la hubiera podido completar todavía) — BLOCKER de la
--    revisión adversarial: sin este backfill, esas ventas viejas
--    quedarían con el costo Ananja congelado pero el costo de producción
--    en vivo, así que `margen_ananja_centavos` se seguiría moviendo con
--    cada actualización. Relevamiento en prod (SELECT de solo lectura,
--    2026-09-16): 10 `entrega_items` con `costo_lote_unitario_centavos`
--    ya cargado (fotos reales de 0044) y 0 `comprobante_items` (la columna
--    de costo Ananja es nueva en esta misma migración, ver B.1 — nunca
--    tuvo valores previos). Se backfillea con el costo de producción
--    ORIGINAL de HOY (`v_costo_lote_desglose`, no hay otra fuente: el
--    valor exacto vigente el día de cada entrega no quedó registrado en
--    ningún lado antes de esta migración) — misma limitación que ya
--    acepta el backfill de la foto Ananja original (0044 nunca guardó de
--    dónde salió cada número).
-- ============================================================

update comprobante_items ci
set costo_lote_unitario_centavos = d.costo_ananja_centavos,
    costo_produccion_unitario_centavos = d.costo_unitario_centavos
from v_costo_lote_desglose d
where ci.lote_id is not null
  and ci.costo_lote_unitario_centavos is null
  and d.lote_id = ci.lote_id
  and d.producto_id = ci.producto_id
  and d.tiene_costos
  and public.lote_costos_completos(ci.lote_id, ci.producto_id);

update entrega_items ei
set costo_lote_unitario_centavos = d.costo_ananja_centavos,
    costo_produccion_unitario_centavos = d.costo_unitario_centavos
from entregas_revendedor e, v_costo_lote_desglose d
where ei.lote_id is not null
  and ei.costo_lote_unitario_centavos is null
  and e.id = ei.entrega_id
  and e.tipo = 'entrega'
  and d.lote_id = ei.lote_id
  and d.producto_id = ei.producto_id
  and d.tiene_costos
  and public.lote_costos_completos(ei.lote_id, ei.producto_id);

-- B.2: costo de producción de las fotos Ananja YA EXISTENTES (10
-- entrega_items en prod hoy) — mismo lote_id/producto_id de la propia fila,
-- no hace falta pasar por entregas_revendedor.tipo (ya tiene la foto
-- Ananja cargada, así que en su momento SÍ pasó ese filtro).
update entrega_items ei
set costo_produccion_unitario_centavos = d.costo_unitario_centavos
from v_costo_lote_desglose d
where ei.costo_lote_unitario_centavos is not null
  and ei.costo_produccion_unitario_centavos is null
  and d.lote_id = ei.lote_id
  and d.producto_id = ei.producto_id
  and d.tiene_costos;

-- ============================================================
-- C) public.calcular_costos_lote — función PURA extraída del cuerpo VIGENTE
--    de public.aplicar_costos_lote (tomado con pg_get_functiondef contra
--    prod, no el .sql de 0038/0047/0048 — esas migraciones la redefinieron
--    varias veces). Mismo cálculo exacto, línea por línea, CON UNA
--    diferencia estructural obligatoria: la rama de transporte % con
--    redondeo (0038) hace, en el original, INSERT de una fila por
--    presentación y DESPUÉS un UPDATE que la relee de la tabla para
--    reescalarla (`v_base_transporte` se lee con un SELECT contra
--    lote_costos, y el redondeo hace floor()+resto sobre las filas YA
--    insertadas). Una función que solo devuelve filas (return next) no
--    puede "releer" lo que todavía no insertó en ningún lado — se
--    reemplaza por un arreglo en memoria (`v_transporte_montos`/
--    `v_transporte_productos`) que hace EXACTAMENTE la misma cuenta (mismo
--    floor, mismo desempate "línea más grande por monto ORIGINAL desc,
--    producto_id asc", mismo resto a esa línea) sin tocar ninguna tabla.
--    Ver el informe de esta tanda para el mapeo línea por línea contra el
--    original y la verificación numérica contra un lote real.
--
--    Tampoco persiste `lotes_produccion.envase_cobrado_sin_iva` (el
--    original sí lo hace cuando `p_costos.envase_cobrado_sin_iva` viene
--    explícito) — ese UPDATE se movió al wrapper `aplicar_costos_lote`
--    (abajo), que sigue siendo la única función que escribe algo: acá solo
--    se LEE el valor guardado como fallback cuando el parámetro no viene,
--    igual que el original.
--
--    Devuelve una fila por concepto (mismo shape que lote_costos, sin
--    id/created_at ni lote_id explícito — el caller ya lo conoce).
-- ============================================================

create function public.calcular_costos_lote(
  p_lote_id uuid,
  p_costos jsonb
)
returns table (
  producto_id uuid,
  concepto text,
  descripcion text,
  cantidad numeric,
  costo_unitario_centavos bigint,
  neto_centavos bigint,
  envio_centavos bigint,
  total_centavos bigint,
  se_paga boolean,
  insumo_id uuid,
  a_pagar_centavos bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iva_pct numeric;
  v_incluye_iva boolean;
  v_dolar_centavos bigint;
  v_usd_por_litro_centavos bigint;
  v_envase_sin_iva_guardado boolean;
  v_envase_sin_iva_param boolean;
  v_envase_modo_nuevo boolean;
  v_envase_sin_iva boolean;
  v_precio_litro_global bigint;
  v_precio_litro_item bigint;
  v_aceite_descripcion text;
  v_transporte_pct numeric;
  v_transporte_fijo bigint;
  v_otros bigint;
  v_otros_desc text;
  v_item record;
  v_litros numeric;
  v_monto bigint;
  v_gross bigint;
  v_envase jsonb;
  v_envase_producto_id uuid;
  v_envase_precio bigint;
  v_envase_cantidad int;
  v_envase_calculado bigint;
  v_envase_redondeo bigint;
  v_envase_cobrado bigint;
  v_envase_total bigint;
  v_envase_unitario bigint;
  v_envases_vistos uuid[] := '{}';
  v_etiquetas jsonb;
  v_etiqueta jsonb;
  v_etiqueta_insumo_id uuid;
  v_etiqueta_precio bigint;
  v_etiqueta_envio bigint;
  v_etiquetas_vistas uuid[] := '{}';
  v_precio_etiqueta_legacy bigint;
  v_receta record;
  v_base_transporte bigint;
  v_redondeos jsonb;
  v_redondeo jsonb;
  v_redondeo_concepto text;
  v_redondeo_monto bigint;
  v_redondeo_producto_id uuid;
  v_redondeo_envase jsonb := '{}'::jsonb;
  v_redondeo_transporte bigint;
  v_clave text;
  -- Reemplazan la relectura de la tabla lote_costos del original (ver
  -- comentario de arriba): v_base_por_producto acumula, POR PRODUCTO,
  -- aceite+etiqueta+envase a medida que se van devolviendo esas filas —
  -- mismo total que "select sum(total_centavos) ... where concepto in
  -- ('aceite','envase','etiqueta')" del original, sin volver a leer nada.
  v_base_por_producto jsonb := '{}'::jsonb;
  v_transporte_productos uuid[] := '{}';
  v_transporte_montos bigint[] := '{}';
  v_transporte_suma bigint;
  v_transporte_reescalado bigint;
  v_transporte_mayor_idx int;
  v_idx int;
  v_transporte_desc text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_transporte_pct := nullif(p_costos->>'transporte_pct', '')::numeric;
  v_transporte_fijo := nullif(p_costos->>'transporte_centavos', '')::bigint;
  if v_transporte_pct is not null and v_transporte_fijo is not null then
    raise exception 'TRANSPORTE_AMBIGUO';
  end if;

  select l.iva_pct, l.precios_incluyen_iva, l.dolar_centavos, l.precio_litro_aceite_usd_centavos, l.envase_cobrado_sin_iva
    into v_iva_pct, v_incluye_iva, v_dolar_centavos, v_usd_por_litro_centavos, v_envase_sin_iva_guardado
  from lotes_produccion l where l.id = p_lote_id;

  -- Envase (0038/0048): SOLO lectura acá — a diferencia del original, NO
  -- persiste envase_cobrado_sin_iva (ver el comentario de la función).
  v_envase_sin_iva_param := nullif(p_costos->>'envase_cobrado_sin_iva', '')::boolean;
  if v_envase_sin_iva_param is not null then
    v_envase_modo_nuevo := true;
    v_envase_sin_iva := v_envase_sin_iva_param;
  else
    v_envase_sin_iva := coalesce(v_envase_sin_iva_guardado, false);
    v_envase_modo_nuevo := v_envase_sin_iva;
  end if;

  -- Redondeos (0038): se validan TODOS antes de calcular nada — idéntico al
  -- original, no depende de ninguna tabla.
  v_redondeos := coalesce(p_costos->'redondeos', '[]'::jsonb);
  if jsonb_typeof(v_redondeos) <> 'array' then
    raise exception 'REDONDEO_INVALIDO';
  end if;

  for v_redondeo in select * from jsonb_array_elements(v_redondeos)
  loop
    v_redondeo_concepto := v_redondeo->>'concepto';
    v_redondeo_monto := nullif(v_redondeo->>'monto_centavos', '')::bigint;

    if v_redondeo_monto is null or v_redondeo_monto <= 0 then
      raise exception 'REDONDEO_INVALIDO'
        using detail = json_build_object('concepto', v_redondeo_concepto)::text;
    end if;

    if v_redondeo_concepto = 'envase' then
      v_redondeo_producto_id := nullif(v_redondeo->>'producto_id', '')::uuid;
      if v_redondeo_producto_id is null or v_redondeo_envase ? v_redondeo_producto_id::text then
        raise exception 'REDONDEO_INVALIDO'
          using detail = json_build_object('concepto', 'envase')::text;
      end if;
      v_redondeo_envase := v_redondeo_envase || jsonb_build_object(v_redondeo_producto_id::text, v_redondeo_monto);
    elsif v_redondeo_concepto = 'transporte' then
      if v_redondeo_transporte is not null or v_transporte_pct is null or v_transporte_pct <= 0 then
        raise exception 'REDONDEO_INVALIDO'
          using detail = json_build_object('concepto', 'transporte')::text;
      end if;
      v_redondeo_transporte := v_redondeo_monto;
    else
      raise exception 'REDONDEO_INVALIDO'
        using detail = json_build_object('concepto', v_redondeo_concepto)::text;
    end if;
  end loop;

  -- Aceite: sin cambios de cálculo respecto del original.
  v_precio_litro_global := nullif(p_costos->>'precio_litro_aceite_centavos', '')::bigint;
  v_aceite_descripcion := null;
  if v_precio_litro_global is null and v_dolar_centavos is not null and v_usd_por_litro_centavos is not null then
    v_precio_litro_global := round(v_usd_por_litro_centavos * v_dolar_centavos / 100.0);
    v_aceite_descripcion := 'USD ' || round(v_usd_por_litro_centavos::numeric / 100, 2)
      || '/L × $' || round(v_dolar_centavos::numeric / 100, 2);
  end if;

  for v_item in
    select li.producto_id, li.cantidad, p.presentacion_ml
    from lote_items li join productos p on p.id = li.producto_id
    where li.lote_id = p_lote_id
  loop
    v_precio_litro_item := v_precio_litro_global;
    if v_precio_litro_item is null then
      select t.costo_promedio_centavos_por_litro into v_precio_litro_item
      from recetas r
      join insumos i on i.id = r.insumo_id and i.tipo = 'materia_prima'
      join v_tanque_aceite t on t.insumo_id = i.id
      where r.producto_id = v_item.producto_id
      order by r.insumo_id
      limit 1;
    end if;

    if v_precio_litro_item is not null then
      v_litros := (v_item.presentacion_ml / 1000.0) * v_item.cantidad;
      v_monto := round(v_litros * v_precio_litro_item);

      producto_id := v_item.producto_id;
      concepto := 'aceite';
      descripcion := v_aceite_descripcion;
      cantidad := v_litros;
      costo_unitario_centavos := v_precio_litro_item;
      neto_centavos := null;
      envio_centavos := null;
      total_centavos := v_monto;
      se_paga := false;
      insumo_id := null;
      a_pagar_centavos := null;
      return next;

      v_base_por_producto := jsonb_set(
        v_base_por_producto, array[v_item.producto_id::text],
        to_jsonb(coalesce((v_base_por_producto->>v_item.producto_id::text)::bigint, 0) + v_monto)
      );
    end if;
  end loop;

  -- Etiquetas: sin cambios de cálculo respecto del original.
  v_etiquetas := coalesce(p_costos->'etiquetas', '[]'::jsonb);
  v_precio_etiqueta_legacy := nullif(p_costos->>'precio_etiqueta_centavos', '')::bigint;

  if jsonb_array_length(v_etiquetas) = 0 and v_precio_etiqueta_legacy is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'insumo_id', sub.insumo_id,
      'precio_unitario_centavos', v_precio_etiqueta_legacy,
      'envio_unitario_centavos', 0
    )), '[]'::jsonb)
    into v_etiquetas
    from (
      select distinct r.insumo_id
      from recetas r
      join insumos i on i.id = r.insumo_id and i.tipo = 'etiqueta'
      join lote_items li on li.producto_id = r.producto_id and li.lote_id = p_lote_id
    ) sub;
  end if;

  for v_etiqueta in select * from jsonb_array_elements(v_etiquetas)
  loop
    v_etiqueta_insumo_id := (v_etiqueta->>'insumo_id')::uuid;
    v_etiqueta_precio := (v_etiqueta->>'precio_unitario_centavos')::bigint;
    v_etiqueta_envio := coalesce(nullif(v_etiqueta->>'envio_unitario_centavos', '')::bigint, 0);

    if v_etiqueta_insumo_id is null or v_etiqueta_precio is null or v_etiqueta_precio < 0 or v_etiqueta_envio < 0 then
      raise exception 'COSTO_ETIQUETA_INVALIDO';
    end if;

    if v_etiqueta_insumo_id = any(v_etiquetas_vistas) then
      raise exception 'COSTO_ETIQUETA_DUPLICADO';
    end if;
    v_etiquetas_vistas := array_append(v_etiquetas_vistas, v_etiqueta_insumo_id);

    if v_incluye_iva then
      v_gross := v_etiqueta_precio;
    else
      v_gross := round(v_etiqueta_precio * (100 + v_iva_pct) / 100);
    end if;

    for v_receta in
      select r.producto_id, r.cantidad as unidades_por_botella, li.cantidad as botellas
      from recetas r
      join lote_items li on li.producto_id = r.producto_id and li.lote_id = p_lote_id
      where r.insumo_id = v_etiqueta_insumo_id
    loop
      v_monto := round((v_gross + v_etiqueta_envio) * (v_receta.unidades_por_botella * v_receta.botellas));

      producto_id := v_receta.producto_id;
      concepto := 'etiqueta';
      descripcion := case when v_incluye_iva then null else 'IVA ' || v_iva_pct || '% aplicado sobre el precio neto (envío sin IVA)' end;
      cantidad := v_receta.unidades_por_botella * v_receta.botellas;
      costo_unitario_centavos := v_gross + v_etiqueta_envio;
      neto_centavos := v_etiqueta_precio;
      envio_centavos := v_etiqueta_envio;
      total_centavos := v_monto;
      se_paga := false;
      insumo_id := v_etiqueta_insumo_id;
      a_pagar_centavos := null;
      return next;

      v_base_por_producto := jsonb_set(
        v_base_por_producto, array[v_receta.producto_id::text],
        to_jsonb(coalesce((v_base_por_producto->>v_receta.producto_id::text)::bigint, 0) + v_monto)
      );
    end loop;
  end loop;

  -- Envase: sin cambios de cálculo respecto del original.
  if jsonb_array_length(coalesce(p_costos->'envases', '[]'::jsonb)) > 0 then
    for v_envase in select * from jsonb_array_elements(p_costos->'envases')
    loop
      v_envase_producto_id := (v_envase->>'producto_id')::uuid;
      v_envase_precio := (v_envase->>'precio_unitario_centavos')::bigint;

      if v_envase_producto_id is null or v_envase_precio is null or v_envase_precio < 0 then
        raise exception 'COSTO_ENVASE_INVALIDO';
      end if;

      if v_envase_producto_id = any(v_envases_vistos) then
        raise exception 'COSTO_ENVASE_DUPLICADO';
      end if;
      v_envases_vistos := array_append(v_envases_vistos, v_envase_producto_id);

      select li.cantidad into v_envase_cantidad
      from lote_items li where li.lote_id = p_lote_id and li.producto_id = v_envase_producto_id;
      if not found then
        raise exception 'PRODUCTO_NO_EN_LOTE';
      end if;

      if v_envase_modo_nuevo then
        v_gross := v_envase_precio;
      elsif v_incluye_iva then
        v_gross := v_envase_precio;
      else
        v_gross := round(v_envase_precio * (100 + v_iva_pct) / 100);
      end if;

      v_envase_calculado := v_gross * v_envase_cantidad;

      if v_envase_modo_nuevo and v_envase_sin_iva then
        v_envase_calculado := round(v_envase_calculado * (100 + v_iva_pct) / 100);
      end if;

      v_envase_redondeo := nullif(v_redondeo_envase->>v_envase_producto_id::text, '')::bigint;
      v_envase_cobrado := coalesce(v_envase_redondeo, v_envase_calculado);
      v_envase_total := v_envase_cobrado;

      if not v_envase_modo_nuevo and v_envase_redondeo is null then
        v_envase_unitario := v_gross;
      else
        v_envase_unitario := round(v_envase_total::numeric / v_envase_cantidad);
      end if;

      producto_id := v_envase_producto_id;
      concepto := 'envase';
      descripcion := nullif(concat_ws(' · ',
        case
          when v_envase_modo_nuevo and v_envase_sin_iva
            then 'Precio sin IVA, IVA ' || v_iva_pct || '% sumado al costo y a lo que se le paga'
          when not v_envase_modo_nuevo and not v_incluye_iva
            then 'IVA ' || v_iva_pct || '% aplicado sobre el precio neto'
        end,
        case when v_envase_redondeo is not null
          then 'Redondeo: calculado $' || round(v_envase_calculado::numeric / 100, 2)
        end
      ), '');
      cantidad := v_envase_cantidad;
      costo_unitario_centavos := v_envase_unitario;
      neto_centavos := v_envase_precio;
      envio_centavos := null;
      total_centavos := v_envase_total;
      se_paga := true;
      insumo_id := null;
      a_pagar_centavos := v_envase_cobrado;
      return next;

      v_base_por_producto := jsonb_set(
        v_base_por_producto, array[v_envase_producto_id::text],
        to_jsonb(coalesce((v_base_por_producto->>v_envase_producto_id::text)::bigint, 0) + v_envase_total)
      );
    end loop;
  end if;

  for v_clave in select jsonb_object_keys(v_redondeo_envase)
  loop
    if not (v_clave::uuid = any(v_envases_vistos)) then
      raise exception 'REDONDEO_INVALIDO'
        using detail = json_build_object('concepto', 'envase', 'producto_id', v_clave)::text;
    end if;
  end loop;

  -- Transporte: % -> línea directa por presentación, base = aceite + envase
  -- + etiquetas de ESA presentación (acumulada en v_base_por_producto en vez
  -- de releída de lote_costos — mismo total, ver el comentario de arriba).
  -- Fijo -> línea compartida, sin cambios.
  if v_transporte_pct is not null and v_transporte_pct > 0 then
    for v_item in
      select li.producto_id
      from lote_items li where li.lote_id = p_lote_id
    loop
      v_base_transporte := coalesce((v_base_por_producto->>v_item.producto_id::text)::bigint, 0);

      if v_base_transporte > 0 then
        v_monto := round(v_base_transporte * v_transporte_pct / 100);
        v_transporte_productos := array_append(v_transporte_productos, v_item.producto_id);
        v_transporte_montos := array_append(v_transporte_montos, v_monto);
      end if;
    end loop;

    v_transporte_desc := v_transporte_pct || '% sobre aceite + envasado + etiquetas';

    if v_redondeo_transporte is not null then
      v_transporte_suma := 0;
      for v_idx in 1..coalesce(array_length(v_transporte_montos, 1), 0) loop
        v_transporte_suma := v_transporte_suma + v_transporte_montos[v_idx];
      end loop;

      if v_transporte_suma <= 0 then
        raise exception 'REDONDEO_INVALIDO'
          using detail = json_build_object('concepto', 'transporte')::text;
      end if;

      -- La línea más grande se elige con los montos ORIGINALES (antes del
      -- floor) — mismo desempate que el original (`order by total_centavos
      -- desc, producto_id`): monto mayor gana, empate lo resuelve el
      -- producto_id MENOR.
      v_transporte_mayor_idx := 1;
      for v_idx in 2..array_length(v_transporte_montos, 1) loop
        if v_transporte_montos[v_idx] > v_transporte_montos[v_transporte_mayor_idx]
           or (v_transporte_montos[v_idx] = v_transporte_montos[v_transporte_mayor_idx]
               and v_transporte_productos[v_idx] < v_transporte_productos[v_transporte_mayor_idx])
        then
          v_transporte_mayor_idx := v_idx;
        end if;
      end loop;

      for v_idx in 1..array_length(v_transporte_montos, 1) loop
        v_transporte_montos[v_idx] := floor(v_transporte_montos[v_idx]::numeric * v_redondeo_transporte / v_transporte_suma)::bigint;
      end loop;

      v_transporte_reescalado := 0;
      for v_idx in 1..array_length(v_transporte_montos, 1) loop
        v_transporte_reescalado := v_transporte_reescalado + v_transporte_montos[v_idx];
      end loop;

      v_transporte_montos[v_transporte_mayor_idx] :=
        v_transporte_montos[v_transporte_mayor_idx] + (v_redondeo_transporte - v_transporte_reescalado);

      v_transporte_desc := v_transporte_desc || ' · Redondeo: calculado $' || round(v_transporte_suma::numeric / 100, 2);
    end if;

    for v_idx in 1..coalesce(array_length(v_transporte_montos, 1), 0) loop
      producto_id := v_transporte_productos[v_idx];
      concepto := 'transporte';
      descripcion := v_transporte_desc;
      cantidad := null;
      costo_unitario_centavos := null;
      neto_centavos := null;
      envio_centavos := null;
      total_centavos := v_transporte_montos[v_idx];
      se_paga := true;
      insumo_id := null;
      a_pagar_centavos := v_transporte_montos[v_idx];
      return next;
    end loop;
  elsif v_transporte_fijo is not null and v_transporte_fijo > 0 then
    producto_id := null;
    concepto := 'transporte';
    descripcion := null;
    cantidad := null;
    costo_unitario_centavos := null;
    neto_centavos := null;
    envio_centavos := null;
    total_centavos := v_transporte_fijo;
    se_paga := true;
    insumo_id := null;
    a_pagar_centavos := v_transporte_fijo;
    return next;
  end if;

  -- Otros: sin cambios de cálculo respecto del original.
  v_otros := nullif(p_costos->>'otros_centavos', '')::bigint;
  v_otros_desc := p_costos->>'otros_descripcion';
  if v_otros is not null and v_otros > 0 then
    producto_id := null;
    concepto := 'otro';
    descripcion := nullif(btrim(v_otros_desc), '');
    cantidad := null;
    costo_unitario_centavos := null;
    neto_centavos := null;
    envio_centavos := null;
    total_centavos := v_otros;
    se_paga := true;
    insumo_id := null;
    a_pagar_centavos := v_otros;
    return next;
  end if;
end;
$$;

revoke execute on function public.calcular_costos_lote(uuid, jsonb) from anon, authenticated, public;

-- ============================================================
-- C.2) public.aplicar_costos_lote — pasa a ser un wrapper de
--      calcular_costos_lote: borra + inserta desde la función pura +
--      persiste envase_cobrado_sin_iva (el único efecto secundario que
--      calcular_costos_lote ya NO hace, ver su comentario) + sincroniza la
--      deuda de aceite (0047, sin cambios). Mismo comportamiento exacto de
--      hoy para fijar_costos_lote/crear_lote — refactor puro, misma firma.
-- ============================================================

create or replace function public.aplicar_costos_lote(
  p_lote_id uuid,
  p_costos jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if nullif(p_costos->>'envase_cobrado_sin_iva', '')::boolean is not null then
    update lotes_produccion
    set envase_cobrado_sin_iva = nullif(p_costos->>'envase_cobrado_sin_iva', '')::boolean
    where id = p_lote_id;
  end if;

  delete from lote_costos where lote_id = p_lote_id;

  insert into lote_costos (
    lote_id, producto_id, concepto, descripcion, cantidad,
    costo_unitario_centavos, neto_centavos, envio_centavos, total_centavos,
    se_paga, insumo_id, a_pagar_centavos
  )
  select
    p_lote_id, c.producto_id, c.concepto, c.descripcion, c.cantidad,
    c.costo_unitario_centavos, c.neto_centavos, c.envio_centavos, c.total_centavos,
    c.se_paga, c.insumo_id, c.a_pagar_centavos
  from public.calcular_costos_lote(p_lote_id, p_costos) c;

  perform public.sincronizar_deuda_aceite_lote(p_lote_id);
end;
$$;

revoke execute on function public.aplicar_costos_lote(uuid, jsonb) from anon, authenticated, public;

-- ============================================================
-- D.1) lote_valoraciones — historial append-only de actualizaciones de
--      costo vigente. Una fila por producto por cada actualización. Nunca
--      se actualiza ni se borra desde el cliente (solo vía el RPC de abajo,
--      security definer).
-- ============================================================

create table lote_valoraciones (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes_produccion(id) on delete cascade,
  producto_id uuid not null references productos(id),
  aceite_centavos bigint not null,
  etiqueta_centavos bigint not null,
  envase_centavos bigint not null,
  transporte_centavos bigint not null,
  otros_centavos bigint not null,
  total_centavos bigint not null,
  costo_unitario_centavos bigint not null,
  costo_ananja_centavos bigint not null,
  precio_mayorista_sugerido_centavos bigint not null,
  precio_minorista_sugerido_centavos bigint not null,
  ganancia_pct numeric not null,
  mayorista_pct numeric not null,
  minorista_pct numeric not null,
  -- p_costos tal como se mandó, para auditoría/replay — no se usa para
  -- servir ninguna pantalla, es un respaldo.
  costos_jsonb jsonb not null,
  nota text,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_lote_valoraciones_lote_producto
  on lote_valoraciones(lote_id, producto_id, created_at desc);

alter table lote_valoraciones enable row level security;
revoke all on lote_valoraciones from anon, authenticated, public;
grant select on lote_valoraciones to authenticated;

-- Misma policy que lote_costos (es_vendedor() — ver el comentario al
-- principio del archivo: HOY, en este proyecto, es_vendedor() es
-- literalmente `select public.es_admin()`, así que el resultado práctico
-- es "solo admin", igual que el resto de las funciones de costos).
create policy lote_valoraciones_select on lote_valoraciones for select to authenticated
  using (public.es_vendedor());
-- Sin insert/update/delete para el cliente: el alta es solo vía
-- actualizar_costo_lote_vigente (security definer), y es append-only (no
-- hay ningún UPDATE/DELETE ni siquiera del lado del servidor).

-- ============================================================
-- D.2) v_costo_lote_vigente — superset de v_costo_lote_desglose: sin
--      ninguna actualización, es IDÉNTICA (mismas columnas, mismos
--      valores) — por eso reemplaza directo a v_costo_lote_desglose en
--      todo consumidor "en vivo" sin cambiar el comportamiento de ningún
--      lote que nunca se actualice. Con actualizaciones, cada columna de
--      costo/precio pasa a ser la de la valoración MÁS RECIENTE de ese
--      producto; agrega costo_unitario_original_centavos/
--      costo_ananja_original_centavos (siempre el original, para poder
--      mostrar "vigente vs. original") y actualizado_en/actualizado_por
--      (null si nunca se actualizó).
-- ============================================================

create view v_costo_lote_vigente as
with vigente as (
  select distinct on (lote_id, producto_id)
    lote_id, producto_id, aceite_centavos, etiqueta_centavos, envase_centavos,
    transporte_centavos, otros_centavos, total_centavos, costo_unitario_centavos,
    costo_ananja_centavos, precio_mayorista_sugerido_centavos, precio_minorista_sugerido_centavos,
    ganancia_pct, mayorista_pct, minorista_pct, vendedor_id, created_at
  from lote_valoraciones
  order by lote_id, producto_id, created_at desc, id desc
)
select
  d.lote_id,
  d.producto_id,
  d.fecha,
  d.presentacion_ml,
  d.producto_nombre,
  d.cantidad,
  coalesce(v.aceite_centavos, d.aceite_centavos) as aceite_centavos,
  coalesce(v.etiqueta_centavos, d.etiqueta_centavos) as etiqueta_centavos,
  coalesce(v.envase_centavos, d.envase_centavos) as envase_centavos,
  coalesce(v.transporte_centavos, d.transporte_centavos) as transporte_centavos,
  coalesce(v.otros_centavos, d.otros_centavos) as otros_centavos,
  coalesce(v.total_centavos, d.total_centavos) as total_centavos,
  coalesce(v.costo_unitario_centavos, d.costo_unitario_centavos) as costo_unitario_centavos,
  d.tiene_costos,
  coalesce(v.ganancia_pct, d.ganancia_pct) as ganancia_pct,
  coalesce(v.mayorista_pct, d.mayorista_pct) as mayorista_pct,
  coalesce(v.minorista_pct, d.minorista_pct) as minorista_pct,
  coalesce(v.costo_ananja_centavos, d.costo_ananja_centavos) as costo_ananja_centavos,
  coalesce(v.precio_mayorista_sugerido_centavos, d.precio_mayorista_sugerido_centavos) as precio_mayorista_sugerido_centavos,
  coalesce(v.precio_minorista_sugerido_centavos, d.precio_minorista_sugerido_centavos) as precio_minorista_sugerido_centavos,
  d.created_at,
  d.dolar_centavos,
  d.precio_litro_aceite_usd_centavos,
  d.costo_unitario_centavos as costo_unitario_original_centavos,
  d.costo_ananja_centavos as costo_ananja_original_centavos,
  v.created_at as actualizado_en,
  v.vendedor_id as actualizado_por
from v_costo_lote_desglose d
left join vigente v on v.lote_id = d.lote_id and v.producto_id = d.producto_id;

alter view v_costo_lote_vigente set (security_invoker = true);
revoke all on v_costo_lote_vigente from anon, public;
grant select on v_costo_lote_vigente to authenticated;

-- ============================================================
-- D.3) actualizar_costo_lote_vigente — RPC nuevo, solo admin. Recalcula el
--      costo con calcular_costos_lote (MISMO cálculo que
--      fijar_costos_lote/crear_lote) y agrega el resultado por producto
--      (misma repartición por volumen que v_costo_lote_desglose para
--      transporte fijo/otros compartidos — sin gastos legado, que no
--      pueden existir en una valoración nueva), inserta una fila por
--      producto en lote_valoraciones. Nunca toca lote_costos/gastos/
--      deudas/lotes_produccion.
--
--      Precondición: los costos ORIGINALES del lote (lote_costos, vía
--      fijar_costos_lote/crear_lote) tienen que estar completos para TODOS
--      sus productos — si falta alguno, corresponde "Editar costos", no
--      esta función.
-- ============================================================

create function public.actualizar_costo_lote_vigente(
  p_lote_id uuid,
  p_costos jsonb,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_existe boolean;
  v_ganancia_pct numeric;
  v_mayorista_pct numeric;
  v_minorista_pct numeric;
  v_insertados int;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  -- Bloquea la fila del lote hasta el commit — mismo patrón que
  -- fijar_costos_lote (0028/0047): serializa con una edición de costos
  -- concurrente (otra actualización, o "Editar costos") sobre el MISMO
  -- lote, para que no lean el mismo estado "viejo" en simultáneo.
  select true into v_existe from lotes_produccion where id = p_lote_id for update;
  if v_existe is null then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if p_costos is null then
    raise exception 'COSTOS_INVALIDOS';
  end if;

  if not exists (select 1 from lote_items where lote_id = p_lote_id) then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if exists (
    select 1 from lote_items li
    where li.lote_id = p_lote_id and not public.lote_costos_completos(p_lote_id, li.producto_id)
  ) then
    raise exception 'COSTOS_ORIGINALES_INCOMPLETOS';
  end if;

  select
    coalesce(nullif(p_costos->>'ganancia_pct', '')::numeric, l.ganancia_pct),
    coalesce(nullif(p_costos->>'mayorista_pct', '')::numeric, l.mayorista_pct),
    coalesce(nullif(p_costos->>'minorista_pct', '')::numeric, l.minorista_pct)
    into v_ganancia_pct, v_mayorista_pct, v_minorista_pct
  from lotes_produccion l where l.id = p_lote_id;

  with calculado as (
    select * from public.calcular_costos_lote(p_lote_id, p_costos)
  ),
  peso_item as (
    select li.producto_id, li.cantidad, p.presentacion_ml * li.cantidad as peso
    from lote_items li
    join productos p on p.id = li.producto_id
    where li.lote_id = p_lote_id
  ),
  directo as (
    select producto_id, concepto, sum(total_centavos) as monto
    from calculado
    where producto_id is not null and concepto in ('aceite', 'etiqueta', 'envase')
    group by producto_id, concepto
  ),
  transporte_directo as (
    select producto_id, sum(total_centavos) as monto
    from calculado
    where concepto = 'transporte' and producto_id is not null
    group by producto_id
  ),
  transporte_compartido as (
    select coalesce(sum(total_centavos), 0) as total
    from calculado where concepto = 'transporte' and producto_id is null
  ),
  otro_compartido as (
    select coalesce(sum(total_centavos), 0) as total
    from calculado where concepto = 'otro'
  ),
  -- Mismo reparto por volumen que v_costo_lote_desglose § compartido_item,
  -- acá sin partition by (un solo lote_id) y sin gastos legado (no pueden
  -- existir en una valoración nueva).
  compartido_item as (
    select
      pi.producto_id,
      coalesce(round((select total from transporte_compartido) * pi.peso / nullif(sum(pi.peso) over (), 0)), 0)::bigint
        as transporte_compartido_centavos,
      coalesce(round((select total from otro_compartido) * pi.peso / nullif(sum(pi.peso) over (), 0)), 0)::bigint
        as otro_compartido_centavos
    from peso_item pi
  ),
  agregado as (
    select
      pi.producto_id,
      pi.cantidad,
      coalesce((select monto from directo d where d.producto_id = pi.producto_id and d.concepto = 'aceite'), 0)::bigint as aceite_centavos,
      coalesce((select monto from directo d where d.producto_id = pi.producto_id and d.concepto = 'etiqueta'), 0)::bigint as etiqueta_centavos,
      coalesce((select monto from directo d where d.producto_id = pi.producto_id and d.concepto = 'envase'), 0)::bigint as envase_centavos,
      (coalesce((select monto from transporte_directo td where td.producto_id = pi.producto_id), 0)
        + coalesce(ci.transporte_compartido_centavos, 0))::bigint as transporte_centavos,
      coalesce(ci.otro_compartido_centavos, 0)::bigint as otros_centavos
    from peso_item pi
    left join compartido_item ci on ci.producto_id = pi.producto_id
  ),
  final as (
    select
      producto_id, cantidad,
      aceite_centavos, etiqueta_centavos, envase_centavos, transporte_centavos, otros_centavos,
      (aceite_centavos + etiqueta_centavos + envase_centavos + transporte_centavos + otros_centavos) as total_centavos,
      case when (aceite_centavos + etiqueta_centavos + envase_centavos + transporte_centavos + otros_centavos) = 0 then 0
        else round((aceite_centavos + etiqueta_centavos + envase_centavos + transporte_centavos + otros_centavos)::numeric / cantidad)::bigint
      end as costo_unitario_centavos
    from agregado
  )
  insert into lote_valoraciones (
    lote_id, producto_id, aceite_centavos, etiqueta_centavos, envase_centavos, transporte_centavos, otros_centavos,
    total_centavos, costo_unitario_centavos, costo_ananja_centavos,
    precio_mayorista_sugerido_centavos, precio_minorista_sugerido_centavos,
    ganancia_pct, mayorista_pct, minorista_pct, costos_jsonb, nota, vendedor_id
  )
  select
    p_lote_id, f.producto_id, f.aceite_centavos, f.etiqueta_centavos, f.envase_centavos, f.transporte_centavos, f.otros_centavos,
    f.total_centavos, f.costo_unitario_centavos,
    round(f.costo_unitario_centavos * (100 + v_ganancia_pct) / 100)::bigint as costo_ananja_centavos,
    round(round(f.costo_unitario_centavos * (100 + v_ganancia_pct) / 100) * (100 + v_mayorista_pct) / 100)::bigint as precio_mayorista_sugerido_centavos,
    round(round(round(f.costo_unitario_centavos * (100 + v_ganancia_pct) / 100) * (100 + v_mayorista_pct) / 100) * (100 + v_minorista_pct) / 100)::bigint as precio_minorista_sugerido_centavos,
    v_ganancia_pct, v_mayorista_pct, v_minorista_pct, p_costos, p_nota, v_vendedor_id
  from final f
  where f.total_centavos > 0;

  get diagnostics v_insertados = row_count;
  if v_insertados = 0 then
    raise exception 'COSTOS_INVALIDOS';
  end if;

  return json_build_object('lote_id', p_lote_id, 'productos_actualizados', v_insertados);
end;
$$;

revoke execute on function public.actualizar_costo_lote_vigente(uuid, jsonb, text) from anon, public;
grant execute on function public.actualizar_costo_lote_vigente(uuid, jsonb, text) to authenticated;

-- ============================================================
-- E) Consumidores "en vivo" de v_costo_lote_desglose -> v_costo_lote_vigente.
--    Mismas firmas/columnas en todos los casos (create or replace alcanza).
-- ============================================================

-- E.1) entrega_items_foto_costo_lote — misma condición, ahora congela las
--      DOS columnas (costo Ananja Y costo de producción — BLOCKER) contra
--      la vigente.
create or replace function public.entrega_items_foto_costo_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.costo_lote_unitario_centavos := null;
  new.costo_produccion_unitario_centavos := null;
  if new.lote_id is not null
     and exists (select 1 from entregas_revendedor e where e.id = new.entrega_id and e.tipo = 'entrega')
     and public.lote_costos_completos(new.lote_id, new.producto_id) then
    select d.costo_ananja_centavos, d.costo_unitario_centavos
      into new.costo_lote_unitario_centavos, new.costo_produccion_unitario_centavos
    from v_costo_lote_vigente d
    where d.lote_id = new.lote_id and d.producto_id = new.producto_id and d.tiene_costos;
  end if;
  return new;
end;
$$;

-- E.2) completar_fotos_costo_lote — generalizada para completar también
--      comprobante_items (mismo criterio: solo filas con foto null, lote
--      completo, mismo trigger diferido de siempre — atado a lote_costos/
--      lotes_produccion, sin cambios en dónde se dispara, ver el plan §
--      "¿el trigger diferido tiene que dispararse también con la capa
--      nueva? No."), y ahora completa las DOS columnas en las dos tablas.
create or replace function public.completar_fotos_costo_lote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote_id uuid;
begin
  if tg_table_name = 'lote_costos' then
    v_lote_id := new.lote_id;
  else
    v_lote_id := new.id;
  end if;

  update entrega_items ei
  set costo_lote_unitario_centavos = d.costo_ananja_centavos,
      costo_produccion_unitario_centavos = d.costo_unitario_centavos
  from entregas_revendedor e, v_costo_lote_vigente d
  where ei.lote_id = v_lote_id
    and ei.costo_lote_unitario_centavos is null
    and e.id = ei.entrega_id
    and e.tipo = 'entrega'
    and d.lote_id = ei.lote_id
    and d.producto_id = ei.producto_id
    and d.tiene_costos
    and public.lote_costos_completos(ei.lote_id, ei.producto_id);

  update comprobante_items ci
  set costo_lote_unitario_centavos = d.costo_ananja_centavos,
      costo_produccion_unitario_centavos = d.costo_unitario_centavos
  from v_costo_lote_vigente d
  where ci.lote_id = v_lote_id
    and ci.costo_lote_unitario_centavos is null
    and d.lote_id = ci.lote_id
    and d.producto_id = ci.producto_id
    and d.tiene_costos
    and public.lote_costos_completos(ci.lote_id, ci.producto_id);

  return null;
end;
$$;

-- E.3) v_costo_lote_venta — agrega costo_produccion_unitario_centavos al
--      final (BLOCKER: v_margen_ventas necesita la foto de producción de
--      la revendedora, no solo la de costo Ananja, para no seguir restando
--      la producción EN VIVO — ver costo_venta_revendedor en E.6). Mismo
--      criterio que costo_lote_unitario_centavos: foto si existe, si no la
--      vigente cuando el lote está completo, si no null. `create or
--      replace view` admite agregar columnas al final sin romper nada.
create or replace view v_costo_lote_venta as
select vr.id as venta_id,
    vr.vendedor_id,
    vr.fecha,
    vr.created_at,
    vr.cantidad,
    vr.precio_costo_centavos as cobrado_unitario_centavos,
        case
            when ei.lote_id is null then vr.precio_costo_centavos
            else coalesce(ei.costo_lote_unitario_centavos,
            case
                when lc.completo and d.tiene_costos then d.costo_ananja_centavos
                else null::bigint
            end)
        end as costo_lote_unitario_centavos,
    ei.lote_id is not null and ei.costo_lote_unitario_centavos is null and not coalesce(lc.completo and d.tiene_costos, false) as costo_lote_incompleto,
        case
            when ei.lote_id is null then null::bigint
            else coalesce(ei.costo_produccion_unitario_centavos,
            case
                when lc.completo and d.tiene_costos then d.costo_unitario_centavos
                else null::bigint
            end)
        end as costo_produccion_unitario_centavos
   from ventas_revendedor vr
     left join entrega_items ei on ei.id = vr.entrega_item_id
     left join v_lote_costos_completos lc on lc.lote_id = ei.lote_id and lc.producto_id = ei.producto_id
     left join v_costo_lote_vigente d on d.lote_id = ei.lote_id and d.producto_id = ei.producto_id;

alter view v_costo_lote_venta set (security_invoker = true);
revoke all on v_costo_lote_venta from anon, public;
grant select on v_costo_lote_venta to authenticated;

-- E.4) v_perdidas_lote — S1 (revisión adversarial): lo histórico NO se
--      revalúa con el costo de HOY. Cada egreso (degustación, rotura,
--      etc.) se valúa con el costo vigente AL MOMENTO en que pasó — la
--      última `lote_valoraciones` con `created_at <=` la del movimiento,
--      o el original (`v_costo_lote_desglose`) si en ese momento todavía
--      no había ninguna actualización — vía LATERAL (una pérdida no tiene
--      una fila propia en `entrega_items`/`comprobante_items` donde
--      "congelar" una foto: `movimientos_stock` no las lleva, así que la
--      única forma de fijarla es reconstruirla contra el historial de
--      valoraciones en el momento de leer, no de escribir). Mismas
--      columnas que antes (`costo_unitario_centavos` queda como el
--      PROMEDIO ponderado por cantidad de esos costos "al momento", para
--      no romper el shape que ya consume la UI) — `costo_total_centavos`
--      es la suma exacta, no el promedio × unidades.
create or replace view v_perdidas_lote as
with movimientos_valuados as (
  select
    m.lote_id,
    m.producto_id,
    m.motivo,
    m.cantidad,
    coalesce(
      (
        select lv.costo_unitario_centavos
        from lote_valoraciones lv
        where lv.lote_id = m.lote_id and lv.producto_id = m.producto_id and lv.created_at <= m.created_at
        order by lv.created_at desc, lv.id desc
        limit 1
      ),
      d.costo_unitario_centavos,
      0
    ) as costo_unitario_al_momento_centavos
  from movimientos_stock m
    left join v_costo_lote_desglose d on d.lote_id = m.lote_id and d.producto_id = m.producto_id
  where m.tipo = 'egreso'::tipo_movimiento and m.lote_id is not null and m.motivo is not null and m.motivo <> 'venta'::text
)
select
  lote_id,
  producto_id,
  motivo,
  sum(cantidad) as unidades,
  case when sum(cantidad) = 0 then 0::bigint
    else round(sum(cantidad * costo_unitario_al_momento_centavos)::numeric / sum(cantidad))::bigint
  end as costo_unitario_centavos,
  sum(cantidad * costo_unitario_al_momento_centavos)::bigint as costo_total_centavos
from movimientos_valuados
group by lote_id, producto_id, motivo;

alter view v_perdidas_lote set (security_invoker = true);
revoke all on v_perdidas_lote from anon, public;
grant select on v_perdidas_lote to authenticated;

-- E.5) v_cobranza_lote — S1 (revisión adversarial): lo ya entregado/
--      vendido se valúa con SU foto (comprobante_items/entrega_items,
--      costo Ananja — es lo que "tiene que entrar", no el costo de
--      producción), el vigente de HOY solo para lo que sigue en
--      depósito. Una salida sin foto todavía (lote que no estaba completo
--      al momento de salir) cae al vigente, igual que hacían las fotos
--      mismas. Las devoluciones no quedan atadas a la foto de una salida
--      puntual (una devolución de entrega_items nunca tiene foto propia,
--      por diseño) — se netean a nivel de CANTIDAD como siempre, y el
--      valor de lo vendido se escala por la misma proporción neto/bruto
--      (aproximación documentada: precio promedio ponderado de las
--      salidas con foto, vigente para las que no la tienen, escalado al
--      neto — no un tracking unidad por unidad de qué botella puntual
--      volvió).
create or replace view v_cobranza_lote as
with salidas_venta as (
  -- Egresos motivo='venta' con SU propia foto (comprobante o entrega),
  -- por origen — null cuando esa salida no tiene foto (lote incompleto
  -- al momento de salir).
  select m.lote_id, m.producto_id, m.cantidad, ci.costo_lote_unitario_centavos as foto_centavos
  from movimientos_stock m
    join comprobante_items ci
      on ci.comprobante_id = m.comprobante_id and ci.producto_id = m.producto_id and ci.lote_id = m.lote_id
  where m.tipo = 'egreso'::tipo_movimiento and m.lote_id is not null and m.motivo = 'venta'::text
    and m.comprobante_id is not null
  union all
  select m.lote_id, m.producto_id, m.cantidad, ei.costo_lote_unitario_centavos as foto_centavos
  from movimientos_stock m
    join entrega_items ei
      on ei.entrega_id = m.entrega_id and ei.producto_id = m.producto_id and ei.lote_id = m.lote_id
  where m.tipo = 'egreso'::tipo_movimiento and m.lote_id is not null and m.motivo = 'venta'::text
    and m.entrega_id is not null
), salidas as (
  select lote_id, producto_id,
    sum(cantidad) as unidades,
    sum(cantidad) filter (where foto_centavos is not null) as unidades_con_foto,
    sum(cantidad * foto_centavos) filter (where foto_centavos is not null) as valor_con_foto_centavos
  from salidas_venta
  group by lote_id, producto_id
), devoluciones as (
         select movimientos_stock.lote_id,
            movimientos_stock.producto_id,
            sum(movimientos_stock.cantidad) as unidades
           from movimientos_stock
          where movimientos_stock.tipo = 'ingreso'::tipo_movimiento and movimientos_stock.lote_id is not null and movimientos_stock.entrega_id is not null
          group by movimientos_stock.lote_id, movimientos_stock.producto_id
        ), perdidas as (
         select v_perdidas_lote.lote_id,
            v_perdidas_lote.producto_id,
            sum(v_perdidas_lote.unidades) as unidades
           from v_perdidas_lote
          group by v_perdidas_lote.lote_id, v_perdidas_lote.producto_id
        ), netas as (
         select d_1.lote_id,
            d_1.producto_id,
            greatest(coalesce(s.unidades, 0::bigint) - coalesce(dv.unidades, 0::bigint), 0::bigint) as vendidas,
            coalesce(s.unidades, 0::bigint) as vendidas_brutas,
            coalesce(s.unidades_con_foto, 0::bigint) as unidades_con_foto,
            coalesce(s.valor_con_foto_centavos, 0::bigint) as valor_con_foto_centavos
           from v_costo_lote_vigente d_1
             left join salidas s on s.lote_id = d_1.lote_id and s.producto_id = d_1.producto_id
             left join devoluciones dv on dv.lote_id = d_1.lote_id and dv.producto_id = d_1.producto_id
        ), valor_vendido as (
         -- NUMERIC a propósito, sin cast a bigint acá (BUG1, revisión
         -- adversarial): v_cobranza_lote.esperado_total_centavos es
         -- `numeric` en prod HOY — un `create or replace view` que le
         -- cambie el tipo a una columna existente falla al aplicarse
         -- (Postgres no permite cambiar el tipo de una columna de vista ya
         -- publicada). El cast a bigint queda solo en
         -- esperado_por_vendidas_centavos (bigint en prod), más abajo.
         select n.lote_id, n.producto_id,
            case when n.vendidas_brutas = 0 then 0::numeric
              else round(
                (
                  n.valor_con_foto_centavos
                  + (n.vendidas_brutas - n.unidades_con_foto) * d.costo_ananja_centavos
                )::numeric * n.vendidas / n.vendidas_brutas
              )
            end as centavos
           from netas n
             join v_costo_lote_vigente d on d.lote_id = n.lote_id and d.producto_id = n.producto_id
        )
 select d.lote_id,
    d.producto_id,
    d.producto_nombre,
    d.presentacion_ml,
    d.cantidad as producidas,
    n.vendidas,
    coalesce(p.unidades, 0::numeric) as perdidas,
    coalesce(sp.quedan, 0::numeric) as en_deposito,
    d.costo_ananja_centavos,
    -- numeric (mismo tipo que prod hoy) — ver el comentario de valor_vendido.
    vv.centavos + coalesce(sp.quedan, 0::numeric) * d.costo_ananja_centavos as esperado_total_centavos,
    -- bigint (mismo tipo que prod hoy, ya lo era antes de 0052).
    vv.centavos::bigint as esperado_por_vendidas_centavos
   from v_costo_lote_vigente d
     join netas n on n.lote_id = d.lote_id and n.producto_id = d.producto_id
     join valor_vendido vv on vv.lote_id = d.lote_id and vv.producto_id = d.producto_id
     left join perdidas p on p.lote_id = d.lote_id and p.producto_id = d.producto_id
     left join v_stock_por_lote sp on sp.lote_id = d.lote_id and sp.producto_id = d.producto_id;

alter view v_cobranza_lote set (security_invoker = true);
revoke all on v_cobranza_lote from anon, public;
grant select on v_cobranza_lote to authenticated;

-- E.6) v_margen_ventas — costo_seguro contra la vigente (en vivo, fallback
--      final). Parte A: las filas de origen 'comprobante' con lote
--      asignado ahora llevan su propia foto — DOS columnas threadeadas
--      (`t.costo_lote_unitario_centavos`, costo Ananja, y
--      `t.costo_produccion_unitario_centavos`, costo de producción — rev.
--      2/BLOCKER: la primera versión solo threadeaba la de Ananja) a
--      través de las mismas CTEs de siempre — NULL en toda fila que no
--      pueda tener foto: origen 'revendedor' (maneja su propia foto por
--      separado, vía v_costo_lote_venta/costo_venta_revendedor, que
--      también gana la columna de producción) y las filas `sin_lote_*`
--      (por definición no tienen lote_id asignado al vender, nunca
--      tuvieron foto). `margen_ananja_centavos` es el que corrige el
--      BLOCKER: resta la foto de producción (o la vigente solo si no hay
--      foto) de la foto de Ananja (o la vigente), en vez de restar SIEMPRE
--      la producción en vivo — así deja de moverse retroactivamente
--      cuando se actualiza el costo del lote. `ingreso_ananja`/
--      `margen_vendedor` sin cambios de criterio respecto de la rev. 1
--      (ya usaban la foto de costo Ananja).
--
--      BUG2 (rev. 3): las columnas de SALIDA
--      `costo_produccion_unitario_centavos`/`costo_ananja_unitario_centavos`
--      (mismo nombre, mismas posiciones 9/10 — `create or replace view` no
--      cambia el shape) pasan de mostrar SIEMPRE `d.*` (la vigente en
--      vivo, `costo_seguro`) a mostrar la foto de ESTA venta cuando existe
--      — para comprobante, `coalesce(t.costo_lote_unitario_centavos/
--      costo_produccion_unitario_centavos, d.*)`; para revendedor, la foto
--      CRUDA de `v_costo_lote_venta` vía la nueva columna
--      `costo_venta_revendedor.ananja_display_centavos` — a propósito
--      DISTINTA de `cv.ananja_unitario_centavos` (que puede venir
--      recortada por `least(cobrado, costo_lote)`, correcta para el
--      ingreso pero no para "cuál era el costo de esta venta"). Antes del
--      fix, varias ventas con fotos distintas mostraban todas el mismo
--      número (el vigente de hoy) apenas se actualizaba el lote, aunque
--      `ingreso_ananja_centavos`/`margen_ananja_centavos` ya estuvieran
--      congelados bien.
create or replace view v_margen_ventas as
with lote_directo as (
         select dl.lote_id,
            dl.producto_id,
            coalesce(sum(dl.cantidad), 0::bigint) as asignado_directo
           from ( select ci.lote_id,
                    ci.producto_id,
                    ci.cantidad
                   from comprobante_items ci
                  where ci.lote_id is not null
                union all
                 select vr.lote_id,
                    vr.producto_id,
                    vr.cantidad
                   from ventas_revendedor vr
                  where vr.lote_id is not null) dl
          group by dl.lote_id, dl.producto_id
        ), lote_capacidad as (
         select li.lote_id,
            li.producto_id,
            l.fecha,
            l.created_at,
            greatest(li.cantidad - coalesce(ld.asignado_directo, 0::bigint), 0::bigint) as capacidad
           from lote_items li
             join lotes_produccion l on l.id = li.lote_id
             left join lote_directo ld on ld.lote_id = li.lote_id and ld.producto_id = li.producto_id
        ), lote_capacidad_off as (
         select lc.lote_id,
            lc.producto_id,
            lc.fecha,
            lc.created_at,
            lc.capacidad,
            coalesce(sum(lc.capacidad) over (partition by lc.producto_id order by lc.fecha, lc.created_at, lc.lote_id rows between unbounded preceding and 1 preceding), 0::numeric)::bigint as offset_previo
           from lote_capacidad lc
          where lc.capacidad > 0
        ), lote_capacidad_rango as (
         select o.lote_id,
            o.producto_id,
            o.fecha,
            o.created_at,
            o.capacidad,
            o.offset_previo,
            o.offset_previo + o.capacidad as fin_posicion
           from lote_capacidad_off o
        ), demanda_sin_lote as (
         select 'comprobante'::text as origen,
            ci.comprobante_id as documento_id,
            c.fecha,
            c.created_at,
            ci.id as orden_id,
            ci.producto_id,
            ci.cantidad,
            c.vendedor_id,
            c.feria_id,
            ci.precio_unitario_centavos,
            null::bigint as precio_costo_real_centavos,
            null::bigint as costo_lote_unitario_centavos,
            null::bigint as costo_produccion_unitario_centavos
           from comprobante_items ci
             join comprobantes c on c.id = ci.comprobante_id
          where ci.lote_id is null
        union all
         select 'revendedor'::text as origen,
            vr.id as documento_id,
            vr.fecha,
            vr.created_at,
            vr.id as orden_id,
            vr.producto_id,
            vr.cantidad,
            vr.vendedor_id,
            null::uuid as feria_id,
            vr.precio_venta_centavos as precio_unitario_centavos,
            vr.precio_costo_centavos as precio_costo_real_centavos,
            null::bigint as costo_lote_unitario_centavos,
            null::bigint as costo_produccion_unitario_centavos
           from ventas_revendedor vr
          where vr.lote_id is null
        ), demanda_off as (
         select d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.created_at,
            d_1.orden_id,
            d_1.producto_id,
            d_1.cantidad,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            coalesce(sum(d_1.cantidad) over (partition by d_1.producto_id order by d_1.fecha, d_1.created_at, d_1.orden_id rows between unbounded preceding and 1 preceding), 0::bigint) as offset_previo
           from demanda_sin_lote d_1
        ), demanda_con_frontera as (
         select d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.created_at,
            d_1.orden_id,
            d_1.producto_id,
            d_1.cantidad,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            d_1.offset_previo,
            coalesce(( select max(lcr.fin_posicion) as max
                   from lote_capacidad_rango lcr
                  where lcr.producto_id = d_1.producto_id and lcr.fecha <= d_1.fecha), 0::bigint) as frontera,
            greatest(least(d_1.offset_previo + d_1.cantidad, coalesce(( select max(lcr.fin_posicion) as max
                   from lote_capacidad_rango lcr
                  where lcr.producto_id = d_1.producto_id and lcr.fecha <= d_1.fecha), 0::bigint)) - d_1.offset_previo, 0::bigint) as cantidad_satisfecha
           from demanda_off d_1
        ), sin_lote_resuelto as (
         select d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.producto_id,
            lcr.lote_id,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            (least(d_1.offset_previo + d_1.cantidad_satisfecha, lcr.fin_posicion) - greatest(d_1.offset_previo, lcr.offset_previo))::integer as cantidad,
            true as costo_estimado
           from demanda_con_frontera d_1
             join lote_capacidad_rango lcr on lcr.producto_id = d_1.producto_id and lcr.offset_previo < (d_1.offset_previo + d_1.cantidad_satisfecha) and lcr.fin_posicion > d_1.offset_previo
          where d_1.cantidad_satisfecha > 0
        ), sin_lote_no_resuelto as (
         select d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.producto_id,
            null::uuid as lote_id,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            (d_1.cantidad - d_1.cantidad_satisfecha)::integer as cantidad,
            true as costo_estimado
           from demanda_con_frontera d_1
          where (d_1.cantidad - d_1.cantidad_satisfecha) > 0
        ), sin_lote_agregado as (
         select s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.feria_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           from sin_lote_resuelto s
        union all
         select s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.feria_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           from sin_lote_no_resuelto s
        ), con_lote as (
         select 'comprobante'::text as origen,
            ci.comprobante_id as documento_id,
            c.fecha,
            ci.producto_id,
            ci.lote_id,
            c.vendedor_id,
            c.feria_id,
            ci.precio_unitario_centavos,
            null::bigint as precio_costo_real_centavos,
            ci.costo_lote_unitario_centavos,
            ci.costo_produccion_unitario_centavos,
            ci.cantidad,
            false as costo_estimado
           from comprobante_items ci
             join comprobantes c on c.id = ci.comprobante_id
          where ci.lote_id is not null
        union all
         select 'revendedor'::text as origen,
            vr.id as documento_id,
            vr.fecha,
            vr.producto_id,
            vr.lote_id,
            vr.vendedor_id,
            null::uuid as feria_id,
            vr.precio_venta_centavos as precio_unitario_centavos,
            vr.precio_costo_centavos as precio_costo_real_centavos,
            null::bigint as costo_lote_unitario_centavos,
            null::bigint as costo_produccion_unitario_centavos,
            vr.cantidad,
            false as costo_estimado
           from ventas_revendedor vr
          where vr.lote_id is not null
        ), todas as (
         select c.origen,
            c.documento_id,
            c.fecha,
            c.producto_id,
            c.lote_id,
            c.vendedor_id,
            c.feria_id,
            c.precio_unitario_centavos,
            c.precio_costo_real_centavos,
            c.costo_lote_unitario_centavos,
            c.costo_produccion_unitario_centavos,
            c.cantidad,
            c.costo_estimado
           from con_lote c
        union all
         select s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.feria_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           from sin_lote_agregado s
        ), costo_seguro as (
         select v_costo_lote_vigente.lote_id,
            v_costo_lote_vigente.producto_id,
                case
                    when v_costo_lote_vigente.tiene_costos then v_costo_lote_vigente.costo_unitario_centavos
                    else null::bigint
                end as costo_produccion_unitario_centavos,
                case
                    when v_costo_lote_vigente.tiene_costos then v_costo_lote_vigente.costo_ananja_centavos
                    else null::bigint
                end as costo_ananja_unitario_centavos
           from v_costo_lote_vigente
        ), costo_venta_revendedor as (
         select c.venta_id,
            c.costo_lote_incompleto,
                case
                    when c.costo_lote_incompleto or enc.id is null then c.cobrado_unitario_centavos
                    else least(c.cobrado_unitario_centavos, c.costo_lote_unitario_centavos)
                end as ananja_unitario_centavos,
                case
                    when c.costo_lote_incompleto then null::bigint
                    when enc.id is null then 0::bigint
                    else greatest(c.cobrado_unitario_centavos - c.costo_lote_unitario_centavos, 0::bigint)
                end as encargado_unitario_centavos,
            -- BLOCKER (rev. 2): costo de PRODUCCIÓN de ESTA venta —
            -- v_costo_lote_venta ya resuelve foto-o-vigente igual que la
            -- de Ananja, acá solo se pasa.
            c.costo_produccion_unitario_centavos as produccion_unitario_centavos,
            -- BUG2 (revisión adversarial): costo Ananja CRUDO de esta
            -- venta (foto o vigente-si-completo, YA resuelto en
            -- v_costo_lote_venta) — para la columna de salida
            -- `costo_ananja_unitario_centavos`, que tiene que mostrar la
            -- foto de CADA venta, no `ananja_unitario_centavos` (que puede
            -- venir recortado por `least(cobrado, costo_lote)` para el
            -- cálculo del ingreso — dos cosas distintas).
            c.costo_lote_unitario_centavos as ananja_display_centavos
           from v_costo_lote_venta c
             join vendedores yo on yo.id = c.vendedor_id
             left join vendedores enc on enc.id = yo.encargado_id and enc.rol = 'admin'::text and enc.activo and enc.id <> yo.id
        )
 select t.origen,
    t.documento_id,
    t.fecha,
    t.vendedor_id,
    t.feria_id,
    t.producto_id,
    t.lote_id,
    t.cantidad,
    -- BUG2 (revisión adversarial): estas dos columnas mostraban SIEMPRE el
    -- costo en vivo del lote (`d.*`), aunque la venta tuviera su propia
    -- foto — varias ventas con fotos DISTINTAS terminaban mostrando todas
    -- el mismo número después de una actualización de costos, aunque
    -- ingreso_ananja_centavos/margen_ananja_centavos ya estuvieran bien.
    -- Mismo criterio que el margen: la foto de ESTA venta gana, la vigente
    -- solo si esta venta nunca tuvo ninguna.
        case
            when t.origen = 'revendedor'::text then coalesce(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos)
            when t.origen = 'comprobante'::text then coalesce(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos)
            else d.costo_produccion_unitario_centavos
        end as costo_produccion_unitario_centavos,
        case
            when t.origen = 'revendedor'::text then coalesce(cv.ananja_display_centavos, d.costo_ananja_unitario_centavos)
            when t.origen = 'comprobante'::text then coalesce(t.costo_lote_unitario_centavos, d.costo_ananja_unitario_centavos)
            else d.costo_ananja_unitario_centavos
        end as costo_ananja_unitario_centavos,
    t.precio_unitario_centavos as precio_unitario_venta_centavos,
    t.costo_estimado,
        case
            when t.origen = 'revendedor'::text then cv.ananja_unitario_centavos * t.cantidad
            when t.origen = 'comprobante'::text and t.costo_lote_unitario_centavos is not null then t.costo_lote_unitario_centavos * t.cantidad
            when d.costo_ananja_unitario_centavos is not null then d.costo_ananja_unitario_centavos * t.cantidad
            else null::bigint
        end as ingreso_ananja_centavos,
        -- margen_ananja_centavos — BLOCKER corregido en la rev. 2: resta
        -- la foto de PRODUCCIÓN (o la vigente solo si esta venta no tiene
        -- ninguna) de la foto de Ananja (o la vigente) — antes restaba
        -- SIEMPRE `d.costo_produccion_unitario_centavos` (la vigente EN
        -- VIVO), así que la ganancia de una venta vieja se seguía moviendo
        -- después de actualizar el costo del lote aunque el ingreso ya
        -- estuviera congelado.
        case
            when t.origen = 'revendedor'::text then
            case
                when cv.costo_lote_incompleto then null::bigint
                when cv.ananja_unitario_centavos is not null and coalesce(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos) is not null
                  then (cv.ananja_unitario_centavos - coalesce(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos)) * t.cantidad
                else null::bigint
            end
            when t.origen = 'comprobante'::text and t.costo_lote_unitario_centavos is not null
                 and coalesce(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos) is not null
              then (t.costo_lote_unitario_centavos - coalesce(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos)) * t.cantidad
            when d.costo_ananja_unitario_centavos is not null and d.costo_produccion_unitario_centavos is not null then (d.costo_ananja_unitario_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
            else null::bigint
        end as margen_ananja_centavos,
        case
            when t.origen = 'revendedor'::text then
            case
                when t.precio_unitario_centavos is not null and t.precio_costo_real_centavos is not null then (t.precio_unitario_centavos - t.precio_costo_real_centavos) * t.cantidad
                else null::bigint
            end
            when t.precio_unitario_centavos is not null and t.origen = 'comprobante'::text and t.costo_lote_unitario_centavos is not null then (t.precio_unitario_centavos - t.costo_lote_unitario_centavos) * t.cantidad
            when t.precio_unitario_centavos is not null and d.costo_ananja_unitario_centavos is not null then (t.precio_unitario_centavos - d.costo_ananja_unitario_centavos) * t.cantidad
            else null::bigint
        end as margen_vendedor_centavos,
        case
            when t.origen = 'revendedor'::text then cv.encargado_unitario_centavos * t.cantidad
            else 0::bigint
        end as margen_encargado_centavos
   from todas t
     left join costo_seguro d on d.lote_id = t.lote_id and d.producto_id = t.producto_id
     left join costo_venta_revendedor cv on t.origen = 'revendedor'::text and cv.venta_id = t.documento_id;

alter view v_margen_ventas set (security_invoker = true);
revoke all on v_margen_ventas from anon, public;
grant select on v_margen_ventas to authenticated;
