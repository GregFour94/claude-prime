// Règles communes aux fiches outils, partagées par la page (outils.html), le Worker et les tests.
// Une fiche enregistrée dans R2 ressemble à :
// {
//   "outilId": "o-d9c99e37",          identifiant technique stable (jamais modifié)
//   "version": 3,                     augmente de 1 à chaque modification (contrôle des conflits)
//   "champs": { "nom": "Aider", ... },  valeurs, dans l'ordre d'affichage
//   "types":  { "nom": "texte", ... },  type de chaque champ : conserve booléens, dates, listes…
//   "creeLe": "...", "modifieLe": "..."
// }

export const ID_OUTIL = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const CLE_CHAMP = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export const MAX_CHAMPS = 40;
export const MAX_COMMENTAIRE = 1000;
export const MAX_URL = 500;

// Types de champ reconnus et leurs limites.
export const TYPES = {
  texte: { libelle: 'texte', max: 200 },
  texteLong: { libelle: 'texte long', max: 2000 },
  url: { libelle: 'lien', max: MAX_URL },
  categorie: { libelle: 'catégorie' },
  date: { libelle: 'date' },
  booleen: { libelle: 'oui / non' },
  nombre: { libelle: 'nombre' },
  liste: { libelle: 'liste', maxElements: 50, maxElement: 100 }
};

// Les 5 champs présents dans chaque outil de la liste d'origine.
export const CHAMPS_DE_BASE = {
  nom: { type: 'texte', libelle: 'Nom', requis: true, max: 80 },
  url: { type: 'url', libelle: 'Lien (URL)', requis: false, max: MAX_URL },
  description: { type: 'texteLong', libelle: 'Description', requis: true, max: 300 },
  categorie: { type: 'categorie', libelle: 'Catégorie', requis: true },
  type: { type: 'texte', libelle: 'Type', requis: true, max: 30 }
};

const CONTROLE_MULTILIGNE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CONTROLE_LIGNE = /[\u0000-\u001F\u007F]/;
const estObjet = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function estUrlHttp(valeur) {
  if (typeof valeur !== 'string' || valeur.length > MAX_URL || CONTROLE_LIGNE.test(valeur)) return false;
  try {
    const u = new URL(valeur);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password;
  } catch (e) {
    return false;
  }
}

