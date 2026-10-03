# Handoff: rediseño de UI — Ananja (app de stock, comprobantes y caja)

## Overview

Rediseño visual completo de la app interna de Ananja (aceite de oliva, Aimogasta, La Rioja). La app existe y funciona: Next.js 15 (App Router) + Supabase + Tailwind v4, PWA instalable, mobile-first. **No cambia nada de la funcionalidad, los datos, las RPC ni las rutas.** Cambia únicamente la capa visual: paleta, tipografía, densidad, tratamiento de superficies y jerarquía.

El pedido original fue textual: *"a nivel funcionalidad no [cambia], pero no me gusta nada la UI"*. La dirección elegida por el cliente es **editorial artesanal** — más carácter, texturas, cifras grandes tipo etiqueta de aceite.

Alcance: las 8 pantallas de la app, en celular y escritorio, más estados (vacío / cargando / error) y 3 modales.

---

## About the Design Files

Los archivos `.dc.html` de este bundle son **referencias de diseño hechas en HTML** — prototipos estáticos que muestran el aspecto y la jerarquía buscados. **No son código para copiar y pegar en producción.**

La tarea es **recrear estos diseños dentro del código existente de la app** (`ananja/`), respetando sus patrones actuales:

- Los estilos van en Tailwind, usando los tokens de `app/globals.css` (bloque `@theme`) — hay que **agregar** los tokens nuevos que lista este README, no reemplazar los existentes por hexes literales sueltos.
- Los componentes ya existen y no hay que reescribirlos desde cero: `components/tab-bar.tsx`, `components/icons.tsx`, `components/caja/saldo-card.tsx`, `components/stock/stock-card.tsx`, `components/comprobante-form.tsx`, etc. El trabajo es cambiarles las clases y, donde el README lo indique, reordenar el markup.
- Los íconos SVG de `components/icons.tsx` se mantienen tal cual (los prototipos los usan verbatim). Solo cambia el `stroke-width` de `1.8` a `1.5` y el tamaño de `h-6 w-6` a `h-[21px] w-[21px]` en la tab bar.
- Nada de librerías nuevas. Nada de CSS-in-JS. Los prototipos usan estilos inline solo porque es el formato del prototipo.

**No hay diseño de escritorio en la app hoy** — la app estira el layout mobile. El rediseño introduce un layout de escritorio con rail lateral (ver § Responsive). Eso sí es markup nuevo, en `app/(app)/layout.tsx`.

## Fidelity

**Alta fidelidad (hifi).** Colores, tipografías, tamaños, tracking y espaciados son finales y están medidos. Recrear pixel-perfect. Cada valor de este README sale de un prototipo verificado (contraste AA comprobado en todos los pares de texto bajo 24px).

---

## Design Tokens

### Colores

Todos salen del tema de marca (extraídos 1:1 del `tenant-theme` de ananja.co) y ya están en `app/globals.css`, **salvo dos que hay que agregar**.

| Token | Hex | Rol | ¿Existe hoy? |
|---|---|---|---|
| `--color-primary` | `#2C2F25` | Oliva profundo. Cabeceras, rail, texto principal, botón primario | sí |
| `--color-primary-hover` | `#4C5140` | Hover del primario | sí |
| `--color-primary-foreground` | `#FFFFFF` | — (en el rediseño se usa `--color-background` sobre oliva, no blanco puro) | sí |
| `--color-secondary` | `#4A5240` | Oliva medio. Signo `+` de movimientos, borde de "en regla" | sí |
| `--color-accent` | `#7A2E2E` | Bordó. Alertas de stock bajo, montos negativos, acciones destructivas | sí |
| `--color-background` | `#F4EFEA` | Crema. Fondo general y texto sobre oliva | sí |
| `--color-surface` | `#FFFFFF` | Blanco. Solo inputs y textareas | sí |
| `--color-surface-raised` | `#EDE5DD` | Crema elevada. Bloques de etiqueta, tab bar, esqueletos | sí |
| `--color-border` | `#DFD0C2` | Borde tostado. Todos los filetes | sí |
| `--color-text` | `#2C2F25` | = primary | sí |
| `--color-text-muted` | `#5A5A5A` | Rótulos y texto secundario sobre crema | sí |
| `--color-danger` | `#B3261E` | **No se usa en el rediseño** — ver nota abajo | sí |
| **`--color-mark`** | **`#A9762F`** | **AGREGAR.** Ocre de aceite. Solo marcas de 2px: filete bajo la cabecera, borde del tab/rail activo, subrayado de links | no |
| **`--color-on-primary-muted`** | **`#a8ab98`** | **AGREGAR.** Rótulos secundarios sobre oliva (5.9:1 sobre `#2C2F25`) | no |
| **`--color-primary-line`** | **`#43473a`** | **AGREGAR.** Filete divisor dentro de bloques oliva | no |
| **`--color-primary-active`** | **`#373b2e`** | **AGREGAR.** Fondo del ítem activo del rail | no |
| **`--color-primary-2`** | **`#b6b7a8`** | **AGREGAR.** Los centavos dentro de una cifra grande sobre oliva | no |
| **`--color-scrim`** | **`rgba(28,30,24,0.62)`** | **AGREGAR.** Velo de los modales (hoy es `bg-black/40`) | no |

