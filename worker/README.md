# Fiches modifiables de la boîte à outils (`outils.html`)

Chaque outil de `outils.html` peut être modifié (« Modifier la fiche ») et commenté
(« Ajouter un commentaire »). Les données sont gardées dans **Cloudflare R2** par un **Worker**,
et les modifications sont réservées aux personnes autorisées grâce à **Cloudflare Access**,
vérifié par le Worker lui-même.

Tant que la protection n'est pas configurée, la page reste en **lecture seule** : les boutons sont
désactivés et le Worker refuse toute modification (réponse 503).

## Fichiers

| Fichier | Rôle |
|---|---|
| `outils.html` | La page : en-tête, « Commencer ici », recherche, filtres, tableau, sources. |
| `outils.js` | Script de la page : liste, filtres, formulaires de fiche et de commentaire. |
| `outils-data.js` | Liste de départ des 71 outils, chacun avec son identifiant stable `outilId`. |
| `outils-schema.js` | Règles communes : types de champs, limites de longueur, validation des URL. |
| `worker/src/index.js` | Le Worker : lecture, initialisation, modification, commentaires. |
| `worker/src/acces.js` | Vérification du jeton Cloudflare Access et de l'autorisation. |
| `wrangler.jsonc`, `.assetsignore` | Configuration du Worker (sans secret) et fichiers non publiés. |
| `tests/` | Tests du Worker et de la page dans un navigateur. |
| `.github/workflows/outils-worker.yml` | Tests à chaque push ; déploiement sur `main` si les secrets existent. |

`index.html` et `README.md` ne sont pas modifiés.

## Données

Chaque outil a un `outilId` (ex. `o-d9c99e37`) tiré au hasard une fois pour toutes : il ne dépend
ni du nom, ni de l'URL, ni de la position dans la liste.

Dans le bucket R2 :

- `fiches/<outilId>.json` : **une fiche par outil** ;
- `commentaires/<outilId>/<horodatage>-<id>.json` : **un objet par commentaire**.

```json
{
  "outilId": "o-d9c99e37",
  "version": 2,
  "champs": { "nom": "Aider", "url": "https://…", "description": "…", "categorie": "code", "type": "CLI" },
  "types":  { "nom": "texte", "url": "url", "description": "texteLong", "categorie": "categorie", "type": "texte" },
  "creeLe": "…", "modifieLe": "…", "modifiePar": "…"
}
```

- **Champs de base** (présents dans chaque outil d'origine) : `nom` (texte, obligatoire, 80 caractères
  au maximum), `url` (http/https ou vide, 500 au maximum), `description` (obligatoire, 300 au maximum),
  `categorie` (une des 10 catégories), `type` (texte, obligatoire, 30 au maximum).
- **Champs personnalisés** : une fiche peut en contenir d'autres, avec leur type : `texte`,
  `texteLong`, `url`, `date` (AAAA-MM-JJ), `booleen`, `nombre`, `liste`. Le formulaire les affiche
  tous ; le Worker refuse qu'un champ existant disparaisse ou change de type.
- **Conflits** : chaque modification envoie la `version` de départ. Si la fiche a changé entre-temps,
  le Worker répond 409 et la page affiche un conflit au lieu d'écraser. L'écriture R2 est aussi
  conditionnelle (`onlyIf.etagMatches`) en cas de modifications simultanées.
- **Commentaires** : rangés par `outilId`, donc conservés si le nom ou l'URL change. Les adresses
  e-mail des éditeurs restent dans R2 et ne sont pas renvoyées publiquement.

## API du Worker

| Méthode et chemin | Accès | Rôle |
|---|---|---|
| `GET /api/fiches` | public | Fiches, commentaires et nombre de fiches pas encore initialisées. |
| `GET /api/admin/session` | Access | Indique si la personne connectée peut modifier. |
| `GET /api/admin/connexion` | Access | Passe par la connexion Access puis revient sur la page. |
| `POST /api/admin/initialisation` | Access | Crée **uniquement** les fiches absentes. |
| `PUT /api/admin/fiches/:outilId` | Access | Modifie une fiche (`version` obligatoire). |
| `POST /api/admin/fiches/:outilId/commentaires` | Access | Ajoute un commentaire (1000 caractères au maximum). |

Pour chaque route `/api/admin/*`, le Worker vérifie :

1. que la protection est configurée ;
2. pour un envoi, que l'en-tête `Origin` est celui du Worker ;
3. la signature du jeton `Cf-Access-Jwt-Assertion`, avec les clés publiques de l'équipe Access ;
4. l'émetteur, l'audience (`ACCESS_AUD`) et l'expiration du jeton ;
5. que l'adresse e-mail figure dans `EDITEURS`.