export function estDate(valeur) {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  const [a, m, j] = valeur.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

export function limiteDuChamp(cle, type) {
  return (CHAMPS_DE_BASE[cle] && CHAMPS_DE_BASE[cle].max) || (TYPES[type] && TYPES[type].max);
}

// Vérifie une valeur selon son type. Renvoie un message d'erreur ou null.
function erreurValeur(cle, type, valeur, requis, categories) {
  const max = limiteDuChamp(cle, type);
  switch (type) {
    case 'texte':
    case 'texteLong': {
      if (typeof valeur !== 'string') return 'texte attendu';
      if (type === 'texte' ? CONTROLE_LIGNE.test(valeur) : CONTROLE_MULTILIGNE.test(valeur)) return 'caractères de contrôle interdits';
      if (requis && !valeur.trim()) return 'obligatoire';
      if (valeur.length > max) return `${max} caractères au maximum`;
      return null;
    }
    case 'url':
      if (typeof valeur !== 'string') return 'texte attendu';
      if (valeur === '') return requis ? 'obligatoire' : null;
      return estUrlHttp(valeur) ? null : `adresse http:// ou https:// valide attendue (${MAX_URL} caractères au maximum)`;
    case 'categorie':
      if (typeof valeur !== 'string' || !categories.includes(valeur)) return 'catégorie inconnue';
      return null;
    case 'date':
      if (typeof valeur !== 'string') return 'date attendue';
      if (valeur === '') return requis ? 'obligatoire' : null;
      return estDate(valeur) ? null : 'date AAAA-MM-JJ valide attendue';
    case 'booleen':
      return typeof valeur === 'boolean' ? null : 'oui / non attendu';
    case 'nombre':
      return typeof valeur === 'number' && Number.isFinite(valeur) && Math.abs(valeur) <= 1e12 ? null : 'nombre attendu';
    case 'liste': {
      const t = TYPES.liste;
      if (!Array.isArray(valeur)) return 'liste attendue';
      if (valeur.length > t.maxElements) return `${t.maxElements} éléments au maximum`;
      for (const el of valeur) {
        if (typeof el !== 'string' || !el.trim() || CONTROLE_LIGNE.test(el)) return 'éléments de texte non vides attendus';
        if (el.length > t.maxElement) return `${t.maxElement} caractères au maximum par élément`;
      }
      return null;
    }
    default:
      return 'type de champ inconnu';
  }
}

// Valide { champs, types } avant enregistrement.
// options.categories : clés de catégories autorisées.
// options.anciensTypes : types de la fiche enregistrée ; aucun champ existant ne peut disparaître
// ni changer de type (les champs personnalisés sont ainsi toujours conservés).
// Renvoie une liste d'erreurs [{ champ, message }] (vide si tout est valide).
export function validerFiche({ champs, types }, { categories, anciensTypes } = {}) {
  const erreurs = [];
  if (!estObjet(champs) || !estObjet(types)) return [{ champ: null, message: 'champs et types doivent être des objets' }];
  const cles = Object.keys(champs);
  if (cles.length > MAX_CHAMPS) erreurs.push({ champ: null, message: `${MAX_CHAMPS} champs au maximum` });
  const clesTypes = Object.keys(types);
  if (clesTypes.length !== cles.length || clesTypes.some(c => !Object.prototype.hasOwnProperty.call(champs, c))) {
    erreurs.push({ champ: null, message: 'chaque champ doit avoir exactement un type' });
  }
  for (const [cle, def] of Object.entries(CHAMPS_DE_BASE)) {
    if (!Object.prototype.hasOwnProperty.call(champs, cle)) erreurs.push({ champ: cle, message: 'champ obligatoire manquant' });
    else if (types[cle] !== def.type) erreurs.push({ champ: cle, message: `type « ${def.type} » attendu` });
  }
  if (anciensTypes) {
    for (const [cle, type] of Object.entries(anciensTypes)) {
      if (!Object.prototype.hasOwnProperty.call(champs, cle)) erreurs.push({ champ: cle, message: 'ce champ existe déjà et ne peut pas être supprimé' });
      else if (types[cle] !== type) erreurs.push({ champ: cle, message: `le type « ${type} » de ce champ ne peut pas changer` });
    }
  }
  for (const cle of cles) {
    if (!CLE_CHAMP.test(cle)) { erreurs.push({ champ: cle, message: 'nom de champ invalide' }); continue; }
    if (!TYPES[types[cle]]) { erreurs.push({ champ: cle, message: 'type de champ inconnu' }); continue; }
    const base = CHAMPS_DE_BASE[cle];
    const msg = erreurValeur(cle, types[cle], champs[cle], base ? base.requis : false, categories || []);
    if (msg) erreurs.push({ champ: cle, message: msg });
  }
  return erreurs;
}

export function validerCommentaire(texte) {
  if (typeof texte !== 'string') return 'texte attendu';
  if (CONTROLE_MULTILIGNE.test(texte)) return 'caractères de contrôle interdits';
  if (!texte.trim()) return 'le commentaire est vide';
  if (texte.length > MAX_COMMENTAIRE) return `${MAX_COMMENTAIRE} caractères au maximum`;
  return null;
}

// Fiche version 1 construite à partir d'un outil de la liste d'origine.
export function ficheInitiale(outil, maintenant = new Date().toISOString()) {
  const champs = {}, types = {};
  for (const [cle, def] of Object.entries(CHAMPS_DE_BASE)) {
    champs[cle] = outil[cle] ?? '';
    types[cle] = def.type;
  }
  return { outilId: outil.outilId, version: 1, champs, types, creeLe: maintenant, modifieLe: maintenant };
}
