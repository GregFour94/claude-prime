// Boîte à outils : liste, filtres, fiches modifiables et commentaires.
// Les données enregistrées viennent du Worker (R2). S'il ne répond pas, la liste d'origine
// (outils-data.js) s'affiche en lecture seule.
// Sécurité : tout texte venant des fiches ou des commentaires est inséré avec textContent,
// jamais comme du HTML ; les liens ne sont créés que pour des adresses http/https valides.
import { CATEGORIES, OUTILS_INITIAUX } from './outils-data.js';
import {
  CHAMPS_DE_BASE, TYPES, MAX_COMMENTAIRE, limiteDuChamp,
  validerFiche, validerCommentaire, ficheInitiale, estUrlHttp
} from './outils-schema.js';

const API = (document.querySelector('meta[name="outils-api"]')?.getAttribute('content') || '').trim().replace(/\/+$/, '');
const $ = id => document.getElementById(id);
const grid = $('grid'), chips = $('chips'), count = $('count'), search = $('search'), statut = $('statut');

const etat = {
  fiches: new Map(OUTILS_INITIAUX.map(o => [o.outilId, ficheInitiale(o, '')])),
  enregistrees: new Set(),     // outilId des fiches présentes dans R2
  commentaires: {},            // outilId -> [{ commentaireId, texte, creeLe }]
  serveur: 'chargement',       // 'chargement' | 'ok' | 'indisponible'
  manquantes: 0,
  session: { autorise: false, raison: 'Vérification de la connexion…', connexion: false },
  message: null                // { texte, ok }
};
let active = 'all';

function el(tag, props = {}, enfants = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  n.append(...enfants);
  return n;
}

function normalize(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const formaterDate = iso => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

// --- Liste et filtres (comportement d'origine conservé) ---

function makeChip(key, label) {
  const b = el('button', { className: 'chip', textContent: label });
  b.setAttribute('aria-pressed', key === active);
  b.addEventListener('click', () => {
    active = key;
    chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    render();
  });
  chips.appendChild(b);
}

function fichesDansLOrdre() {
  const ids = OUTILS_INITIAUX.map(o => o.outilId);
  const vus = new Set(ids);
  return [...ids, ...[...etat.fiches.keys()].filter(id => !vus.has(id))].map(id => etat.fiches.get(id)).filter(Boolean);
}

function peutModifier(f) {
  return etat.session.autorise && etat.enregistrees.has(f.outilId);
}

function raisonBlocage(f) {
  if (!etat.session.autorise) return etat.session.raison;
  if (!etat.enregistrees.has(f.outilId)) return 'Fiche pas encore initialisée dans R2.';
  return '';
}

function valeurAffichee(type, v) {
  if (type === 'booleen') return v ? 'Oui' : 'Non';
  if (type === 'liste') return Array.isArray(v) ? v.join(', ') : '';
  if (type === 'date' && v) {
    const d = new Date(v + 'T00:00:00');
    return isNaN(d) ? String(v) : d.toLocaleDateString('fr-FR');
  }
  return typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v);
}

function listeCommentaires(cs) {
  return cs.map(c => el('li', {}, [
    el('time', { dateTime: c.creeLe, textContent: formaterDate(c.creeLe) }),
    el('p', { textContent: c.texte })
  ]));
}

// Lien vers un autre site, ouvert dans un nouvel onglet : la flèche est décorative,
// l'ouverture d'un onglet est annoncée aux lecteurs d'écran.
function lienExterne(href, texte) {
  return el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [
    texte,
    el('span', { 'aria-hidden': 'true', textContent: ' ↗' }),
    el('span', { className: 'sr-only', textContent: ' (nouvel onglet)' })
  ]);
}