**Sobre `#A9762F`:** es el único color que **no** viene de ananja.co. Está derivado en OKLCH desde el oliva/bordó de la marca y se usa exclusivamente como línea o marca de 2px, nunca como relleno ni como texto. Si el cliente prefiere no introducir nada nuevo, reemplazarlo por `--color-accent` (`#7A2E2E`) funciona sin romper nada.

**Sobre `--color-danger` (`#B3261E`):** el rediseño lo elimina de la UI. Todo lo que hoy es rojo (stock bajo, montos negativos, botón "Guardar igual", punto de la campana) pasa a bordó `#7A2E2E`, que sí es de marca. El token puede quedar en `globals.css` sin uso.

### Tipografía

Dos familias. **DM Sans** ya está cargada (`next/font`, `--font-dm-sans`). **Instrument Serif** hay que agregarla.

```ts
// app/layout.tsx
import { DM_Sans, Instrument_Serif } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});
```

```css
/* app/globals.css — dentro de @theme */
--font-display: var(--font-instrument-serif), "Instrument Serif", serif;
--font-heading: var(--font-dm-sans), "DM Sans", sans-serif;
--font-body:    var(--font-dm-sans), "DM Sans", sans-serif;
```

`Inter` deja de usarse. Hoy `--font-body` apunta a Inter — cambiarlo a DM Sans y quitar la carga de Inter de `app/layout.tsx`.

**Escala tipográfica del rediseño:**

| Rol | Familia | Tamaño / line-height | Peso | Tracking | Dónde |
|---|---|---|---|---|---|
| Cifra heroica | display | 46–58px / 1.0 | 400 | — | Total en caja |
| Cifra de depósito | display | 60–96px / 0.85 | 400 | — | Unidades 250/500 |
| Cifra de monto en lista | display | 26–27px / 1.0 | 400 | — | Montos de comprobantes |
| Título de pantalla | display | 38px / 1.05 | 400 | — | `h2` de escritorio |
| Wordmark | display | 25–28px / 1.0 | 400 | `0.16em` | ANANJA |
| Párrafo destacado | display | 19–30px / 1.3 | 400 | — | Cuerpo de avisos, estados, modales |
| Etiqueta de presentación | display | 19–28px | 400 | — | "250 ml", "500 ml", nombre de categoría |
| Rótulo de sección | heading | 10px | 400 | `0.22em` uppercase | "Botellas en depósito", "Movimientos de hoy" |
| Rótulo sobre oliva | heading | 10–11px | 400 | `0.14–0.22em` uppercase | "Total en caja", "Banco" |
| Encabezado de tabla | heading | 10px | 400 | `0.16em` uppercase | Columnas de escritorio |
| Etiqueta de nav | heading | 11px (móvil) / 12px (rail) | 400–500 | `0.12–0.14em` uppercase | Tab bar y rail |
| Botón | heading | 12–13px | 500 | `0.12–0.16em` uppercase | Todos los botones |
| Texto de fila | heading | 13–14px | 400 | — | Concepto de movimientos |
| Meta de fila | heading | 11–12px | 400 | — | "Banco · Lucía · 10:24" |
| Monto tabular | heading | 16–24px | 500 | — | Montos en filas y desglose |

**Reglas duras:**
- Ningún texto por debajo de **10px**. El mínimo de la app hoy es 11px (`tab-bar.tsx`) — respetarlo en la nav.
- Todo número de dinero o de unidades lleva `font-variant-numeric: tabular-nums` (`tabular-nums` en Tailwind).
- Los centavos de una cifra heroica van en un `<span>` a ~55% del tamaño y en `--color-primary-2`.
- El separador de miles dentro de una cifra heroica sobre oliva usa `&#8202;` (hair space) después del `$`, no un espacio normal.
- Los títulos serif nunca van en negrita — la jerarquía es tamaño y espacio.

### Espaciado

Escala de 2px, valores reales usados: `1 2 4 6 8 10 12 14 16 18 20 22 24 26 28 32 34 36 40 44`.

- Padding lateral en celular: **20px** (hoy 16px)
- Padding en escritorio: **40px**
- Ancho del rail: **238px**
- Alto mínimo de target táctil: **44px** (se mantiene el mínimo actual)
- Alto de botón primario: 46px (escritorio) / 50–56px (celular)
- Separación entre secciones en celular: 20–24px

### Radios, bordes y sombras

- **`border-radius: 0` en todo.** Ni un borde redondeado en toda la app. Esto es central a la dirección: hoy la app usa `rounded-lg`/`rounded-xl`/`rounded-full` por todas partes y hay que sacarlos.
- Filetes: `1px solid var(--color-border)`.
- Filetes de sección: gradiente que se desvanece — `height:1px; background: linear-gradient(to right, #DFD0C2, rgba(223,208,194,0))`.
- Marcas de acento: `2px solid var(--color-mark)`, siempre sólidas y cortas.
- **Sin sombras.** Sacar todos los `shadow-sm` / `shadow-lg`. La elevación es un filete o un cambio de fondo.
- Grilla de bloques: en vez de `gap` entre tarjetas, un contenedor con `background: var(--color-border)` y `gap: 1px` — los filetes son el gap.

### Textura

