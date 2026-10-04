#!/usr/bin/env bash
# ==========================================================================
# À lancer après chaque modification d’une page, d’un bloc commun (partials/),
# de boot.js, main.css ou d’un script :
#   bash scripts/build.sh
# 1. insère les blocs communs (en-tête, pied de page, cookies, icônes…) dans
#    chaque page, entre <!--#include nom--> et <!--/include--> ; le lien de la
#    page courante reçoit aria-current="page" ;
# 2. recopie assets/js/boot.js dans le <head> (script en ligne) et recalcule son
#    empreinte SHA-256 pour la politique de sécurité (CSP), dans les pages,
#    dans _headers (Netlify / Cloudflare) et dans .htaccess (Apache) ;
# 3. met à jour le numéro de version des fichiers (?v=…) pour vider les caches,
#    y compris l’import du module 3D dans hero3d.js.
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
BOOT=$(cat assets/js/boot.js)
case "$BOOT" in *"<"*) echo "boot.js ne doit contenir aucun caractère « < »" >&2; exit 1 ;; esac
HASH=$(printf '%s' "$BOOT" | openssl dgst -sha256 -binary | openssl base64 -A)
VER=$( { cat assets/css/main.css assets/js/app.js assets/js/sound.js assets/js/camera3d.js assets/vendor/lenis.min.js; sed -E 's/\?v=[A-Za-z0-9_]+//g' assets/js/hero3d.js; } | openssl dgst -md5 | awk '{print substr($NF,1,10)}')
# API des formulaires (Cloudflare Workers) et mesure d’audience (Google Analytics 4, après accord)
CSP="default-src 'self'; script-src 'self' 'sha256-$HASH' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.workers.dev; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
CSP_HEADER="$CSP; frame-ancestors 'none'; upgrade-insecure-requests"
export BOOT CSP CSP_HEADER VER
for f in *.html; do
  perl -0pi -e '
    sub part { my $n = shift; local $/; open(my $fh, "<:raw", "partials/$n.html") or die "partials/$n.html introuvable\n"; my $c = <$fh>; close $fh; $c =~ s/\s+\z/\n/; return $c; }
    s{<!--#include ([a-z-]+)-->.*?<!--/include-->}{"<!--#include $1-->\n" . part($1) . "<!--/include-->"}gse;
    if (/<html[^>]*\bdata-page="([^"]+)"/) { my $p = $1; s{(data-page-link="\Q$p\E")}{$1 aria-current="page"}g; }
    s{<script>[^<]*</script>}{"<script>$ENV{BOOT}</script>"}e;
    s{(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")}{$1$ENV{CSP}$2};
    s{\?v=[A-Za-z0-9_]+}{?v=$ENV{VER}}g;
  ' "$f"
  echo "  $f"
done
perl -pi -e 's{\?v=[A-Za-z0-9_]+}{?v=$ENV{VER}}g' assets/js/hero3d.js
perl -pi -e 's{^(\s*Content-Security-Policy: ).*$}{$1$ENV{CSP_HEADER}}' _headers
perl -pi -e 's{(Header always set Content-Security-Policy ")[^"]*(")}{$1$ENV{CSP_HEADER}$2}' .htaccess
echo "  hero3d.js, _headers, .htaccess"
echo "CSP : sha256-$HASH"
echo "Version : $VER"
