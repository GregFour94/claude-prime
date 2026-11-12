# Revue d’éco-conception du site Claude Prime

- **Date :** 12/11/2026
- **Règles :** skill `green-claude` 1.5.0 de l’Institut du Numérique Responsable (`rules/ecoconception.json` et `rules/langages/javascript.json`)
- **Périmètre :** les 8 pages, `site.css`, `outils.js`, `outils-data.js`, `outils-schema.js`, le Worker (`worker/src/`) et le workflow GitHub
- **Méthode :** relecture du code règle par règle. Le script d’audit de la skill (`eco-audit.sh`) n’a pas été exécuté : l’environnement de travail refuse d’exécuter du code téléchargé.

Verdicts : `FAIL` défaut confirmé (corrigé ici), `REVIEW` à trancher, `PASS` vérifié.

## Corrigé

```
FAIL ECO-FRONT-11  index.html, outils.html  couleurs, remise à zéro, body et pied de page recopiés dans chaque page
                   Fix: base commune dans site.css (une seule feuille, mise en cache par le navigateur)
FAIL ECO-JS-04     outils.js  liste reconstruite à chaque frappe dans la recherche
                   Fix: filtrage 150 ms après la dernière frappe
FAIL ECO-JS-08     outils.js  2 écouteurs recréés par carte à chaque affichage (142 par rendu)
                   Fix: un seul écouteur sur la grille
FAIL ECO-ARCH-06   .github/workflows/outils-worker.yml  tests lancés à chaque push, navigateur retéléchargé à chaque fois
                   Fix: déclenchement limité aux fichiers du site et du Worker ; navigateur mis en cache
FAIL ECO-UX-08     toutes les pages  défauts d’accessibilité (voir audits/rgaa-2026-11-12.md)
                   Fix: corrections listées dans ce rapport
```

## À trancher

```
REVIEW ECO-HEB-03  hébergement  pas d’en-tête Cache-Control propre au site (fichiers non versionnés)
                   Tranche : choisir une durée de cache pour site.css et les .js, ou les versionner
REVIEW ECO-HEB-12  wrangler.jsonc  journalisation du Worker activée (observability) sans durée choisie
                   Tranche : durée de conservation des journaux, échantillonnage éventuel
REVIEW ECO-BACK-09 worker/src/index.js  GET /api/fiches renvoie toutes les fiches et tous les commentaires
                   Tranche : nombre de commentaires attendu ; pagination si plusieurs centaines
REVIEW ECO-HEB-01  hébergement  choix entre GitHub Pages et Cloudflare (le dépôt publie sur les deux)
                   Tranche : garder un seul hébergement évite une copie publiée inutile
```

## Vérifié

```
PASS ECO-ARCH-01  HTML, CSS et JavaScript sans framework ni étape de construction
PASS ECO-UX-05    polices du système, aucune police téléchargée
PASS ECO-UX-04    aucun service tiers, aucune ressource chargée depuis un autre domaine (test automatisé)
PASS ECO-UX-03    composants natifs : <dialog>, <details>, <input type="date">
PASS ECO-UX-07    aucune animation
PASS ECO-CONT-01  aucune image
PASS ECO-FRONT-13 outils.js chargé en module (différé)
PASS ECO-HEB-06   aucun lien local cassé (test automatisé du pied de page, du menu et du plan du site)
```
