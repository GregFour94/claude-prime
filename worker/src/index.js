// Worker de la boîte à outils : fiches outils et commentaires stockés dans R2.
//
// Lecture publique :
//   GET  /api/fiches                              toutes les fiches + leurs commentaires
// Modifications (Cloudflare Access + vérification du jeton ici, voir acces.js) :
//   GET  /api/admin/session                       qui est connecté, peut-il modifier ?
//   GET  /api/admin/connexion                     passe par la connexion Access puis revient sur outils.html
//   POST /api/admin/initialisation                crée les fiches manquantes (n'écrase jamais)
//   PUT  /api/admin/fiches/:outilId               modifie une fiche (version attendue obligatoire)
//   POST /api/admin/fiches/:outilId/commentaires  ajoute un commentaire
//
// Stockage R2 (liaison FICHES) :
//   fiches/<outilId>.json                          une fiche JSON par outil
//   commentaires/<outilId>/<horodatage>-<id>.json  un objet par commentaire
// Les commentaires sont rangés par outilId : changer le nom ou l'URL d'un outil ne les touche pas.

import { CATEGORIES, OUTILS_INITIAUX } from '../../outils-data.js';
import { ID_OUTIL, validerFiche, validerCommentaire, ficheInitiale } from '../../outils-schema.js';
import { verifierAcces, protectionManquante } from './acces.js';

const MAX_CORPS = 32 * 1024;
const PREFIXE_FICHES = 'fiches/';
const PREFIXE_COMMENTAIRES = 'commentaires/';
const CATEGORIES_VALIDES = Object.keys(CATEGORIES);

const cleFiche = id => `${PREFIXE_FICHES}${id}.json`;

// Horodatage des commentaires strictement croissant (au sein d'une même instance du Worker),
// pour que deux commentaires envoyés dans la même milliseconde gardent leur ordre.
let dernierHorodatage = 0;
function horodatage() {
  dernierHorodatage = Math.max(Date.now(), dernierHorodatage + 1);
  return dernierHorodatage;
}

function json(donnees, status = 200, entetes = {}) {
  return new Response(JSON.stringify(donnees), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...entetes
    }
  });
}

const erreur = (status, code, message, extra = {}) => json({ code, message, ...extra }, status);

// --- Lecture et écriture R2 ---

async function lireFiche(env, id) {
  const objet = await env.FICHES.get(cleFiche(id));
  if (!objet) return null;
  return { fiche: JSON.parse(await objet.text()), etag: objet.etag };
}

async function listerCles(env, prefixe) {
  const cles = [];
  let cursor;
  do {
    const page = await env.FICHES.list({ prefix: prefixe, cursor, limit: 1000 });
    cles.push(...page.objects.map(o => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return cles;
}

async function lireObjets(env, cles) {
  const resultats = [];
  for (let i = 0; i < cles.length; i += 50) {
    const lot = await Promise.all(cles.slice(i, i + 50).map(async cle => {
      const objet = await env.FICHES.get(cle);
      return objet ? JSON.parse(await objet.text()) : null;
    }));
    resultats.push(...lot.filter(Boolean));
  }
  return resultats;
}

// Ce qui est renvoyé publiquement : les adresses e-mail des éditeurs restent dans R2.
const fichePublique = f => ({
  outilId: f.outilId, version: f.version, champs: f.champs, types: f.types,
  creeLe: f.creeLe, modifieLe: f.modifieLe
});
const commentairePublic = c => ({ commentaireId: c.commentaireId, outilId: c.outilId, texte: c.texte, creeLe: c.creeLe });

async function lireCorpsJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return { erreur: erreur(415, 'type_contenu', 'Corps JSON attendu.') };
  }
  const texte = await request.text();
  if (texte.length > MAX_CORPS) return { erreur: erreur(413, 'trop_gros', 'Envoi trop volumineux.') };
  try {
    const corps = JSON.parse(texte);
    if (corps === null || typeof corps !== 'object' || Array.isArray(corps)) throw new Error();
    return { corps };
  } catch (e) {
    return { erreur: erreur(400, 'json_invalide', 'JSON invalide.') };
  }
}

// --- Routes ---

async function routeLecture(request, env) {
  const origine = request.headers.get('Origin');
  const autorisees = String(env.ORIGINES_LECTURE || '').split(/[\s,]+/).filter(Boolean);
  const cors = origine && autorisees.includes(origine)
    ? { 'access-control-allow-origin': origine, vary: 'Origin' }
    : { vary: 'Origin' };
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' } });
  }
  if (request.method !== 'GET') return erreur(405, 'methode', 'Méthode non autorisée.');
  if (!env.FICHES) return erreur(503, 'stockage_absent', 'Stockage R2 non relié au Worker.');

  const [fiches, commentaires] = await Promise.all([
    listerCles(env, PREFIXE_FICHES).then(cles => lireObjets(env, cles)),
    listerCles(env, PREFIXE_COMMENTAIRES).then(cles => lireObjets(env, cles))
  ]);
  const presentes = new Set(fiches.map(f => f.outilId));
  const parOutil = {};
  const ordre = (a, b) => String(a.creeLe).localeCompare(String(b.creeLe)) || String(a.commentaireId).localeCompare(String(b.commentaireId));
  for (const c of commentaires.sort(ordre)) {
    (parOutil[c.outilId] ||= []).push(commentairePublic(c));
  }
  return json({
    fiches: fiches.map(fichePublique),
    commentaires: parOutil,
    manquantes: OUTILS_INITIAUX.filter(o => !presentes.has(o.outilId)).length
  }, 200, cors);
}