function carte(f) {
  const { nom, url, description, categorie, type } = f.champs;
  const h = el('h3');
  if (estUrlHttp(url)) h.append(lienExterne(url, nom));
  else h.textContent = nom;

  const enfants = [
    h,
    el('p', { className: 'desc', textContent: description }),
    el('div', { className: 'tags' }, [
      el('span', { className: 'tag', textContent: CATEGORIES[categorie] || categorie }),
      el('span', { className: 'tag', textContent: type })
    ])
  ];

  // Champs personnalisés éventuels (tout ce qui n'est pas un des 5 champs de base).
  const perso = Object.keys(f.champs).filter(c => !CHAMPS_DE_BASE[c]);
  if (perso.length) {
    const dl = el('dl', { className: 'extras' });
    for (const cle of perso) {
      const t = f.types[cle], v = f.champs[cle];
      const dd = el('dd');
      if (t === 'url' && estUrlHttp(v)) dd.append(lienExterne(v, v));
      else dd.textContent = valeurAffichee(t, v);
      dl.append(el('dt', { textContent: cle }), dd);
    }
    enfants.push(dl);
  }

  const cs = etat.commentaires[f.outilId] || [];
  if (cs.length) {
    enfants.push(el('details', {}, [
      el('summary', {}, [el('span', { 'aria-hidden': 'true', textContent: '💬 ' }), pluriel(cs.length, 'commentaire')]),
      el('ul', { className: 'commentaires' }, listeCommentaires(cs))
    ]));
  }

  // Le nom de l'outil complète l'intitulé pour les lecteurs d'écran (liste des boutons de la page).
  // Les clics sont traités une seule fois pour toute la grille (voir plus bas).
  const ok = peutModifier(f), raison = raisonBlocage(f);
  const bouton = (action, intitule) => el('button', {
    className: 'btn', type: 'button', disabled: !ok, title: raison, dataset: { action, outilId: f.outilId }
  }, [intitule, el('span', { className: 'sr-only', textContent: ` : ${nom}` })]);
  enfants.push(el('div', { className: 'card-actions' }, [bouton('modifier', 'Modifier la fiche'), bouton('commenter', 'Ajouter un commentaire')]));

  return el('article', { className: 'card', dataset: { outilId: f.outilId } }, enfants);
}

function render() {
  const q = normalize(search.value.trim());
  const list = fichesDansLOrdre().filter(f =>
    (active === 'all' || f.champs.categorie === active) &&
    (!q || normalize([f.champs.nom, f.champs.description, f.champs.type, CATEGORIES[f.champs.categorie]].join(' ')).includes(q))
  );
  grid.replaceChildren(...list.map(carte));
  count.textContent = list.length + (list.length > 1 ? ' outils' : ' outil');
  if (!list.length) grid.append(el('p', { className: 'empty', textContent: 'Aucun outil ne correspond à ta recherche.' }));
  renderStatut();
}

function renderStatut() {
  const lignes = [];
  if (etat.message) lignes.push(el('p', { className: etat.message.ok ? 'alerte ok' : 'alerte', textContent: etat.message.texte }));
  if (etat.serveur === 'chargement') {
    lignes.push(el('p', { textContent: 'Chargement des fiches enregistrées…' }));
  } else if (etat.serveur === 'indisponible') {
    lignes.push(el('p', { textContent: 'Serveur des fiches injoignable : liste d\'origine affichée en lecture seule, modifications désactivées.' }));
  } else {
    const nbComm = Object.values(etat.commentaires).reduce((n, cs) => n + cs.length, 0);
    let texte = `${pluriel(etat.enregistrees.size, 'fiche')} et ${pluriel(nbComm, 'commentaire')} lus depuis le serveur.`;
    if (etat.manquantes) texte += ` ${pluriel(etat.manquantes, 'fiche')} pas encore initialisée${etat.manquantes > 1 ? 's' : ''} (affichée${etat.manquantes > 1 ? 's' : ''} depuis la liste d'origine).`;
    lignes.push(el('p', { textContent: texte }));

    const s = etat.session;
    const ligneSession = el('p', { textContent: s.autorise ? `Connecté : ${s.email}. Tu peux modifier les fiches et commenter.` : s.raison });
    if (!s.autorise && s.connexion) {
      ligneSession.append(' ', el('a', { href: API + '/api/admin/connexion', textContent: 'Se connecter' }));
    }
    lignes.push(ligneSession);

    if (s.autorise && etat.manquantes) {
      const b = el('button', { className: 'btn primaire', type: 'button', id: 'initialiser', textContent: `Initialiser les ${pluriel(etat.manquantes, 'fiche')} manquante${etat.manquantes > 1 ? 's' : ''}` });
      b.title = 'Crée dans R2 les fiches absentes à partir de la liste d\'origine. Ne remplace jamais une fiche existante.';
      b.addEventListener('click', initialiser);
      lignes.push(b);
    }
  }
  statut.replaceChildren(...lignes);
}