Fondo de papel con grano sobre la crema. Un solo `background-image` en el fondo general:

```css
body {
  background-color: var(--color-background);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.16'/%3E%3C/svg%3E");
  background-blend-mode: multiply;
}
```

Es un SVG inline, no un archivo. `opacity 0.16` + `multiply` da un grano apenas perceptible. No aplicarlo a superficies oliva.

---

## Screens / Views

### Chrome compartido

**Cabecera móvil** — `app/(app)/layout.tsx`. Fondo `--color-primary`, `padding: 14px 20px 12px`, `border-bottom: 2px solid var(--color-mark)`, `position: sticky; top: 0` con `padding-top: env(safe-area-inset-top)` (se mantiene).
- Wordmark: `ANANJA` en display 25px, tracking `0.16em`, color `--color-background`.
- Bajada: `Aimogasta · La Rioja` en 11px uppercase tracking `0.16em`, `--color-on-primary-muted`. En pantallas que no son Inicio, se reemplaza por el nombre de la pantalla (`Comprobantes`, `Gastos`, `Caja`, `Depósito`, `Avisos`), alineado a la derecha.
- Campana a la derecha, 22px, `stroke-width 1.5`, color `--color-background`. Badge: cuadrado de 7×7px en `--color-mark`, `position:absolute; right:-2px; top:0`. **No es un círculo** — sacar el `rounded-full`.
- En pantallas de formulario la cabecera cambia a: flecha `←` (carácter tipográfico a 22px, no un SVG) + título de la pantalla en display 22px.

**Tab bar móvil** — `components/tab-bar.tsx`. Fondo `--color-surface-raised`, `border-top: 1px solid var(--color-border)`, `padding-bottom: calc(8px + env(safe-area-inset-bottom))` (se mantiene). Cinco ítems `flex:1`, cada uno `min-height:44px`, `padding: 11px 0 8px`, columna centrada con `gap:5px`.
- Ícono 21px, `stroke-width 1.5`.
- Etiqueta 11px uppercase tracking `0.12em`.
- Inactivo: `--color-text-muted`.
- Activo: `--color-primary`, etiqueta en `font-weight:500`, más `border-top: 2px solid var(--color-mark); margin-top:-1px` (la marca tapa el filete del contenedor).
- Etiquetas: `Inicio · Compr. · Gastos · Caja · Stock`. "Comprobantes" se abrevia a "Compr." para que las cinco entren sin apretarse.

**Rail de escritorio** — markup nuevo en `app/(app)/layout.tsx`, visible desde `md:`. Ancho 238px, fondo `--color-primary`, `padding: 24px 0 20px`, columna.
- Bloque de marca: `padding: 0 24px 22px`, `border-bottom: 1px solid var(--color-primary-line)`. Wordmark display 28px tracking `0.16em` + bajada `Aceite de oliva extra virgen` a 10px uppercase tracking `0.10em` en `--color-on-primary-muted` (tracking corto a propósito: con más se parte en dos líneas).
- Ítems: `padding: 12px 24px`, `gap:12px`, ícono 19px, etiqueta 12px uppercase tracking `0.14em`.
  - Inactivo: color `#a8ab98`, `border-left: 2px solid transparent`.
  - Activo: color `--color-background`, fondo `--color-primary-active`, `border-left: 2px solid var(--color-mark)`, etiqueta en 500.
- Avisos va al pie, separado por `border-top: 1px solid var(--color-primary-line)`, con la campana + badge cuadrado y el contador en un rectángulo bordó (`background: var(--color-accent)`, `padding: 1px 7px`, 11px).

**Barra de alerta de stock bajo** — componente nuevo, aparece bajo la cabecera en Inicio y Stock cuando hay `bajo_umbral`. Fondo `--color-accent`, `padding: 11px 20px` (40px en escritorio), fila con `gap:10px`: cuadrado de 6×6px crema + texto 12px crema (el número en `font-weight:600`) + a la derecha `Ingresar` en 10px uppercase tracking `0.14em`, color `#e8cfc6`, `border-bottom: 1px solid #b07a72`.

**Bloque oliva de total** — el patrón visual central del rediseño. Fondo `--color-primary`, en celular `padding: 14px 20px 20px` (integrado a la cabecera, sin separación), en escritorio `padding: 26px 30px 22px`.
- Rótulo `TOTAL EN CAJA` a 10px uppercase tracking `0.22em` en `--color-on-primary-muted`.
- Cifra en display 46px (celular) / 56–58px (escritorio), crema, tabular, con los centavos en `--color-primary-2`.
- Desglose de las tres cajas: en celular, tres columnas `flex:1` separadas por `border-right: 1px solid var(--color-primary-line)` sobre un `border-top` del mismo color con `padding-top:14px`; rótulo 11px uppercase + cifra 15px sin decimales. En escritorio, el desglose va al lado de la cifra, separado por `border-left` y `padding-left:36px`, con cifras a 22–24px y una tercera línea de `Inicial 300.000,00` a 10px.

**Rótulo de sección** — fila con `gap:10px`: texto 10px uppercase tracking `0.22em` en `--color-text-muted` + un `flex:1` de 1px con el gradiente que se desvanece. Se usa antes de cada bloque de contenido.