async function initialiser(env) {
  let creees = 0, dejaPresentes = 0;
  const maintenant = new Date().toISOString();
  for (let i = 0; i < OUTILS_INITIAUX.length; i += 10) {
    await Promise.all(OUTILS_INITIAUX.slice(i, i + 10).map(async outil => {
      // Ne jamais écraser : une fiche déjà présente (modifiée ou non) est laissée telle quelle.
      if (await env.FICHES.head(cleFiche(outil.outilId))) { dejaPresentes++; return; }
      await env.FICHES.put(cleFiche(outil.outilId), JSON.stringify(ficheInitiale(outil, maintenant)), {
        httpMetadata: { contentType: 'application/json' }
      });
      creees++;
    }));
  }
  return json({ creees, dejaPresentes });
}

async function modifierFiche(request, env, id, email) {
  const { corps, erreur: e } = await lireCorpsJson(request);
  if (e) return e;
  if (!Number.isInteger(corps.version)) return erreur(400, 'invalide', 'Version de la fiche attendue.', { erreurs: [{ champ: null, message: 'version manquante' }] });

  const actuelle = await lireFiche(env, id);
  if (!actuelle) return erreur(404, 'fiche_absente', 'Cette fiche n\'existe pas encore dans R2 (initialisation à faire).');
  if (corps.version !== actuelle.fiche.version) {
    return erreur(409, 'conflit', 'La fiche a été modifiée entre-temps.', { fiche: fichePublique(actuelle.fiche) });
  }
  const erreurs = validerFiche({ champs: corps.champs, types: corps.types }, {
    categories: CATEGORIES_VALIDES,
    anciensTypes: actuelle.fiche.types
  });
  if (erreurs.length) return erreur(400, 'invalide', 'Fiche invalide.', { erreurs });

  const nouvelle = {
    ...actuelle.fiche,
    champs: corps.champs,
    types: corps.types,
    version: actuelle.fiche.version + 1,
    modifieLe: new Date().toISOString(),
    modifiePar: email
  };
  // Écriture conditionnelle : échoue si l'objet a changé depuis la lecture ci-dessus.
  const ecrit = await env.FICHES.put(cleFiche(id), JSON.stringify(nouvelle), {
    onlyIf: { etagMatches: actuelle.etag },
    httpMetadata: { contentType: 'application/json' }
  });
  if (!ecrit) {
    const recente = await lireFiche(env, id);
    return erreur(409, 'conflit', 'La fiche a été modifiée entre-temps.', { fiche: recente ? fichePublique(recente.fiche) : null });
  }
  return json({ fiche: fichePublique(nouvelle) });
}

async function ajouterCommentaire(request, env, id, email) {
  const { corps, erreur: e } = await lireCorpsJson(request);
  if (e) return e;
  const message = validerCommentaire(corps.texte);
  if (message) return erreur(400, 'invalide', 'Commentaire invalide.', { erreurs: [{ champ: 'texte', message }] });
  if (!(await env.FICHES.head(cleFiche(id)))) return erreur(404, 'fiche_absente', 'Cette fiche n\'existe pas encore dans R2.');

  const instant = horodatage();
  const commentaire = { commentaireId: crypto.randomUUID(), outilId: id, texte: corps.texte, creeLe: new Date(instant).toISOString(), auteur: email };
  await env.FICHES.put(`${PREFIXE_COMMENTAIRES}${id}/${String(instant).padStart(15, '0')}-${commentaire.commentaireId}.json`, JSON.stringify(commentaire), {
    httpMetadata: { contentType: 'application/json' }
  });
  return json({ commentaire: commentairePublic(commentaire) }, 201);
}

async function routeAdmin(request, env, chemin) {
  const manque = protectionManquante(env);
  if (manque) {
    return erreur(503, 'modifications_desactivees', `Modifications désactivées : ${manque}.`);
  }

  // Les envois doivent venir de la page servie par ce même Worker (protection contre les
  // requêtes forgées depuis un autre site avec le cookie Access de la personne).
  if (request.method !== 'GET') {
    const origine = request.headers.get('Origin');
    if (!origine || origine !== new URL(request.url).origin) {
      return erreur(403, 'origine_refusee', 'Requête refusée : origine non autorisée.');
    }
  }

  const acces = await verifierAcces(request, env);
  if (!acces.ok) return erreur(acces.status, acces.code, acces.message, acces.email ? { email: acces.email } : {});

  if (chemin === '/api/admin/session' && request.method === 'GET') {
    return json({ modificationsActives: true, autorise: true, email: acces.email });
  }
  if (chemin === '/api/admin/connexion' && request.method === 'GET') {
    return new Response(null, { status: 302, headers: { location: '/outils.html', 'cache-control': 'no-store' } });
  }
  if (chemin === '/api/admin/initialisation' && request.method === 'POST') {
    return initialiser(env);
  }
  const m = chemin.match(/^\/api\/admin\/fiches\/([^/]+)(\/commentaires)?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (!ID_OUTIL.test(id)) return erreur(400, 'invalide', 'Identifiant d\'outil invalide.');
    if (!m[2] && request.method === 'PUT') return modifierFiche(request, env, id, acces.email);
    if (m[2] && request.method === 'POST') return ajouterCommentaire(request, env, id, acces.email);
    return erreur(405, 'methode', 'Méthode non autorisée.');
  }
  return erreur(404, 'introuvable', 'Route inconnue.');
}

export default {
  async fetch(request, env) {
    const chemin = new URL(request.url).pathname;
    try {
      if (chemin === '/api/fiches') return await routeLecture(request, env);
      if (chemin.startsWith('/api/admin/')) return await routeAdmin(request, env, chemin);
      if (chemin.startsWith('/api/')) return erreur(404, 'introuvable', 'Route inconnue.');
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Introuvable', { status: 404 });
    } catch (e) {
      console.error(e);
      return erreur(500, 'erreur_interne', 'Erreur interne.');
    }
  }
};