// --- Échanges avec le Worker ---

async function appelApi(methode, chemin, corps) {
  const options = { method: methode, cache: 'no-store', credentials: 'same-origin', redirect: 'manual', headers: {} };
  if (corps !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(corps);
  }
  const r = await fetch(API + chemin, options);
  if (r.type === 'opaqueredirect') return { status: 0, redirige: true, donnees: {} };
  let donnees = {};
  try { donnees = await r.json(); } catch (e) { /* réponse non JSON */ }
  return { status: r.status, donnees };
}

function ficheValide(f) {
  return f && typeof f.outilId === 'string' && f.champs && typeof f.champs === 'object' && f.types && typeof f.types === 'object'
    && typeof f.champs.nom === 'string';
}

async function chargerFiches() {
  try {
    const { status, donnees } = await appelApi('GET', '/api/fiches');
    if (status !== 200 || !Array.isArray(donnees.fiches)) throw new Error('réponse inattendue');
    const parId = new Map(donnees.fiches.filter(ficheValide).map(f => [f.outilId, f]));
    const fiches = new Map();
    for (const o of OUTILS_INITIAUX) fiches.set(o.outilId, parId.get(o.outilId) || ficheInitiale(o, ''));
    for (const [id, f] of parId) if (!fiches.has(id)) fiches.set(id, f);
    etat.fiches = fiches;
    etat.enregistrees = new Set(parId.keys());
    etat.commentaires = donnees.commentaires && typeof donnees.commentaires === 'object' ? donnees.commentaires : {};
    etat.manquantes = Number(donnees.manquantes) || 0;
    etat.serveur = 'ok';
  } catch (e) {
    etat.serveur = 'indisponible';
  }
}

async function chargerSession() {
  if (etat.serveur !== 'ok') {
    etat.session = { autorise: false, raison: 'Modifications désactivées : serveur injoignable.', connexion: false };
    return;
  }
  try {
    const { status, donnees, redirige } = await appelApi('GET', '/api/admin/session');
    if (status === 200 && donnees.autorise) etat.session = { autorise: true, email: donnees.email };
    else if (redirige || status === 401) etat.session = { autorise: false, raison: 'Connecte-toi pour modifier les fiches.', connexion: true };
    else if (status === 403) etat.session = { autorise: false, raison: `Connecté (${donnees.email || 'compte inconnu'}) mais non autorisé à modifier les fiches.`, connexion: false };
    else if (status === 503) etat.session = { autorise: false, raison: donnees.message || 'Modifications désactivées.', connexion: false };
    else etat.session = { autorise: false, raison: 'Modifications désactivées : connexion impossible à vérifier.', connexion: false };
  } catch (e) {
    etat.session = { autorise: false, raison: 'Modifications désactivées : connexion impossible à vérifier.', connexion: false };
  }
}

function messageRefus(status, donnees) {
  if (status === 401 || status === 0) return 'Ta connexion a expiré : reconnecte-toi puis recommence.';
  if (status === 403) return donnees.message || 'Tu n\'es pas autorisé à faire cette modification.';
  if (status === 503) return donnees.message || 'Modifications désactivées sur le serveur.';
  if (status === 404) return donnees.message || 'Fiche introuvable sur le serveur.';
  return donnees.message || `Erreur du serveur (${status}).`;
}