**Fila reglada** — el reemplazo de las tarjetas. `padding: 12–16px 0`, `border-bottom: 1px solid var(--color-border)`, `align-items: baseline`.
- Movimientos: signo (`+` en `--color-secondary`, `−` y `±` según corresponda en `--color-accent`) en un ancho fijo de 13px → concepto 13–14px + meta 11px en columna → monto tabular 16px alineado a la derecha.
- Comprobantes en celular: miniatura 52×52px (`background: --color-surface-raised`, `border: 1px solid --color-border`) → monto en display 26px + meta 12px → chip del medio de pago a la derecha.
- El medio de pago **no es un chip con fondo**: es texto 10px uppercase tracking `0.14em` con `border-bottom: 1px solid var(--color-mark)`.

---

### 1. `/login`

Pantalla partida. Mitad superior oliva a sangre, mitad inferior crema.

- **Arriba** (`flex:1`, `justify-content:flex-end`, `padding: 40px 28px 0`): `Aimogasta · La Rioja` a 10px uppercase tracking `0.26em` en `--color-on-primary-muted` → `ANANJA` en display 52px tracking `0.14em` crema → marca de `56×2px` en `--color-mark` con `margin-top:18px` → bajada en display 22px *itálica* color `--color-primary-2`: *"Aceite de oliva extra virgen de un olivo de cuatrocientos años."*
- **Abajo** (`margin-top:44px`, fondo crema con grano, `padding: 28px 28px 34px`, `gap:20px`): rótulo `CUENTA DEL EQUIPO` → campo Email → campo Contraseña → botón `INGRESAR`.
- **Los inputs no tienen caja.** Rótulo 10px uppercase tracking `0.18em` en `--color-text-muted` + input de `min-height:44px` con **solo** `border-bottom: 1px solid var(--color-primary)` (borde `--color-border` cuando está vacío), fondo transparente, texto 16px. Nada de `rounded-lg border bg-surface`.
- Botón: `min-height:54px`, fondo `--color-primary`, texto crema 13px `font-weight:500` uppercase tracking `0.16em`.
- Error: texto 12px `--color-accent` bajo el campo, sin caja.
- El placeholder del email pasa a un ejemplo genérico (`equipo@example.com`).

### 2. `/` (Inicio)

`app/(app)/page.tsx`. **Cambia el orden de la información** — el cliente pidió priorizar stock, plata en caja y alertas.

Orden en celular:
1. Cabecera oliva con wordmark + **bloque de total con desglose** (todo en un mismo bloque oliva, sin corte).
2. Barra bordó de stock bajo (condicional).
3. **Botellas en depósito** — dos bloques `--color-surface-raised` en grilla `1fr 1fr` con `gap:1px` sobre `--color-border`. Cada uno: `padding: 16px 14px 14px`, cifra display 60px `line-height:0.9` (bordó si `bajo_umbral`, oliva si no) → presentación en display 19px con `margin-top:8px` → estado a 10px uppercase tracking `0.14em` (`Stock bajo` en bordó / `Mínimo 10` en muted).
4. **Movimientos de hoy** — tres filas regladas.
5. Dos botones al pie: `+ COMPROBANTE` (relleno oliva, `flex:1.4`) y `+ GASTO` (contorno oliva, `flex:1`), ambos `min-height:52px`.

En escritorio: rail + barra de alerta + saludo (`Buen día, Lucía` en display 38px, con la fecha larga arriba a 10px uppercase) + botones a la derecha → bloque oliva de total a lo ancho → grilla `1fr 1.15fr`: izquierda las dos etiquetas de depósito (cifras a 76px), derecha los movimientos del día (cuatro filas + `Ver historial completo`).

Las tarjetas de saldo por medio de pago (`SaldoMiniCard`) desaparecen como componente — su contenido se absorbe en el desglose del bloque oliva.

### 3. `/comprobantes`

**Celular**: cabecera oliva con wordmark + `COMPROBANTES` a la derecha, y debajo un bloque separado por `border-top` con `Cobrado en septiembre` + cifra display 32px y `147 registros` a 11px a la derecha. Después una fila de filtros por medio de pago (`Todos / Banco / M. Pago / Efec.`, `min-height:38px`, activo relleno oliva, inactivos contorno) sobre `border-bottom`. Después la lista agrupada por período con rótulos `HOY` / `AGOSTO`. Botón `+ CARGAR COMPROBANTE` al final de la lista, no arriba.

**Escritorio**: título + filtros + botón `+ CARGAR` → franja oliva de métricas (`Cobrado en el mes` en display 40px + `Botellas 312` / `Ticket promedio $ 42.810` / `Medio más usado Banco`) → tabla.

Tabla: encabezados a 10px uppercase tracking `0.16em` en muted sobre `border-bottom`. Anchos de columna: miniatura 56px, fecha 82px, monto 150px (alineado a la derecha, display 27px), medio 140px, botellas `flex:1`, vendedor 100px. Filas con `padding: 11px 0` y `border-bottom`.

**Nota:** la franja de métricas de escritorio (ticket promedio, botellas, medio más usado) es contenido **nuevo** que no existe en la app. Requiere agregados sobre `comprobantes`/`comprobante_items`. Está marcado como opcional — si no se quiere calcular, se saca la franja y no se rompe nada.

