-- Ananja: la revendedora puede EDITAR una venta ya cargada (medio de pago,
-- precio de venta, fecha y nota).
--
-- Hasta hoy una venta solo se podía borrar y volver a cargar. Esta migración
-- agrega `public.editar_venta_revendedor(...)`, que cambia solo lo que no
-- toca stock ni costos:
--
--   * medio de pago, precio de venta (por unidad), fecha y nota.
--
-- NO se puede cambiar la cantidad, el producto ni de qué entrega/lote salió:
-- eso mueve el reparto FIFO y el stock. Para eso sigue valiendo "borrar y
-- volver a cargar".
--
-- Una venta son una o varias filas de `ventas_revendedor` con el mismo
-- `grupo_id` (una venta partida entre dos entregas). La edición aplica a
-- TODAS las filas del grupo. No toca `precio_costo_centavos` (lo que se le
-- debe a Ananja no cambia), ni cantidad, producto, lote o entrega.
--
-- Todos los parámetros REEMPLAZAN el valor actual: el formulario manda lo que
-- ve (incluida la nota vacía, que queda en null).
--
-- Quién puede: la misma regla que `eliminar_venta_revendedor` (0073 § 6):
-- un admin siempre; si no, la dueña de la venta, y solo si ninguna fila del
-- grupo la cargó otra persona (`registrada_por` no nulo y distinto de ella).
--
-- Errores (en este orden): NO_AUTORIZADO, VENTA_NO_ENCONTRADA,
-- VENTA_CON_RENDICION (la venta de una coordinadora ya generó una fila en
-- `rendiciones` con ese `venta_grupo_id`: se rechaza la edición entera, que
-- la corrija un admin), MEDIO_INVALIDO, PRECIO_INVALIDO (precio <= 0, o
-- nulo en una venta que ya tenía precio), FECHA_INVALIDA, FECHA_FUTURA
-- (hoy en America/Argentina/Buenos_Aires) y FECHA_ANTERIOR_A_ENTREGA (la
-- fecha de la venta no puede ser anterior a la de la entrega de la que salió
-- cada fila; mismo chequeo y mismo `detail` que `insertar_venta_revendedor`).
--
-- Qué NO cambia: `medio_pago` de la venta es informativo (ninguna vista de
-- saldo lo lee; la deuda es `cantidad * precio_costo_centavos`), así que
-- cambiarlo no mueve plata. Cambiar el precio de venta sí cambia la ganancia
-- de la revendedora (`v_margen_ventas`), que es lo esperado. No hay trigger
-- de auditoría para ediciones (el de 0045 es solo de borrados).
--
-- Serialización: toma la fila de `vendedores` de la dueña con
-- `for no key update` (como `insertar_venta_revendedor`) para no pisarse con
-- una carga o un borrado simultáneo de la misma persona.
--
-- `set search_path = public` va SIN comillas a propósito: `supabase/render.mjs`
-- solo reescribe la palabra `public` pelada después de `search_path =`, no
-- `'public'` entrecomillado (ver supabase/README.md). Hardcodea `public.` en
-- vez de `__SCHEMA__.` igual que 0049–0076: esta migración es solo de Ananja.
--
-- `lib/types.ts` se editó a mano (la función); regenerarlo después de
-- aplicar la migración.
--
-- ============================================================
-- Cómo verificar (en el SQL Editor, con "Impersonate" de una revendedora)
-- ============================================================
--
--   -- a) editar el medio de pago de una venta propia
--   select public.editar_venta_revendedor('<grupo>'::uuid, 'banco', 150000, current_date, null);
--   -- esperado: {"grupo_id": "<grupo>", "filas": 1}
--
--   -- b) fecha futura
--   select public.editar_venta_revendedor('<grupo>'::uuid, 'banco', 150000, current_date + 3, null);
--   -- esperado: ERROR FECHA_FUTURA
--
--   -- c) venta de otra persona
--   -- esperado: ERROR NO_AUTORIZADO
--
-- ============================================================
-- Rollback
-- ============================================================
--
--   drop function public.editar_venta_revendedor(uuid, medio_pago, bigint, date, text);

create function public.editar_venta_revendedor(
  p_grupo_id uuid,
  p_medio_pago medio_pago,
  p_precio_venta_centavos bigint,
  p_fecha date,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_duenio_id uuid;
  v_nombre text;
  v_producto_id uuid;
  v_entrega_fecha date;
  v_filas int;
begin
  v_yo := public.mi_vendedor_id();
  if v_yo is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  select vendedor_id into v_duenio_id
  from ventas_revendedor where grupo_id = p_grupo_id limit 1;
  if v_duenio_id is null then
    raise exception 'VENTA_NO_ENCONTRADA';
  end if;

  -- Mismo permiso que `eliminar_venta_revendedor` (0073 § 6).
  if not public.es_admin() then
    if v_duenio_id <> v_yo then
      raise exception 'NO_AUTORIZADO';
    end if;

    if exists (
      select 1 from ventas_revendedor
      where grupo_id = p_grupo_id and registrada_por is not null and registrada_por <> v_yo
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  -- Serializa con una carga o un borrado simultáneo de la misma persona.
  perform 1 from vendedores where id = v_duenio_id for no key update;

  -- La venta de una coordinadora ya generó su rendición: no se edita.
  if exists (select 1 from rendiciones where venta_grupo_id = p_grupo_id) then
    raise exception 'VENTA_CON_RENDICION';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_precio_venta_centavos is not null and p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  -- Precio nulo solo si la venta ya no tenía precio (una venta cargada por un
  -- admin sin saber a cuánto se vendió): no se puede "borrar" un precio.
  if p_precio_venta_centavos is null and exists (
    select 1 from ventas_revendedor
    where grupo_id = p_grupo_id and precio_venta_centavos is not null
  ) then
    raise exception 'PRECIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  -- La venta no puede ser anterior a la entrega de la que salió cada fila.
  select v.producto_id, e.fecha into v_producto_id, v_entrega_fecha
  from ventas_revendedor v
  join entrega_items ei on ei.id = v.entrega_item_id
  join entregas_revendedor e on e.id = ei.entrega_id
  where v.grupo_id = p_grupo_id
    and e.fecha > p_fecha
  order by e.fecha
  limit 1;

  if v_entrega_fecha is not null then
    select nombre into v_nombre from productos where id = v_producto_id;
    raise exception 'FECHA_ANTERIOR_A_ENTREGA'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', v_producto_id,
        'entrega_fecha', v_entrega_fecha
      )::text;
  end if;

  update ventas_revendedor
  set medio_pago = p_medio_pago,
      precio_venta_centavos = p_precio_venta_centavos,
      fecha = p_fecha,
      nota = nullif(btrim(p_nota), '')
  where grupo_id = p_grupo_id;

  get diagnostics v_filas = row_count;

  return json_build_object('grupo_id', p_grupo_id, 'filas', v_filas);
end;
$$;

revoke execute on function public.editar_venta_revendedor(uuid, medio_pago, bigint, date, text) from anon, public;
grant execute on function public.editar_venta_revendedor(uuid, medio_pago, bigint, date, text) to authenticated;