Aucun mot de passe ni jeton n'est présent dans le JavaScript de la page.

## Initialisation (une seule fois)

Après le premier déploiement et la configuration d'Access, ouvre `https://<ton-worker>/outils.html`,
connecte-toi, puis clique sur **« Initialiser les 71 fiches manquantes »**.

L'initialisation ne crée que les fiches absentes et ne remplace jamais une fiche existante.
Le chargement de la page et les redéploiements ne l'exécutent jamais.

## Réglages à faire soi-même

### Cloudflare

1. **R2** : crée un bucket nommé `claude-prime-outils` (le nom doit correspondre à `wrangler.jsonc`).
2. **Premier déploiement** : soit par le workflow GitHub (voir plus bas), soit depuis ton ordinateur
   avec `npx wrangler@4.151.1 deploy`. Le Worker s'appelle `claude-prime-outils` ; note son adresse
   `https://claude-prime-outils.<ton-sous-domaine>.workers.dev`.
3. **Zero Trust** :
   - crée ton équipe ; son domaine est de la forme `<équipe>.cloudflareaccess.com` ;
   - ajoute une méthode de connexion. Le code à usage unique reçu par e-mail est le plus simple.
4. **Application Access** devant le Worker, sur toute son adresse `workers.dev` :
   - soit depuis le Worker, en activant Cloudflare Access sur son domaine `workers.dev` ;
   - soit dans Zero Trust > Access > Applications > « Self-hosted », avec l'adresse du Worker.

   Ajoute une règle « Allow » limitée aux adresses des éditeurs, puis copie
   l'**Application Audience (AUD) Tag** de l'application.
5. **Variables du Worker** (Worker > Settings > Variables and Secrets, en texte simple) :
   - `ACCESS_TEAM_DOMAIN` = `<équipe>.cloudflareaccess.com`
   - `ACCESS_AUD` = l'AUD copié à l'étape 4
   - `EDITEURS` = les adresses autorisées, séparées par des virgules
   - `ORIGINES_LECTURE` (facultatif) = `https://gregfour94.github.io`, voir plus bas

   `wrangler.jsonc` contient `"keep_vars": true` : un déploiement n'efface pas ces variables.
6. **Adresses de prévisualisation** (*Preview URLs*) : désactive-les ou protège-les aussi par Access.
   Les modifications y resteraient refusées sans jeton valide, mais la lecture y serait publique.

### GitHub (déploiement automatique, facultatif)

Dans *Settings > Secrets and variables > Actions*, ajoute :

- `CLOUDFLARE_API_TOKEN` : jeton API Cloudflare créé avec le modèle « Edit Cloudflare Workers » ;
- `CLOUDFLARE_ACCOUNT_ID` : l'identifiant de ton compte Cloudflare.

Sans ces secrets, le workflow lance seulement les tests.

## Site GitHub Pages

La copie publiée par GitHub Pages (`gregfour94.github.io/claude-prime/outils.html`) ne peut pas
utiliser la connexion Access, car elle n'est pas servie à la même adresse que le Worker. Elle affiche
donc la liste d'origine en lecture seule. **Les modifications se font depuis l'adresse du Worker.**

Pour que GitHub Pages affiche aussi les données enregistrées, il faut que `GET /api/fiches` soit
lisible sans connexion. Cela demande un domaine personnel relié à Cloudflare : Access protège alors
seulement `/api/admin/*`. Il reste à renseigner l'adresse du Worker dans
`<meta name="outils-api">` de `outils.html` et `ORIGINES_LECTURE`.

## Tests

```bash
npm ci
npx playwright install chromium   # une seule fois
npm test                          # Worker (55) + boîte à outils dans Chromium (12) + pages, accessibilité et pied de page (9)
node tests/helpers/serveur.mjs    # essai manuel : données en mémoire, éditeur fictif connecté
```

Les tests utilisent un R2 en mémoire et un Access simulé (clés de test générées à chaque lancement) :
aucun compte ni secret réel n'est nécessaire.

## Limites connues

- Le chargement lit toutes les fiches et tous les commentaires en une fois : c'est adapté à quelques
  centaines d'objets, pas à des milliers.
- L'initialisation vérifie l'absence de chaque fiche avant de l'écrire. Deux initialisations lancées
  exactement en même temps pendant qu'un éditeur modifie la même fiche pourraient, en théorie, se
  croiser : lance-la une seule fois.
- Pas de suppression ni de modification de commentaire, ni d'ajout de nouvel outil depuis la page.