### 4. `/comprobantes/nuevo`

`components/comprobante-form.tsx`. Misma secuencia de 7 pasos y misma lógica (OCR que propone, `crear_comprobante`, `permitir_negativo`). Cambia la presentación:

- Cabecera de formulario: `←` + `Nuevo comprobante` en display 22px.
- Cada paso lleva un rótulo numerado a 10px uppercase tracking `0.22em`: `1 · FOTO DEL COMPROBANTE`, `2 · MONTO`, `3 · MEDIO DE PAGO`, `4 · BOTELLAS VENDIDAS`, `5 · QUIÉN Y CUÁNDO`.
- **Dropzone de foto**: 150px de alto, `border: 1px solid var(--color-border)` (no dashed), fondo `--color-surface-raised`, ícono de comprobante 30px + `SACAR FOTO O ELEGIR ARCHIVO` a 12px uppercase tracking `0.10em`. Sin emoji.
- **Monto**: el input pierde la caja. `border-bottom: 2px solid var(--color-primary)`, `$` en display 22px muted + valor en display 50px oliva tabular. El aviso de OCR queda como texto 11px muted debajo (`Verificalo antes de guardar — el número se leyó automáticamente.`), y el rótulo `LEÍDO DE LA FOTO` a 10px uppercase en `--color-accent` a la derecha del `2 · MONTO`.
- **Medio de pago**: tres celdas en grilla `1fr 1fr 1fr` con `gap:1px` sobre `--color-border`, `min-height:52px`. Seleccionada: fondo oliva, texto crema, 500. No seleccionadas: fondo `--color-surface-raised`, texto oliva. Sin bordes redondeados, sin bordes individuales.
- **Steppers**: fila reglada por producto (`border-bottom`), presentación en display 21px a la izquierda, control a la derecha: un grupo con `border: 1px solid var(--color-border)` que contiene `−` (46×46px, `border-right`), cantidad (52px, display 26px, centrada) y `+` (46×46px, fondo oliva, texto crema). **Cuadrados, no círculos.**
- **Vendedor / Fecha**: en una fila de dos columnas, cajas de `min-height:48px` con `border: 1px solid var(--color-border)` y fondo `--color-surface`.
- **Nota**: textarea de `min-height:60px`, mismo borde, placeholder a 13px muted.
- **Botón**: `min-height:56px`, relleno oliva, `GUARDAR COMPROBANTE` 13px 500 uppercase tracking `0.14em`. Debajo, centrado, 11px muted: `Descuenta 1×250 y 2×500 del depósito.` (se arma con las cantidades cargadas — ayuda a confirmar antes de guardar).

### 5. `/gastos`

**Celular**: igual que Comprobantes — cabecera con `Gastado en septiembre` + `12 registros`, chips de categoría en fila con scroll horizontal, lista agrupada por mes. Cada fila: `−` bordó (13px de ancho) → nombre de categoría en display 22px + meta 11px (`Efectivo · Marcos · 01/09 · Foto`) → monto 18px 500 en bordó. Botón `+ REGISTRAR GASTO` al final.

**Escritorio**: título + filtro de mes + botón → franja oliva (`Gastado en el mes` display 40px + `Categoría más pesada Flete` / `Contra lo cobrado 2,8 %` / `Mes anterior $ 41.900`) → chips de categoría → tabla (fecha 82px, categoría 150px, monto 150px a la derecha con `−` delante, medio 140px, vendedor `flex:1`, foto 60px).

La columna "Foto" muestra la palabra `Foto` o `—` en 12px muted — **no un emoji de cámara**. Hoy la app usa 📷; hay que sacarlo (igual que 🧾 y 📄 en Comprobantes).

**Nota:** `Contra lo cobrado` y `Mes anterior` son métricas nuevas, opcionales, igual que en Comprobantes.

### 6. `/caja`

`app/(app)/page.tsx` de caja + `components/caja/saldo-card.tsx`.

**Celular**: cabecera oliva con el bloque de total (sin desglose, acá el desglose está abajo en detalle) → sección `POR CAJA` con tres filas regladas: rótulo del medio a 11px uppercase + saldo en display 29px a la derecha; debajo, en 11px, `Inicial $ 300.000,00` con el monto en `border-bottom: 1px dotted var(--color-text-muted)` (sigue siendo editable inline) y `HISTORIAL` a la derecha con `border-bottom: 1px solid var(--color-mark)` → sección `ÚLTIMOS MOVIMIENTOS` con tres filas → botón `AJUSTAR SALDO` de contorno al pie.

La tarjeta de saldo pierde el `rounded-xl border bg-surface p-4` — pasa a ser una fila reglada.

**Escritorio**: título + `AJUSTAR SALDO` → bloque oliva de total con el desglose de las tres cajas al lado (cada una con su saldo a 24px y su inicial a 10px) → `HISTORIAL UNIFICADO` como tabla: signo 16px, fecha 82px, concepto `flex:1`, caja 140px, monto 150px a la derecha, **saldo corrido 130px** a la derecha en 13px muted.

**Nota:** la columna de saldo corrido es nueva y requiere una window function sobre el historial. Es opcional.

### 7. `/stock`

