#!/usr/bin/env bash
# Chequeo de sanidad de las migraciones (lo corre el CI, pero anda igual local).
#
#  1. Cada archivo de supabase/migrations/ se llama NNNN_nombre.sql.
#  2. Los números NNNN no se repiten (un duplicado = dos migraciones "0042").
#  3. Huecos en la numeración: solo se avisa, no falla.
#  4. Las migraciones se renderizan para Ananja (public / comprobantes) y para
#     Germá (miel / comprobantes-miel), y no queda ningún __SCHEMA__ ni
#     __BUCKET__ sin reemplazar en el resultado.
#
# Variable opcional: MIGRATIONS_DIR (por defecto supabase/migrations), para
# poder probar el script contra una copia sin tocar el repo.
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dir="${MIGRATIONS_DIR:-$raiz/supabase/migrations}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

errores=0
error() {
  echo "::error::$1"
  errores=$((errores + 1))
}

if [ ! -d "$dir" ]; then
  echo "::error::No existe el directorio de migraciones: $dir"
  exit 1
fi

shopt -s nullglob
archivos=("$dir"/*.sql)
if [ "${#archivos[@]}" -eq 0 ]; then
  echo "::error::No hay ningún archivo .sql en $dir"
  exit 1
fi

# 1) Nombres válidos y 2) números únicos.
numeros=()
for f in "${archivos[@]}"; do
  nombre="$(basename "$f")"
  if [[ ! "$nombre" =~ ^([0-9]{4})_[a-z0-9_]+\.sql$ ]]; then
    error "La migración '$nombre' no sigue el patrón NNNN_nombre.sql (4 dígitos, guion bajo, minúsculas/números/guiones bajos)."
    continue
  fi
  numeros+=("${BASH_REMATCH[1]}")
done

if [ "${#numeros[@]}" -gt 0 ]; then
  duplicados="$(printf '%s\n' "${numeros[@]}" | sort | uniq -d)"
  if [ -n "$duplicados" ]; then
    for n in $duplicados; do
      repetidos="$(cd "$dir" && ls "${n}"_*.sql | tr '\n' ' ')"
      error "Número de migración duplicado $n: $repetidos"
    done
  fi

  # 3) Huecos: solo aviso.
  previo=""
  for n in $(printf '%s\n' "${numeros[@]}" | sort -u); do
    if [ -n "$previo" ] && [ $((10#$n)) -ne $((10#$previo + 1)) ]; then
      echo "::warning::Hueco en la numeración de migraciones: después de $previo viene $n."
    fi
    previo="$n"
  done
fi

# 4) Render para cada schema/bucket.
renderizar() {
  local schema="$1" bucket="$2" salida="$tmp/$1.sql"
  if ! node "$raiz/supabase/render.mjs" --schema "$schema" --bucket "$bucket" --out "$salida" 2> "$tmp/$schema.err"; then
    error "Falló el render de las migraciones para schema '$schema' / bucket '$bucket': $(tr '\n' ' ' < "$tmp/$schema.err")"
    return
  fi
  if [ ! -s "$salida" ]; then
    error "El render para schema '$schema' salió vacío."
    return
  fi
  if grep -nE '__SCHEMA__|__BUCKET__' "$salida" > "$tmp/$schema.pend"; then
    error "Quedaron placeholders sin reemplazar en el render de '$schema' (primeras líneas del SQL renderizado): $(head -n 3 "$tmp/$schema.pend" | tr '\n' ' ')"
  fi
}

# render.mjs lee todo el directorio de migraciones del repo; si se probó con
# MIGRATIONS_DIR distinto, el render sigue usando el del repo (solo los
# chequeos 1-3 miran la copia).
renderizar public comprobantes
renderizar miel comprobantes-miel

if [ "$errores" -gt 0 ]; then
  echo "::error::Chequeo de migraciones: $errores problema(s)."
  exit 1
fi

echo "Migraciones OK: ${#archivos[@]} archivos, numeración sin duplicados, render public/miel sin placeholders pendientes."
