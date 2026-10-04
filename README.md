# Studio 124 — site vitrine

Studio photo &amp; vidéo de 200 m² à Schaerbeek (Rue Verte 124, gare du Nord), ouvert 24 h/24.
Maquette en ligne : **https://michprk.github.io/studio124.be/** (non indexée tant que le studio n’a pas validé).

## L’idée

Un packshot façon Apple pour un studio photo : fond noir, un seul accent (le jaune du logo
Studio 124, `#eaaf43`), titres **Archivo** élargi, petites étiquettes (sur-titres, formulaire,
viseur, tarifs) en **Inria Serif**, italiques **Instrument Serif** ; les gravures de l’appareil 3D
sont en **JetBrains Mono**, comme les données EXIF d’un appareil.

**Le héros** : un appareil photo en 3D (Three.js, modélisé dans le code, aucun fichier 3D)
tourne lentement et suit la souris. **Un seul geste** suffit — un cran de molette, un glissé
au doigt, la flèche du bas, un clic sur l’appareil ou sur « Déclenchez » : l’appareil pivote
dans l’autre sens pour vous regarder, avance, le diaphragme se ferme, le déclencheur
s’enfonce, **flash**… et un diaphragme plein écran s’ouvre sur le site, directement sur la
« photo » du plateau avec l’interface du viseur. Un petit « clac » d’obturateur synthétisé
accompagne le flash (lien « Couper le son » dans le pied de page).

## Pensé pour la conversion (B2B)

- Proposition de valeur dès le héros : « Le studio qui ne dort jamais. » + bouton
  **Réserver un créneau**, prix d’appel (dès 55 €/h) et lien devis.
- Réassurance visible : chiffres du plateau, « tout est compris », équipe, matériel détaillé,
  FAQ (paiement, annulation, horaires), adresse et parking.
- Tarifs réels du studio (repris de booking.studio124.be) et **formulaire de réservation avec
  estimation en direct** (tarif matin/semaine/week-end, options, +15 € dans les 24 h).
- Ligne de téléphone affichée selon l’heure de Bruxelles (jour 9 h – 18 h / soirée).
- Barre d’action mobile (Appeler / Réserver).

## Fichiers

```
index.html            accueil (une page, toutes les sections)
cgu.html              conditions de réservation + mentions légales
confidentialite.html  RGPD + cookies
404.html              page « Hors champ » qui retrouve les anciennes adresses Wix
partials/             blocs communs (en-tête, pied de page, cookies, icônes, <head>)
assets/js/camera3d.js l’appareil photo 3D (Three.js)
assets/js/hero3d.js   chargement de la 3D dans le héros (repli image fixe sans WebGL)
assets/js/app.js      déclenchement, flash, diaphragme, formulaire, cookies, 404…
assets/js/sound.js    son du déclencheur (Web Audio)
assets/js/boot.js     script en ligne du <head> (HTTPS, préférence d’animation)
api/                  réception du formulaire : contact.php (Hostinger) ou Cloudflare Worker
scripts/              build.sh, check-links.sh, export-hostinger.sh
```

## Après chaque modification

```bash
bash scripts/build.sh        # blocs communs, empreinte CSP, versions ?v=
bash scripts/check-links.sh  # aucun lien ni fichier cassé (--web pour les liens externes)
```

## Mise en ligne sur le domaine

```bash
bash scripts/export-hostinger.sh   # → dist/studio124-hostinger.zip, à extraire dans public_html
```

Le zip retire le « noindex » et les mentions de démonstration, branche le formulaire sur
`api/contact.php` et active les redirections des anciennes adresses Wix (`.htaccess`).

## Ce qui est en place

- **Icônes** : favicon SVG/ICO/PNG, icône iOS, icônes Android (dont « maskable »), manifeste.
- **SEO** : titres et descriptions, données structurées (LocalBusiness, offres, FAQ), Open Graph
  (`og.jpg`), `sitemap.xml`, `robots.txt`.
- **Images** : WebP en plusieurs tailles (`srcset`), chargement différé, dimensions fixées.
- **Vitesse** : polices et scripts hébergés sur le site, 3D chargée en module, rendu mis en
  pause hors écran, défilement amorti Lenis.
- **Contraste & accessibilité** : textes clairs sur fond noir (AA), focus visibles, navigation
  au clavier (y compris le déclenchement), bouton « Réduire les animations ».
- **Responsive** : du téléphone au grand écran ; l’appareil se cale dans l’espace libre.
- **Page 404 personnalisée** + redirections des anciennes adresses (`.htaccess`).
- **Formulaire validé** (navigateur + serveur), **anti-spam** (champ piège, délai, limite).
- **Mesure d’audience** : Google Analytics 4 chargé uniquement après accord — renseigner
  l’identifiant `G-…` dans `data-ga` de la balise `<html>` de chaque page.

## À confirmer avec le studio

- Tarifs (repris de l’agenda en ligne : 55/65/75 €/h, 250 €/h avec photographe ou vidéaste).
- Numéro WhatsApp (0472 04 05 01 supposé), noms et rôles de l’équipe, accord pour les photos.
- Identifiant Google Analytics, adresse d’envoi du formulaire, nom de domaine.