`app/(app)/stock/page.tsx` + `components/stock/stock-card.tsx` + `stock-badge.tsx`.

**Celular**: cabecera + barra bordó de alerta → dos bloques de etiqueta (uno por presentación) en columna con `gap:1px` sobre `--color-border`. Cada bloque: fondo `--color-surface-raised`, `padding:18px`, **`border-left: 3px solid`** (bordó si bajo umbral, `--color-secondary` si está en regla). Arriba: presentación en display 26px + estado a 10px uppercase, y la cifra en display 64px `line-height:0.85` a la derecha. Abajo, separado por `border-top: 1px solid var(--color-border)` con `padding-top:12px`, dos valores editables a 11px: `Costo $ 3.200,00` y `Mínimo 12`, ambos con `border-bottom: 1px dotted` (misma edición inline que hoy).

Después dos botones en fila: `+ INGRESAR` (relleno oliva) y `− EGRESO` (contorno bordó). Después `ÚLTIMOS MOVIMIENTOS` con tres filas regladas.

**Escritorio**: los dos bloques en grilla `1fr 1fr` con las cifras a 96px y los editables en columna a la izquierda; el historial completo abajo como tabla (signo 16px, fecha 82px, concepto `flex:1` con el link al comprobante subrayado en ocre, vendedor 110px, cantidades 160px a la derecha).

El `StockBadge` pierde el `rounded-xl border p-4` y el borde rojo completo — la señal de stock bajo pasa a ser el `border-left` de 3px + la cifra en bordó + el rótulo.

### 8. `/notificaciones` (Avisos)

`app/(app)/notificaciones/page.tsx`. Se renombra a **Avisos** en la UI (el nombre de la ruta no cambia).

- Banner de instalación (`NotificacionesBanner`): `border: 1px solid var(--color-border)`, fondo `--color-surface-raised`, `padding: 14px 16px`. Rótulo `INSTALÁ LA APP` a 10px uppercase tracking `0.20em` en `--color-accent` 500 + párrafo 13px `line-height:1.55` muted. El texto dice "la app", no "Olba".
- Feed agrupado por día con rótulos de sección `HOY` / `AYER` (hoy no hay agrupación).
- Cada aviso: fila con `gap:14px`, **una barra vertical de 3px** a la izquierda (`--color-accent` para stock bajo, `--color-border` para el resto) en vez del círculo con ícono. Contenido: tipo a 10px uppercase tracking `0.18em` 500 + tiempo relativo 11px muted a la derecha → **cuerpo del aviso en display 19px (celular) / 22px (escritorio) `line-height:1.3`** → acción opcional (`INGRESAR STOCK`) a 11px uppercase con `border-bottom: 1px solid var(--color-mark)`.
- Los avisos pasan a estar redactados como frases completas, no como título + detalle: *"250 ml quedó en 8 unidades, por debajo del mínimo de 12."*, *"Marcos registró $ 8.400 en Envases, pagado en efectivo."* Eso cambia cómo se arman `titulo`/`detalle` al insertar en `notificaciones` — o se compone la frase en el cliente a partir de los campos existentes.
- El ícono por tipo (`IconStock` / `IconExpense`) desaparece del feed.
- En escritorio el contenido se limita a `max-width: 760px` y el botón `ACTIVAR AVISOS` va arriba a la derecha.

---

## Interactions & Behavior

Toda la funcionalidad se mantiene. Solo cambia el aspecto de los estados.

### Estados de interacción

| Estado | Tratamiento |
|---|---|
| Hover en botón relleno | `background: var(--color-primary-hover)` |
| Hover en botón de contorno | `background: color-mix(in oklab, var(--color-primary) 6%, transparent)` |
| Hover en fila de lista | `background: color-mix(in oklab, var(--color-border) 30%, transparent)` |
| Pressed | mismo fondo del hover, un paso más oscuro |
| `:focus-visible` | `outline: 2px solid var(--color-mark); outline-offset: 2px` — nunca el anillo azul del navegador |
| Disabled | `opacity: 0.45` |
| `::selection` | fondo `color-mix(in oklab, var(--color-mark) 25%, transparent)` |

Definir `a` y `a:hover` explícitamente: `color: var(--color-accent)` / `color: var(--color-primary-hover)`. Hoy no están definidos y los links que agregue alguien salen azules.

### Estado vacío

Ejemplo: lista de comprobantes sin registros. **No es una caja con borde punteado y un emoji** (como hoy). Es contenido centrado verticalmente con `padding: 0 32px`:
1. Marca de `40×2px` en `--color-mark`.
2. Frase en display 30px `line-height:1.2`: *"Todavía no cargaste ningún comprobante."*
3. Párrafo 13px `line-height:1.6` muted: *"Cuando registres el primero, acá vas a ver el monto, las botellas y quién lo cargó. Sacale una foto al comprobante y el monto se lee solo."*
4. Botón relleno `+ CARGAR EL PRIMERO`, `min-height:52px`.

Mismo patrón para las otras listas, cambiando la copia.

### Estado de carga

