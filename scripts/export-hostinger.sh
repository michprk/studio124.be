#!/usr/bin/env bash
# ==========================================================================
# Prépare la version « nom de domaine » du site, prête à téléverser chez
# Hostinger (ou tout hébergeur Apache / LiteSpeed avec PHP).
#
#   bash scripts/export-hostinger.sh                 # pour https://studio124.be
#   bash scripts/export-hostinger.sh autre.be        # pour un autre domaine
#
# Résultat : dist/studio124-hostinger.zip, à extraire dans public_html.
# Ce que le script change par rapport à la version GitHub Pages :
#   - adresses /studio124.be/… → /… et https://michprk.github.io/studio124.be → https://domaine
#   - le site devient visible sur Google (plus de « noindex », sauf la page 404)
#   - les mentions « maquette de démonstration » disparaissent
#   - les formulaires envoient les demandes à api/contact.php (e-mail côté serveur)
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN="${1:-studio124.be}"
OUT="dist/public_html"
ZIP="dist/studio124-hostinger.zip"

bash scripts/build.sh > /dev/null
rm -rf dist
mkdir -p "$OUT/api"
cp -r ./*.html robots.txt sitemap.xml site.webmanifest favicon.svg favicon.ico favicon-32.png \
      apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png og.jpg .htaccess .well-known assets licenses "$OUT"/
cp api/contact.php api/.htaccess "$OUT/api/"
rm -f "$OUT/assets/js/boot.js"

export DOMAIN
find "$OUT" -type f \( -name '*.html' -o -name '*.xml' -o -name '*.txt' -o -name '*.webmanifest' -o -name '*.js' -o -name '*.css' \) -print0 |
  xargs -0 perl -0pi -e '
    s{https://michprk\.github\.io/studio124.be}{__SITE__}g;
    s{/studio124.be/}{/}g;
    s{"/studio124.be"}{""}g;
    s{data-base="/studio124.be"}{data-base=""}g;
    s{__SITE__}{https://$ENV{DOMAIN}}g;
    s{\n<!-- Maquette de démonstration[^\n]*-->}{}g;
    s{\n<meta name="robots" content="noindex, nofollow">}{}g unless $ARGV =~ m{404\.html$};
    s{data-api=""}{data-api="/api"}g;
    s{\s*<p class="note">Maquette de démonstration.*?</p>}{}gs;
    s{\s*<p class="demo-note">.*?</p>}{}gs;
    s{GitHub Pages — GitHub, Inc\., 88 Colin P\. Kelly Jr\. Street, San Francisco, CA 94107, États-Unis \(phase de démonstration\)\.}{Hostinger International Ltd., 61 Lordou Vironos Street, 6023 Larnaca, Chypre.}g;
    s{GitHub Pages pendant la phase de démonstration, puis l’hébergeur du nom de domaine}{Hostinger International Ltd., Chypre}g;
    s{<!--#include [a-z-]+-->\n}{}g;
    s{<!--/include-->}{}g;
  '
# robots.txt : à la racine du domaine, les chemins n’ont plus de préfixe
perl -pi -e 's{^Disallow: /(partials|scripts)/}{Disallow: /$1/}' "$OUT/robots.txt"

# Contrôles : plus aucune trace de l’adresse GitHub ni du mode démonstration
# (la page 404 garde volontairement son « noindex »)
if grep -rIl -e "michprk" -e "Maquette de démonstration" "$OUT" ||
   grep -rIlP "(?<![/.a-z])/studio124.be/" "$OUT" ||
   grep -rIl --exclude=404.html "noindex" "$OUT" ; then
  echo "✗ Il reste des adresses GitHub ou des mentions de démonstration (fichiers ci-dessus)." >&2
  exit 1
fi
TODO=$(grep -rIo "à compléter\|à confirmer" "$OUT" --include=*.html | wc -l)
[ "$TODO" -gt 0 ] && echo "⚠ $TODO mention(s) « à compléter » restent dans les pages légales (conception du site…)."

# Archive .zip (fichiers directement à la racine, fichiers cachés compris)
WIN_OUT=$(cygpath -w "$PWD/$OUT" 2>/dev/null || echo "$OUT")
WIN_ZIP=$(cygpath -w "$PWD/$ZIP" 2>/dev/null || echo "$ZIP")
powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory('$WIN_OUT', '$WIN_ZIP')"

echo "Prêt : $ZIP ($(du -h "$ZIP" | cut -f1)) pour https://$DOMAIN"
echo "À extraire dans le dossier public_html de l’hébergement."
