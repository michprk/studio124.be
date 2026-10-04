#!/usr/bin/env bash
# ==========================================================================
# Vérifie tous les liens et fichiers référencés par les pages du site
# (« réparer un lien cassé » : rien ne doit mener à une page ou une image absente).
#   bash scripts/check-links.sh           # liens internes + ancres
#   bash scripts/check-links.sh --web     # + liens externes (connexion requise)
# Les réseaux sociaux bloquent souvent les robots : ils sont signalés à part.
# ==========================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
BASE="/studio124.be"
WEB="${1:-}"
fail=0
declare -A seen

check_file() {
  local page=$1 url=$2 path anchor target
  path="${url%%#*}"; anchor=""
  [[ "$url" == *"#"* ]] && anchor="${url#*#}"
  path="${path%%\?*}"
  if [ -z "$path" ]; then target="$page"
  else
    path="${path#$BASE}"; path="${path#/}"
    target="${path:-index.html}"
    [[ "$target" == */ ]] && target="${target}index.html"
  fi
  if [ ! -f "$target" ]; then echo "  ✗ $page → $url (fichier introuvable : $target)"; fail=1; return; fi
  if [ -n "$anchor" ] && [[ "$target" == *.html ]] && ! grep -q "id=\"$anchor\"" "$target"; then
    echo "  ✗ $page → $url (ancre #$anchor absente de $target)"; fail=1
  fi
}

for page in *.html; do
  while IFS= read -r url; do
    [ -z "$url" ] && continue
    case "$url" in
      mailto:*|tel:*|data:*) ;;
      http://*|https://*) seen["$url"]=1 ;;
      *) check_file "$page" "$url" ;;
    esac
  done < <(grep -oE '(href|src|data-full)="[^"]+"' "$page" | sed -E 's/^(href|src|data-full)="//; s/"$//' | sed 's/&amp;/\&/g'; grep -oE '(srcset|imagesrcset)="[^"]+"' "$page" | sed -E 's/^(image)?srcset="//; s/"$//' | tr ',' '\n' | awk '{print $1}')
done
# pages et images citées dans le plan du site
while IFS= read -r url; do
  check_file "sitemap.xml" "${url#https://michprk.github.io}"
done < <(grep -oE '<(loc|image:loc)>[^<]+' sitemap.xml | sed -E 's/<(image:)?loc>//')

if [ "$WEB" = "--web" ]; then
  echo "Liens externes :"
  for url in "${!seen[@]}"; do
    case "$url" in *michprk.github.io*) continue ;; esac
    code=$(curl -s -o /dev/null -L -m 15 -A "Mozilla/5.0 (link check)" -w "%{http_code}" "$url")
    case "$code" in
      2*|3*) echo "  ✓ $code $url" ;;
      *) if [[ "$url" =~ instagram|facebook|wa\.me|google\.com/maps|googletagmanager ]]; then echo "  ~ $code $url (bloque les robots, à vérifier à la main)"; else echo "  ✗ $code $url"; fail=1; fi ;;
    esac
  done
fi

[ $fail -eq 0 ] && echo "Aucun lien cassé." || { echo "Des liens sont à réparer."; exit 1; }