async function initialiser() {
  if (!confirm('Créer dans R2 les fiches manquantes à partir de la liste d\'origine ? Les fiches existantes ne seront pas touchées.')) return;
  const { status, donnees } = await appelApi('POST', '/api/admin/initialisation', {});
  etat.message = status === 200
    ? { ok: true, texte: `Initialisation : ${pluriel(donnees.creees, 'fiche')} créée${donnees.creees > 1 ? 's' : ''}, ${donnees.dejaPresentes} déjà présente${donnees.dejaPresentes > 1 ? 's' : ''} (non modifiée${donnees.dejaPresentes > 1 ? 's' : ''}).` }
    : { ok: false, texte: messageRefus(status, donnees) };
  await chargerFiches();
  render();
}

// --- Modifier la fiche ---

const dlgFiche = $('dlg-fiche'), formFiche = $('form-fiche'), zoneChamps = $('fiche-champs'), alerteFiche = $('fiche-alerte');
let edition = null; // { outilId, fiche }

function afficherAlerte(zone, texte, ok = false, enfants = []) {
  zone.replaceChildren(texte ? el('div', { className: ok ? 'alerte ok' : 'alerte', role: 'alert' }, [texte, ...enfants]) : '');
}

function champFormulaire(cle, type, valeur) {
  const base = CHAMPS_DE_BASE[cle];
  const id = 'champ-' + cle;
  const aide = base
    ? (base.requis ? ' (obligatoire)' : ' (facultatif)')
    : ` (champ personnalisé · ${TYPES[type] ? TYPES[type].libelle : type})`;
  const max = limiteDuChamp(cle, type);
  const commun = { id, dataset: { cle, type }, 'aria-describedby': 'err-' + cle };
  const format = { url: ' — adresse commençant par https:// ou http://', liste: ' — un élément par ligne' }[type] || '';
  let saisie;
  switch (type) {
    case 'texteLong':
      saisie = el('textarea', { ...commun, value: valeur ?? '', maxLength: max, rows: 3 });
      break;
    case 'url':
      saisie = el('input', { ...commun, type: 'url', value: valeur ?? '', maxLength: max, placeholder: 'https://…' });
      break;
    case 'categorie': {
      saisie = el('select', commun);
      const options = { ...CATEGORIES };
      if (!(valeur in options)) options[valeur] = String(valeur);
      for (const [k, v] of Object.entries(options)) saisie.append(el('option', { value: k, textContent: v }));
      saisie.value = valeur;
      break;
    }
    case 'date':
      saisie = el('input', { ...commun, type: 'date', value: valeur ?? '' });
      break;
    case 'booleen':
      saisie = el('input', { ...commun, type: 'checkbox', checked: valeur === true });
      break;
    case 'nombre':
      saisie = el('input', { ...commun, type: 'number', step: 'any', value: typeof valeur === 'number' ? String(valeur) : '' });
      break;
    case 'liste':
      saisie = el('textarea', { ...commun, value: Array.isArray(valeur) ? valeur.join('\n') : '', rows: 3 });
      break;
    case 'texte':
      saisie = el('input', { ...commun, type: 'text', value: valeur ?? '', maxLength: max });
      break;
    default: // type inconnu : affiché, jamais modifié, toujours renvoyé tel quel
      saisie = el('input', { ...commun, type: 'text', value: JSON.stringify(valeur), readOnly: true });
  }
  const libelle = el('label', { htmlFor: id }, [base ? base.libelle : cle, el('small', { textContent: aide + format })]);
  const erreur = el('span', { className: 'erreur', id: 'err-' + cle });
  if (type === 'booleen') {
    return el('div', { className: 'champ' }, [el('label', { className: 'case', htmlFor: id }, [saisie, base ? base.libelle : cle, el('small', { textContent: aide })]), erreur]);
  }
  return el('div', { className: 'champ' }, [libelle, saisie, erreur]);
}