`components/loading-skeleton.tsx` y los `loading.tsx` de cada ruta. Esqueleto **reglado**, no tarjetas grises redondeadas:
- Rótulo de sección `CARGANDO`.
- Cinco filas con `padding: 14px 0` y `border-bottom: 1px solid var(--color-border)`.
- Cada fila: bloque de 52×52px en `--color-surface-raised` + dos barras del mismo color (una de 22px de alto al 52–70% de ancho, otra de 11px al 38–58%).
- Las filas se van desvaneciendo hacia abajo: `opacity` 1, 1, 1, 0.55, 0.3.
- Sin animación de pulso.

### Estado de error

1. Barra bordó bajo la cabecera: cuadrado de 6px + `Sin conexión · mostrando lo último guardado`.
2. Contenido centrado: marca de `40×2px` en `--color-accent` → frase en display 30px (*"No pudimos traer la lista."*) → párrafo 13px muted (*"Revisá la conexión del celular y probá de nuevo. Nada de lo que cargaste se perdió."*) → dos botones en fila: `REINTENTAR` (relleno) y `VOLVER` (contorno).

Los mensajes de error de campo son texto 12px en `--color-accent` bajo el campo, sin caja de fondo. Sacar el `rounded-lg border border-danger/30 bg-danger/5 p-3` actual.

### Modales

Tres modales, todos con el mismo patrón: **hoja inferior**, no diálogo centrado.

- Velo: `position: fixed; inset: 0; background: var(--color-scrim)`, contenido `justify-content: flex-end`.
- Hoja: ancho completo, fondo crema con grano, `border-top: 2px solid` (`--color-mark` para acciones normales, `--color-accent` para destructivas), `padding: 22–24px 20px`, `border-radius: 0`. **Sin `max-width:sm`, sin `rounded-2xl`, sin `shadow-lg`.**
- En escritorio (`sm:`) puede centrarse, manteniendo esquinas rectas y el filete superior.

**Ajustar saldo** (`components/caja/ajustar-saldo-button.tsx`):
título `Ajustar saldo` en display 26px + `CERRAR` a 11px uppercase muted a la derecha → `CAJA` (tres celdas en grilla `gap:1px`, `min-height:44px`) → `TIPO DE AJUSTE` (dos celdas; `+ SUMAR` seleccionado en oliva, `− RESTAR` en `--color-surface-raised` con texto bordó — **el seleccionado de "restar" ya no es un relleno rojo**) → `MONTO` sin caja, `border-bottom: 2px`, display 40px → `NOTA (OBLIGATORIA)` textarea → `VENDEDOR` select → botones `GUARDAR AJUSTE` (`flex:1.6`, relleno) + `CANCELAR` (`flex:1`, contorno `--color-border`) → nota al pie 11px muted: *"Los ajustes no se editan ni se borran — se compensan con uno nuevo."*

**Stock insuficiente** (dentro de `comprobante-form.tsx`, ya existe):
`border-top: 2px solid var(--color-accent)`. Rótulo `STOCK INSUFICIENTE` a 10px uppercase bordó 500 → fila con la cifra disponible en display 72px `line-height:0.85` bordó + `DISPONIBLES` a 10px uppercase debajo, y al lado la explicación en display 22px `line-height:1.3`: *"Quedan 8 unidades de 250 ml y estás vendiendo 12. Si guardás igual, el depósito queda en −4."* → dos botones: `REVISAR CANTIDADES` (contorno oliva) y `GUARDAR IGUAL` (relleno bordó).

La copia actual dice solo "Quedan N unidades de X". La nueva agrega cuánto se está vendiendo y en cuánto queda el stock — se calcula con los datos que ya devuelve el error `STOCK_INSUFICIENTE` más las cantidades del formulario.

**Eliminar comprobante** (`components/comprobante-delete-button.tsx`):
`border-top: 2px solid var(--color-accent)`. Rótulo `ELIMINAR COMPROBANTE` → **consecuencia concreta** en display 24px: *"Se van a devolver 1×250 y 2×500 al depósito y se restan $ 48.000 de la caja Banco."* → `No se puede deshacer.` en 12px muted → botones `CANCELAR` (contorno `--color-border`) + `ELIMINAR` (relleno bordó).

### Responsive

Un solo breakpoint: `md` (768px).

- `< md`: cabecera oliva arriba + tab bar abajo, contenido en una columna, `padding: 0 20px`.
- `>= md`: rail lateral de 238px + contenido, `padding: 34px 40px`. La tab bar se oculta. La cabecera móvil se oculta (la marca vive en el rail). Los bloques de total pasan a horizontal, las listas a tablas, las grillas de una a dos columnas.
- Las cifras heroicas escalan: total 46 → 58px, depósito 60 → 96px.
- Las tablas de escritorio no necesitan scroll horizontal en 1120px con los anchos indicados.

---

## State Management

Sin cambios. Todo el estado, los hooks, los `useEffect`, los RPC de Supabase, el Realtime de la campana, el `localStorage` del último vendedor (`olba:ultimo-vendedor`) y la lógica del OCR siguen exactamente igual.

Lo único que se agrega, y es opcional:
- Las métricas de las franjas oliva de Comprobantes y Gastos (ticket promedio, botellas del mes, % sobre lo cobrado, mes anterior) — agregados nuevos.
- El saldo corrido en el historial de Caja — window function.

Si no se implementan, se quitan esos bloques del layout y el resto queda intacto.

---

## Assets

