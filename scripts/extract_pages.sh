#!/usr/bin/env bash
# Renderiza las paginas de cada PDF a PNG en pages/<slug>/ para que los extractores las lean.
# Uso: scripts/extract_pages.sh [pdfs/CARDIOLOGIA.pdf ...]   (sin argumentos: todos)
set -euo pipefail
cd "$(dirname "$0")/.."

for pdf in "$@"; do
    slug=$(basename "$pdf" .pdf | tr '[:upper:] ' '[:lower:]-')
    mkdir -p "pages/$slug"
    pdftoppm -png -r 144 "$pdf" "pages/$slug/p"
    echo "$slug: $(ls "pages/$slug" | wc -l) paginas"
done