function remplirFormulaire(fiche) {
  edition = { outilId: fiche.outilId, fiche };
  $('dlg-fiche-titre').textContent = `Modifier la fiche « ${fiche.champs.nom} »`;
  $('fiche-meta').textContent = `Identifiant ${fiche.outilId} · version ${fiche.version}` + (fiche.modifieLe ? ` · modifiée le ${formaterDate(fiche.modifieLe)}` : '');
  zoneChamps.replaceChildren(...Object.keys(fiche.champs).map(cle => champFormulaire(cle, fiche.types[cle], fiche.champs[cle])));
  afficherAlerte(alerteFiche, '');
  $('fiche-enregistrer').disabled = false;
}

function lireFormulaire(fiche) {
  const champs = {};
  for (const cle of Object.keys(fiche.champs)) {
    const saisie = zoneChamps.querySelector(`[data-cle="${CSS.escape(cle)}"]`);
    const type = fiche.types[cle];
    switch (type) {
      case 'texte': case 'url': case 'categorie': case 'date':
        champs[cle] = saisie.value.trim(); break;
      case 'texteLong':
        champs[cle] = saisie.value.trim(); break;
      case 'booleen':
        champs[cle] = saisie.checked; break;
      case 'nombre':
        champs[cle] = saisie.value === '' ? NaN : Number(saisie.value); break;
      case 'liste':
        champs[cle] = saisie.value.split('\n').map(x => x.trim()).filter(Boolean); break;
      default:
        champs[cle] = fiche.champs[cle];
    }
  }
  return { champs, types: { ...fiche.types } };
}

function afficherErreurs(erreurs) {
  zoneChamps.querySelectorAll('.erreur').forEach(e => { e.textContent = ''; });
  zoneChamps.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
  const generales = [];
  for (const { champ, message } of erreurs) {
    const zone = champ && $('err-' + champ);
    if (zone) {
      zone.textContent = message;
      $('champ-' + champ)?.setAttribute('aria-invalid', 'true');
    }
    else generales.push(message);
  }
  afficherAlerte(alerteFiche, 'Corrige les champs signalés.' + (generales.length ? ' ' + generales.join(' · ') : ''));
}

function ouvrirEdition(outilId) {
  remplirFormulaire(etat.fiches.get(outilId));
  dlgFiche.showModal();
}

formFiche.addEventListener('submit', async e => {
  e.preventDefault();
  if (!edition) return;
  const { fiche } = edition;
  const donnees = lireFormulaire(fiche);
  const erreurs = validerFiche(donnees, { categories: Object.keys(CATEGORIES), anciensTypes: fiche.types });
  if (erreurs.length) return afficherErreurs(erreurs);

  const bouton = $('fiche-enregistrer');
  bouton.disabled = true;
  let reponse;
  try {
    reponse = await appelApi('PUT', `/api/admin/fiches/${encodeURIComponent(fiche.outilId)}`, { version: fiche.version, ...donnees });
  } catch (err) {
    bouton.disabled = false;
    return afficherAlerte(alerteFiche, 'Serveur injoignable : la fiche n\'a pas été enregistrée.');
  }
  const { status, donnees: r } = reponse;
  if (status === 200) {
    etat.fiches.set(r.fiche.outilId, r.fiche);
    etat.message = { ok: true, texte: `Fiche « ${r.fiche.champs.nom} » enregistrée.` };
    dlgFiche.close();
    render();
    return;
  }
  bouton.disabled = false;
  if (status === 409 && r.fiche) {
    const recente = r.fiche;
    const charger = el('button', { className: 'btn', type: 'button', textContent: 'Charger la version enregistrée' });
    charger.addEventListener('click', () => {
      etat.fiches.set(recente.outilId, recente);
      render();
      remplirFormulaire(recente);
    });
    afficherAlerte(alerteFiche,
      `Conflit : cette fiche a été modifiée par quelqu'un d'autre depuis que tu l'as ouverte (version ${fiche.version} → ${recente.version}). Tes changements n'ont pas été enregistrés. `,
      false, [charger]);
    return;
  }
  if (status === 400 && Array.isArray(r.erreurs)) return afficherErreurs(r.erreurs);
  afficherAlerte(alerteFiche, messageRefus(status, r));
  if ([0, 401, 403, 503].includes(status)) { await chargerSession(); render(); }
});