- **Íconos**: los cinco SVG de `components/icons.tsx` (`IconHome`, `IconReceipt`, `IconExpense`, `IconCashBox`, `IconStock`) más `IconBell`, sin cambios de path. Solo cambia `strokeWidth` a `1.5` y el tamaño según el contexto (21px en la tab bar, 19px en el rail, 20px en miniaturas, 30px en el dropzone).
- **Emojis**: se eliminan todos (🧾 📄 📷). Donde había un emoji de comprobante o PDF va `IconReceipt`; donde había una cámara va `IconReceipt` (dropzone) o la palabra `Foto` (columna de gastos). La flecha de volver y el `+` de los botones son caracteres tipográficos (`←`, `+`), no SVG.
- **Textura**: SVG `feTurbulence` inline en CSS, no un archivo de imagen.
- **Íconos de la PWA**: `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — sin cambios. El `manifest.ts` ya declara `theme_color: "#2C2F25"` y `background_color: "#F4EFEA"`, que coinciden con el rediseño; no hay que tocarlo.
- **Fotografía**: el rediseño no usa fotos. Si más adelante se quieren agregar (etiquetas, olivos), pedirle al cliente material real.

---

## Files

En este bundle:

| Archivo | Qué es |
|---|---|
| `Ananja - Rediseño v2.dc.html` | **La referencia a implementar.** Las 8 pantallas en celular y escritorio, los 3 estados y los 3 modales. |
| `Ananja - UI actual.dc.html` | La UI de hoy recreada del código, para comparar antes/después. |
| `Ananja - Rediseño (1a y 1b).dc.html` | Las dos direcciones exploradas antes de unificar. Contexto, no implementar. |
| `support.js` | Runtime de los prototipos. No es código de producción, no copiarlo. |

Abrir los `.dc.html` en un navegador — funcionan solos, sin build.

En el repo (`ananja/`), archivos a tocar:

| Archivo | Qué cambia |
|---|---|
| `app/globals.css` | Agregar los 6 tokens nuevos; cambiar `--font-body` a DM Sans; agregar `--font-display`; grano y resets en `body`; definir `a` / `a:hover` / `:focus-visible` / `::selection` |
| `app/layout.tsx` | Cargar Instrument Serif; quitar Inter |
| `app/(app)/layout.tsx` | Cabecera oliva nueva; rail de escritorio (markup nuevo) |
| `components/tab-bar.tsx` | Tab bar nueva; abreviar "Comprobantes" |
| `components/icons.tsx` | `strokeWidth: 1.5` |
| `components/notification-bell.tsx` | Badge cuadrado en `--color-mark` |
| `app/(app)/page.tsx` | Reordenar Inicio; bloque de total; etiquetas de depósito; movimientos del día |
| `app/(app)/comprobantes/page.tsx` | Lista agrupada; sin emojis; franja de métricas |
| `components/comprobante-form.tsx` | Pasos numerados; inputs sin caja; steppers cuadrados; modal de stock |
| `components/comprobante-delete-button.tsx` | Modal de hoja inferior; copia con consecuencia |
| `app/(app)/gastos/page.tsx` | Lista agrupada; chips; sin emoji de cámara |
| `app/(app)/gastos/medio-pago-chips.tsx`, `categoria-select.tsx` | Chips y select nuevos |
| `app/(app)/caja/page.tsx` | Bloque de total; filas regladas |
| `components/caja/saldo-card.tsx` | De tarjeta a fila reglada |
| `components/caja/saldo-mini-card.tsx` | Se elimina (absorbido por el bloque de total) |
| `components/caja/ajustar-saldo-button.tsx` | Modal de hoja inferior |
| `app/(app)/caja/[medio]/` | Historial con el tratamiento de tabla |
| `app/(app)/stock/page.tsx` | Bloques de etiqueta; botones |
| `components/stock/stock-card.tsx`, `stock-badge.tsx` | `border-left` de 3px; cifras grandes; sin borde rojo |
| `components/stock/movimiento-form.tsx` | Mismos patrones de formulario |
| `app/(app)/notificaciones/page.tsx` | Feed con barra vertical; agrupado por día; frases completas |
| `components/notificaciones-banner.tsx` | Banner nuevo; texto "la app" |
| `app/(auth)/login/page.tsx` | Pantalla partida |
| `components/loading-skeleton.tsx` + todos los `loading.tsx` | Esqueleto reglado |

---

## Checklist de "está bien implementado"

- [ ] Cero `rounded-*` en toda la app.
- [ ] Cero `shadow-*`.
- [ ] Cero emojis.
- [ ] Ningún texto por debajo de 10px; nada en la nav por debajo de 11px.
- [ ] Todos los números de dinero y unidades con `tabular-nums`.
- [ ] `#A9762F` aparece solo como línea o marca de 2px, nunca como relleno ni como texto.
- [ ] Ningún texto sobre oliva usa un gris más oscuro que `#a8ab98`.
- [ ] `:focus-visible` con anillo ocre en todo elemento interactivo; ningún anillo azul por defecto.
- [ ] Targets táctiles ≥ 44px; safe-areas iOS respetadas (arriba y abajo).
- [ ] Ningún hex literal en los componentes — todo por `var(--color-*)` o clases de Tailwind derivadas del `@theme`.
