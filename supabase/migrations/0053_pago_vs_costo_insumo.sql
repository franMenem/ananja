-- Ananja: separa "lo que le pagás al proveedor" de "el precio para el costo de
-- la botella" en el pedido (envase y etiqueta) — pedido de Fran (dueño),
-- boceto aprobado 2026-09-17. Dos cambios de fondo:
--
--  1. REVIERTE 0048 en el pago del envase: "a pagar" ya NO lleva IVA sumado
--     nunca. `a_pagar_centavos` = cantidad × precio pagado (o el "monto
--     real"/redondeo si el proveedor cobró otro número) — punto. Si el proveedor lo cobra
--     sin IVA, se le paga sin IVA (no se suma el 21% al pago); si lo cobra
--     con IVA, el precio pagado ya lo incluye. 0048 hacía "a pagar = costo,
--     siempre" (sumaba IVA también al pago cuando `envase_cobrado_sin_iva`)
--     — Fran lo aclaró hoy: eso nunca fue lo que quiso, el pago tiene que
--     ser exactamente lo que el proveedor cobra.
--  2. NUEVO — precio para costo, opcional, por envase Y por etiqueta:
--     "precio_costo_unitario_centavos", vacío/ausente = "usa el mismo que
--     se paga". El costo de la botella se calcula con ESE precio (cantidad
--     × precio-para-costo × 1,21 si el insumo se cobra sin IVA) — el "monto
--     real"/redondeo del pago (arriba) YA NO afecta el costo en ningún
--     caso: son dos cuentas independientes desde acá. Antes de esta
--     migración (0048 vigente), sin precio-para-costo (no existía el
--     concepto) el costo se derivaba del MISMO monto que terminaba pagado
--     (el redondeo, cuando había uno, se colaba en el costo) — la decisión
--     de Fran hoy ("el monto real afecta SOLO lo que se paga") es la que
--     manda: se documenta acá como un cambio de comportamiento deliberado,
--     no un descuido (ver la sección "Efecto sobre lotes ya guardados" más
--     abajo — ningún lote YA GUARDADO cambia de número por esta migración
--     sola; el cambio numérico solo se ve si alguien vuelve a guardar
--     "Editar costos"/"Actualizar costos" de un lote que tenía un "monto
--     real" cargado en el envase).
--
-- Etiquetas: no generan "a pagar" (se pagan con la factura de compra, ya
-- están compradas) — sin cambios ahí. Lo único nuevo es el precio-para-costo
-- opcional, que reemplaza al precio pagado como base del costo (mismo IVA
-- que ya regía: `precios_incluyen_iva` del pedido, sin cambios).
--
-- IVA "sin IVA" sigue siendo UN toggle POR LOTE en cada caso — envase:
-- `lotes_produccion.envase_cobrado_sin_iva` (0038); etiqueta:
-- `precios_incluyen_iva` (invertido) — NO por presentación/insumo, aunque
-- el boceto muestra la tilde "sin IVA" junto a CADA renglón: decisión
-- mínimo-cambio, documentada en el informe de esta tanda — un pedido real a
-- El proveedor es una sola factura con un único criterio de IVA, no vale la pena
-- una columna nueva por presentación para esto todavía. La UI repite el
-- mismo checkbox (mismo estado) al lado de cada renglón para que se vea
-- igual que el boceto.
--
-- Transporte % sigue calculándose sobre aceite + envasado + etiquetas A
-- COSTO (total_centavos de esas filas), sin cambios — ver la sección de
-- transporte de `calcular_costos_lote`, intacta.
--
-- Alcance:
--  1. `lote_costos.costo_neto_centavos` (nueva columna, nullable) — el
--     precio-para-costo tal como se cargó, para poder reconstruir la
--     pantalla al reabrir "Editar costos"/"Actualizar costos"
--     (`null` = "se usó el mismo que se paga/el mismo cargado", igual
--     criterio que `neto_centavos` ya usa para "sin cargar"). No participa
--     de ninguna vista (`v_costo_lote_desglose`/`v_saldo_lote_concepto`
--     revisadas: solo leen `total_centavos`/`a_pagar_centavos`).
--  2. `public.calcular_costos_lote(uuid, jsonb)` — CAMBIA DE FIRMA (el
--     `returns table` suma la columna `costo_neto_centavos`): se dropea y
--     se vuelve a crear (regla del repo: `create or replace` no puede
--     cambiar el shape de un `returns table`), tomando como base el cuerpo
--     VIGENTE de prod (`pg_get_functiondef`, no el .sql de 0052 — coincidían
--     al momento de escribir esta migración, verificado). Cambia SOLO la
--     sub-sección de envase (separa pago/costo, ver arriba) y la de
--     etiqueta (agrega el fallback a precio-para-costo) — aceite,
--     transporte, otros, validación de redondeos: sin tocar una línea. La
--     rama "modo viejo" de envase (`v_envase_modo_nuevo = false` — pedidos
--     de antes de 0038 que nunca mandan `envase_cobrado_sin_iva`, hoy
--     inalcanzable desde la UI) queda EXACTAMENTE igual, `a pagar = costo`
--     como siempre — el precio-para-costo no tiene efecto ahí (no lo manda
--     ningún caller de ese modo).
--  3. `public.aplicar_costos_lote(uuid, jsonb)` — MISMA firma: solo agrega
--     `costo_neto_centavos` a la lista de columnas que copia de
--     `calcular_costos_lote` hacia `lote_costos` (`create or replace`
--     alcanza).
--  4. `public.fijar_costos_lote`/`public.actualizar_costo_lote_vigente`/
--     `public.crear_lote`: SIN CAMBIOS — ninguna de las tres referencia la
--     sección de envase/etiqueta directamente ni el nuevo campo; siguen
--     llamando a `aplicar_costos_lote`/`calcular_costos_lote` por nombre
--     (PL/pgSQL no fija la firma de una función llamada en el cuerpo de
--     otra al crearla, así que dropear y recrear `calcular_costos_lote` no
--     rompe a quien ya la llama). Las guardias `COSTOS_MENORES_A_PAGADO`
--     (`fijar_costos_lote`) y `DEUDA_ACEITE_MENOR_A_PAGADO` siguen
--     funcionando igual: comparan `a_pagar_centavos`/`gastos`, ninguno de
--     los dos toca la columna nueva.
--
-- Efecto sobre lotes YA guardados (ninguna fila de `lote_costos` se toca —
-- esta migración solo redefine funciones y agrega una columna nullable):
--  - Un lote SIN "monto real" cargado en el envase: si se vuelve a guardar
--    tal cual (mismo precio pagado, sin precio-para-costo), el pago (cantidad
--    × precio) y el costo (cantidad × precio × IVA si corresponde) dan
--    EXACTAMENTE los mismos números que hoy — no hay redondeo que
--    desacoplar.
--  - Un lote CON "monto real" cargado en el envase (ej. un pedido al proveedor
--    ya cargado — SELECT de solo lectura en prod, 2026-09-17): tiene
--    `envase_cobrado_sin_iva = true`, dos renglones de envase, uno de ellos
--    con un "monto real" guardado (`a_pagar_centavos` un poco por encima del
--    calculado sin redondeo; el costo guardado quedó con la asimetría
--    pre-0048 porque este lote nunca se volvió a fijar desde que se creó,
--    ver el comentario de 0048). Sin tocar nada, sus números guardados NO
--    cambian (esta migración no escribe `lote_costos`). Si Fran reabre
--    "Editar costos" y lo guarda TAL CUAL viene precargado (mismo precio
--    pagado, "monto real" prefijado con el `a_pagar_centavos` guardado, sin
--    precio-para-costo): el PAGO da exactamente los mismos números
--    guardados hoy (el redondeo se prefija con lo guardado y `a_pagar` lo
--    reproduce tal cual, la guardia `COSTOS_MENORES_A_PAGADO` no se activa:
--    este lote está pagado en su totalidad, `pagado = a_pagar` de HOY
--    exacto). El COSTO de la presentación que tenía "monto real" SÍ cambia
--    un poco: pasa a ser round(calculado sin redondeo × 1,21) en vez del
--    valor guardado con la asimetría vieja (una diferencia de unas decenas
--    de pesos) — porque el "monto real" ya no se cuela en el costo (regla
--    nueva de Fran). Es un cambio esperado y menor (≈0,02% del costo de ese
--    renglón, transporte no se mueve porque tiene su propio "monto real"
--    independiente que se reproduce igual); no lo bloquea ninguna guardia.
--    La otra presentación (sin "monto real") no cambia ni un centavo.
--
-- Migración sin templating (mismo criterio que 0049/0050/0051/0052):
-- hardcodea `public.` y `search_path = public`.

alter table lote_costos add column costo_neto_centavos bigint;

-- ============================================================
-- public.calcular_costos_lote — drop + create (cambia el `returns table`).
-- Cuerpo tomado del VIGENTE de prod (pg_get_functiondef, verificado igual
-- al de 0052 el 2026-09-17). Diff real contra ese cuerpo: declara
-- v_envase_precio_costo/v_etiqueta_precio_costo, agrega costo_neto_centavos
-- a cada `return next` (null salvo envase/etiqueta), y reescribe la
-- sub-sección de envase (pago y costo por separado, ver cabecera) y la de
-- etiqueta (fallback a precio-para-costo). Todo el resto es IDÉNTICO,
-- carácter por carácter, al cuerpo vigente.
-- ============================================================

drop function public.calcular_costos_lote(uuid, jsonb);

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
  a_pagar_centavos bigint,
  costo_neto_centavos bigint
)
language plpgsql
security definer
set search_path = 'public'
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
  v_envase_precio_costo bigint;
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
  v_etiqueta_precio_costo bigint;
  v_etiqueta_costo_base bigint;
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

  v_envase_sin_iva_param := nullif(p_costos->>'envase_cobrado_sin_iva', '')::boolean;
  if v_envase_sin_iva_param is not null then
    v_envase_modo_nuevo := true;
    v_envase_sin_iva := v_envase_sin_iva_param;
  else
    v_envase_sin_iva := coalesce(v_envase_sin_iva_guardado, false);
    v_envase_modo_nuevo := v_envase_sin_iva;
  end if;

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

  -- Aceite: sin cambios.
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
      costo_neto_centavos := null;
      return next;

      v_base_por_producto := jsonb_set(
        v_base_por_producto, array[v_item.producto_id::text],
        to_jsonb(coalesce((v_base_por_producto->>v_item.producto_id::text)::bigint, 0) + v_monto)
      );
    end if;
  end loop;

  -- Etiquetas (0053): el costo usa `precio_costo_unitario_centavos` si vino
  -- cargado — si no, el precio pagado, exactamente como hasta hoy (ningún
  -- lote sin este campo nuevo cambia de número). El envío nunca tiene
  -- versión "para costo" separada (sigue siendo un único monto, sin IVA).
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
    v_etiqueta_precio_costo := nullif(v_etiqueta->>'precio_costo_unitario_centavos', '')::bigint;
    v_etiqueta_envio := coalesce(nullif(v_etiqueta->>'envio_unitario_centavos', '')::bigint, 0);

    if v_etiqueta_insumo_id is null or v_etiqueta_precio is null or v_etiqueta_precio < 0 or v_etiqueta_envio < 0
       or (v_etiqueta_precio_costo is not null and v_etiqueta_precio_costo < 0) then
      raise exception 'COSTO_ETIQUETA_INVALIDO';
    end if;

    if v_etiqueta_insumo_id = any(v_etiquetas_vistas) then
      raise exception 'COSTO_ETIQUETA_DUPLICADO';
    end if;
    v_etiquetas_vistas := array_append(v_etiquetas_vistas, v_etiqueta_insumo_id);

    v_etiqueta_costo_base := coalesce(v_etiqueta_precio_costo, v_etiqueta_precio);
    if v_incluye_iva then
      v_gross := v_etiqueta_costo_base;
    else
      v_gross := round(v_etiqueta_costo_base * (100 + v_iva_pct) / 100);
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
      costo_neto_centavos := v_etiqueta_precio_costo;
      return next;

      v_base_por_producto := jsonb_set(
        v_base_por_producto, array[v_receta.producto_id::text],
        to_jsonb(coalesce((v_base_por_producto->>v_receta.producto_id::text)::bigint, 0) + v_monto)
      );
    end loop;
  end loop;

  -- Envase (0053 — ver la cabecera de esta migración): PAGO y COSTO se
  -- calculan por separado en modo nuevo (el único que usa la UI hoy). Modo
  -- viejo (pedidos de antes de 0038, hoy inalcanzable): SIN CAMBIOS, a pagar
  -- = costo, como siempre — `precio_costo_unitario_centavos` no tiene
  -- efecto ahí.
  if jsonb_array_length(coalesce(p_costos->'envases', '[]'::jsonb)) > 0 then
    for v_envase in select * from jsonb_array_elements(p_costos->'envases')
    loop
      v_envase_producto_id := (v_envase->>'producto_id')::uuid;
      v_envase_precio := (v_envase->>'precio_unitario_centavos')::bigint;
      v_envase_precio_costo := nullif(v_envase->>'precio_costo_unitario_centavos', '')::bigint;

      if v_envase_producto_id is null or v_envase_precio is null or v_envase_precio < 0
         or (v_envase_precio_costo is not null and v_envase_precio_costo < 0) then
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

      v_envase_redondeo := nullif(v_redondeo_envase->>v_envase_producto_id::text, '')::bigint;

      if v_envase_modo_nuevo then
        -- PAGO: cantidad × precio pagado — nunca lleva IVA sumado (si el proveedor
        -- lo cobra sin IVA, se paga sin IVA; si lo cobra con IVA, el precio
        -- ya lo incluye). El "monto real" reemplaza este cálculo tal cual,
        -- SOLO acá — no toca el costo.
        v_envase_calculado := v_envase_precio * v_envase_cantidad;
        v_envase_cobrado := coalesce(v_envase_redondeo, v_envase_calculado);

        -- COSTO: cantidad × (precio para costo si vino cargado; si no, el
        -- precio pagado) — + IVA 21% si el envase se cobra sin IVA. Nunca
        -- pasa por el "monto real" del pago (0053: revierte la regla de
        -- 0048 de "a pagar = costo").
        v_gross := coalesce(v_envase_precio_costo, v_envase_precio);
        v_envase_total := v_gross * v_envase_cantidad;
        if v_envase_sin_iva then
          v_envase_total := round(v_envase_total * (100 + v_iva_pct) / 100);
        end if;
        v_envase_unitario := round(v_envase_total::numeric / v_envase_cantidad);
      else
        -- Modo viejo (anterior a 0038) — SIN CAMBIOS.
        if v_incluye_iva then
          v_gross := v_envase_precio;
        else
          v_gross := round(v_envase_precio * (100 + v_iva_pct) / 100);
        end if;
        v_envase_calculado := v_gross * v_envase_cantidad;
        v_envase_cobrado := coalesce(v_envase_redondeo, v_envase_calculado);
        v_envase_total := v_envase_cobrado;
        if v_envase_redondeo is null then
          v_envase_unitario := v_gross;
        else
          v_envase_unitario := round(v_envase_total::numeric / v_envase_cantidad);
        end if;
      end if;

      producto_id := v_envase_producto_id;
      concepto := 'envase';
      descripcion := nullif(concat_ws(' · ',
        case
          when v_envase_modo_nuevo and v_envase_sin_iva
            then 'El proveedor lo cobra sin IVA: se paga sin IVA, el costo suma ' || v_iva_pct || '% de IVA'
          when not v_envase_modo_nuevo and not v_incluye_iva
            then 'IVA ' || v_iva_pct || '% aplicado sobre el precio neto'
        end,
        case when v_envase_modo_nuevo and v_envase_precio_costo is not null
          then 'Precio para el costo distinto del pagado'
        end,
        case when v_envase_redondeo is not null
          then 'Cobrado $' || round(v_envase_cobrado::numeric / 100, 2) || ' en vez de $' || round(v_envase_calculado::numeric / 100, 2)
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
      costo_neto_centavos := case when v_envase_modo_nuevo then v_envase_precio_costo else null end;
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

  -- Transporte: sin cambios (sigue sobre aceite + envase + etiquetas A
  -- COSTO — `v_base_por_producto` acumula `total_centavos`, no
  -- `a_pagar_centavos`).
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
      costo_neto_centavos := null;
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
    costo_neto_centavos := null;
    return next;
  end if;

  -- Otros: sin cambios.
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
    costo_neto_centavos := null;
    return next;
  end if;
end;
$$;

revoke execute on function public.calcular_costos_lote(uuid, jsonb) from anon, authenticated, public;

-- ============================================================
-- public.aplicar_costos_lote — MISMA firma (create or replace alcanza):
-- agrega costo_neto_centavos a lo que copia de calcular_costos_lote.
-- ============================================================

create or replace function public.aplicar_costos_lote(
  p_lote_id uuid,
  p_costos jsonb
)
returns void
language plpgsql
security definer
set search_path = 'public'
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
    se_paga, insumo_id, a_pagar_centavos, costo_neto_centavos
  )
  select
    p_lote_id, c.producto_id, c.concepto, c.descripcion, c.cantidad,
    c.costo_unitario_centavos, c.neto_centavos, c.envio_centavos, c.total_centavos,
    c.se_paga, c.insumo_id, c.a_pagar_centavos, c.costo_neto_centavos
  from public.calcular_costos_lote(p_lote_id, p_costos) c;

  perform public.sincronizar_deuda_aceite_lote(p_lote_id);
end;
$$;

revoke execute on function public.aplicar_costos_lote(uuid, jsonb) from anon, authenticated, public;