$('fiche-annuler').addEventListener('click', () => dlgFiche.close());

// --- Commentaires ---

const dlgComm = $('dlg-comm'), formComm = $('form-comm'), texteComm = $('comm-texte'), alerteComm = $('comm-alerte');
let commente = null;
texteComm.maxLength = MAX_COMMENTAIRE;

function majCompteur() {
  $('comm-compteur').textContent = `${texteComm.value.length} / ${MAX_COMMENTAIRE} caractères`;
}
texteComm.addEventListener('input', majCompteur);

function ouvrirCommentaires(outilId) {
  commente = outilId;
  const f = etat.fiches.get(outilId);
  $('dlg-comm-titre').textContent = `Commentaires – ${f.champs.nom}`;
  const cs = etat.commentaires[outilId] || [];
  $('comm-liste').replaceChildren(...(cs.length ? listeCommentaires(cs) : [el('li', { textContent: 'Aucun commentaire pour l\'instant.' })]));
  texteComm.value = '';
  majCompteur();
  afficherAlerte(alerteComm, '');
  texteComm.removeAttribute('aria-invalid');
  $('comm-envoyer').disabled = false;
  dlgComm.showModal();
  texteComm.focus();
}

formComm.addEventListener('submit', async e => {
  e.preventDefault();
  const texte = texteComm.value;
  const probleme = validerCommentaire(texte);
  if (probleme) {
    texteComm.setAttribute('aria-invalid', 'true');
    return afficherAlerte(alerteComm, `Commentaire non envoyé : ${probleme}.`);
  }
  texteComm.removeAttribute('aria-invalid');
  const bouton = $('comm-envoyer');
  bouton.disabled = true;
  let reponse;
  try {
    reponse = await appelApi('POST', `/api/admin/fiches/${encodeURIComponent(commente)}/commentaires`, { texte });
  } catch (err) {
    bouton.disabled = false;
    return afficherAlerte(alerteComm, 'Serveur injoignable : le commentaire n\'a pas été enregistré.');
  }
  const { status, donnees: r } = reponse;
  if (status === 201) {
    (etat.commentaires[commente] ||= []).push(r.commentaire);
    etat.message = { ok: true, texte: `Commentaire ajouté à « ${etat.fiches.get(commente).champs.nom} ».` };
    dlgComm.close();
    render();
    return;
  }
  bouton.disabled = false;
  const details = status === 400 && Array.isArray(r.erreurs) ? r.erreurs.map(x => x.message).join(' · ') : '';
  afficherAlerte(alerteComm, details ? `Commentaire refusé : ${details}.` : messageRefus(status, r));
  if ([0, 401, 403, 503].includes(status)) { await chargerSession(); render(); }
});

$('comm-annuler').addEventListener('click', () => dlgComm.close());

// --- Démarrage ---

makeChip('all', 'Tous');
Object.entries(CATEGORIES).forEach(([k, v]) => makeChip(k, v));
grid.addEventListener('click', e => {
  const b = e.target.closest('button[data-action]');
  if (!b || b.disabled) return;
  if (b.dataset.action === 'modifier') ouvrirEdition(b.dataset.outilId);
  else ouvrirCommentaires(b.dataset.outilId);
});
let minuterieRecherche;
search.addEventListener('input', () => {
  clearTimeout(minuterieRecherche);
  minuterieRecherche = setTimeout(render, 150);
});
render();                       // liste d'origine tout de suite
await chargerFiches();          // puis les fiches et commentaires enregistrés
await chargerSession();
render();
