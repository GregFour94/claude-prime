// Tests du Worker (fiches + commentaires dans R2, protection des modifications).
// Lancement : npm run test:worker
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
import { OUTILS_INITIAUX } from '../outils-data.js';
import { R2Memoire } from './helpers/r2-memoire.mjs';
import { preparerAcces, envProtege, EDITEUR, AUTRE_PERSONNE, AUD_TEST } from './helpers/acces.mjs';

const ORIGINE = 'https://outils.test';
const A = OUTILS_INITIAUX[0]; // Aider
const B = OUTILS_INITIAUX[1]; // Claude Code
const cle = id => `fiches/${id}.json`;

let acces;
before(async () => { acces = await preparerAcces(); });
after(() => acces.restaurer());

async function appel(env, methode, chemin, { jeton, corps, origine = ORIGINE, entetes = {} } = {}) {
  const headers = { ...entetes };
  if (jeton) headers['Cf-Access-Jwt-Assertion'] = jeton;
  if (origine && methode !== 'GET') headers.Origin = origine;
  if (corps !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
  const req = new Request(ORIGINE + chemin, {
    method: methode,
    headers,
    body: corps === undefined ? undefined : (typeof corps === 'string' ? corps : JSON.stringify(corps))
  });
  const rep = await worker.fetch(req, env);
  const texte = await rep.text();
  let donnees = null;
  try { donnees = JSON.parse(texte); } catch (e) { /* réponse non JSON */ }
  return { status: rep.status, donnees, entetes: rep.headers };
}

const lire = env => appel(env, 'GET', '/api/fiches');
const ficheDe = (lecture, id) => lecture.donnees.fiches.find(f => f.outilId === id);

async function envInitialise() {
  const r2 = new R2Memoire();
  const env = envProtege(r2);
  const r = await appel(env, 'POST', '/api/admin/initialisation', { jeton: await acces.jeton() });
  assert.equal(r.status, 200);
  return { r2, env };
}

async function modifier(env, id, changements, { version, jeton } = {}) {
  const actuelle = ficheDe(await lire(env), id);
  return appel(env, 'PUT', `/api/admin/fiches/${id}`, {
    jeton: jeton || await acces.jeton(),
    corps: { version: version ?? actuelle.version, champs: { ...actuelle.champs, ...changements }, types: actuelle.types }
  });
}

describe('protection non configurée : modifications désactivées', () => {
  const manques = {
    'aucun réglage': { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '', EDITEURS: '' },
    'ACCESS_TEAM_DOMAIN manquant': { ACCESS_TEAM_DOMAIN: '' },
    'ACCESS_TEAM_DOMAIN hors cloudflareaccess.com': { ACCESS_TEAM_DOMAIN: 'pirate.example.com' },
    'ACCESS_AUD manquant': { ACCESS_AUD: '' },
    'EDITEURS vide': { EDITEURS: ' , ' }
  };
  for (const [titre, extra] of Object.entries(manques)) {
    it(titre, async () => {
      const r2 = new R2Memoire();
      const env = envProtege(r2, extra);
      const jeton = await acces.jeton();
      for (const [m, chemin, corps] of [
        ['GET', '/api/admin/session'],
        ['POST', '/api/admin/initialisation', {}],
        ['PUT', `/api/admin/fiches/${A.outilId}`, { version: 1, champs: {}, types: {} }],
        ['POST', `/api/admin/fiches/${A.outilId}/commentaires`, { texte: 'test' }]
      ]) {
        const r = await appel(env, m, chemin, { jeton, corps });
        assert.equal(r.status, 503, `${m} ${chemin}`);
        assert.equal(r.donnees.code, 'modifications_desactivees');
      }
      assert.equal(r2.ecritures, 0);
      assert.equal((await lire(env)).status, 200, 'la lecture reste possible');
    });
  }
});

describe('accès non autorisé', () => {
  let r2, env, ecrituresAvant;
  beforeEach(async () => {
    ({ r2, env } = await envInitialise());
    ecrituresAvant = r2.ecritures;
  });
  const routes = () => [
    ['PUT', `/api/admin/fiches/${A.outilId}`, { version: 1, champs: { ...ficheInitialeDe(A).champs, nom: 'Piraté' }, types: ficheInitialeDe(A).types }],
    ['POST', `/api/admin/fiches/${A.outilId}/commentaires`, { texte: 'pirate' }],
    ['POST', '/api/admin/initialisation', {}]
  ];
  const cas = {
    'sans jeton': [async () => undefined, 401],
    'jeton illisible': [async () => 'pas.un.jeton', 401],
    'signé avec une autre clé': [async () => acces.jeton({ cle: acces.pirate }), 401],
    'mauvaise audience': [async () => acces.jeton({ aud: 'autre-application' }), 401],
    'mauvais émetteur': [async () => acces.jeton({ iss: 'https://pirate.cloudflareaccess.com' }), 401],
    'expiré': [async () => acces.jeton({ exp: Math.floor(Date.now() / 1000) - 10 }), 401],
    'pas encore valable': [async () => acces.jeton({ nbf: Math.floor(Date.now() / 1000) + 3600 }), 401],
    'clé inconnue': [async () => acces.jeton({ kid: 'kid-inconnu' }), 401],
    'connecté mais non autorisé': [async () => acces.jeton({ email: AUTRE_PERSONNE }), 403]
  };
  for (const [titre, [fabrique, attendu]] of Object.entries(cas)) {
    it(`${titre} → ${attendu}, rien n'est écrit`, async () => {
      const jeton = await fabrique();
      for (const [m, chemin, corps] of routes()) {
        const r = await appel(env, m, chemin, { jeton, corps });
        assert.equal(r.status, attendu, `${m} ${chemin}`);
      }
      assert.equal(r2.ecritures, ecrituresAvant);
      assert.equal(ficheDe(await lire(env), A.outilId).champs.nom, A.nom);
    });
  }
  it('jeton « alg: none » refusé', async () => {
    const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const faux = b({ alg: 'none', kid: 'cle-test-1' }) + '.' + b({ aud: [AUD_TEST], email: EDITEUR, exp: 9999999999 }) + '.';
    const r = await appel(env, 'POST', `/api/admin/fiches/${A.outilId}/commentaires`, { jeton: faux, corps: { texte: 'x' } });
    assert.equal(r.status, 401);
    assert.equal(r2.ecritures, ecrituresAvant);
  });
  it('envoi depuis un autre site (Origin étrangère ou absente) → 403', async () => {
    const jeton = await acces.jeton();
    for (const origine of ['https://site-pirate.example', null]) {
      const r = await appel(env, 'POST', `/api/admin/fiches/${A.outilId}/commentaires`, { jeton, corps: { texte: 'x' }, origine });
      assert.equal(r.status, 403);
      assert.equal(r.donnees.code, 'origine_refusee');
    }
    assert.equal(r2.ecritures, ecrituresAvant);
  });
  it('session : éditeur autorisé reconnu', async () => {
    const r = await appel(env, 'GET', '/api/admin/session', { jeton: await acces.jeton({ email: 'PROF@ecole.example' }) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.donnees, { modificationsActives: true, autorise: true, email: EDITEUR });
  });
});

function ficheInitialeDe(outil) {
  return {
    champs: { nom: outil.nom, url: outil.url, description: outil.description, categorie: outil.categorie, type: outil.type },
    types: { nom: 'texte', url: 'url', description: 'texteLong', categorie: 'categorie', type: 'texte' }
  };
}

describe('initialisation unique des fiches', () => {
  it('lecture avant initialisation : aucune fiche, 71 manquantes, rien n\'est écrit', async () => {
    const r2 = new R2Memoire();
    const env = envProtege(r2);
    const r = await lire(env);
    assert.equal(r.status, 200);
    assert.deepEqual(r.donnees.fiches, []);
    assert.equal(r.donnees.manquantes, OUTILS_INITIAUX.length);
    assert.equal(r2.ecritures, 0);
  });

  it('crée une fiche JSON par outil avec son outilId, puis ne recrée rien', async () => {
    const { r2, env } = await envInitialise();
    assert.equal(r2.ecritures, OUTILS_INITIAUX.length);
    for (const o of OUTILS_INITIAUX) {
      const f = r2.lireJson(cle(o.outilId));
      assert.equal(f.outilId, o.outilId);
      assert.equal(f.version, 1);
      assert.deepEqual(f.champs, ficheInitialeDe(o).champs);
    }
    const encore = await appel(env, 'POST', '/api/admin/initialisation', { jeton: await acces.jeton() });
    assert.deepEqual(encore.donnees, { creees: 0, dejaPresentes: OUTILS_INITIAUX.length });
    assert.equal(r2.ecritures, OUTILS_INITIAUX.length);
    assert.equal((await lire(env)).donnees.manquantes, 0);
  });

  it('n\'écrase jamais une fiche modifiée (nouvelle initialisation, nouveaux chargements)', async () => {
    const { r2, env } = await envInitialise();
    assert.equal((await modifier(env, A.outilId, { nom: 'Aider modifié' })).status, 200);
    const etag = r2.etag(cle(A.outilId));
    await appel(env, 'POST', '/api/admin/initialisation', { jeton: await acces.jeton() });
    await lire(env);
    await lire(env);
    assert.equal(r2.etag(cle(A.outilId)), etag);
    const f = ficheDe(await lire(env), A.outilId);
    assert.equal(f.champs.nom, 'Aider modifié');
    assert.equal(f.version, 2);
  });

  it('complète seulement les fiches manquantes', async () => {
    const r2 = new R2Memoire();
    const env = envProtege(r2);
    r2.ecrireJson(cle(A.outilId), { outilId: A.outilId, version: 7, champs: { ...ficheInitialeDe(A).champs, nom: 'Déjà là' }, types: ficheInitialeDe(A).types });
    const r = await appel(env, 'POST', '/api/admin/initialisation', { jeton: await acces.jeton() });
    assert.deepEqual(r.donnees, { creees: OUTILS_INITIAUX.length - 1, dejaPresentes: 1 });
    assert.equal(r2.lireJson(cle(A.outilId)).champs.nom, 'Déjà là');
  });
});

describe('modifier chaque champ puis recharger', () => {
  const nouvellesValeurs = {
    nom: 'Aider (renommé)',
    url: 'https://aider.chat/',
    description: 'Nouvelle description,\navec un retour à la ligne.',
    categorie: 'learning',
    type: 'Terminal'
  };
  for (const [champ, valeur] of Object.entries(nouvellesValeurs)) {
    it(`champ « ${champ} »`, async () => {
      const { env } = await envInitialise();
      const r = await modifier(env, A.outilId, { [champ]: valeur });
      assert.equal(r.status, 200);
      assert.equal(r.donnees.fiche.version, 2);
      const f = ficheDe(await lire(env), A.outilId); // relecture depuis R2
      assert.equal(f.champs[champ], valeur);
      for (const [autre, v] of Object.entries(ficheInitialeDe(A).champs)) {
        if (autre !== champ) assert.equal(f.champs[autre], v, `${autre} ne doit pas changer`);
      }
    });
  }

  it('URL vidée (outil sans lien) acceptée', async () => {
    const { env } = await envInitialise();
    assert.equal((await modifier(env, A.outilId, { url: '' })).status, 200);
    assert.equal(ficheDe(await lire(env), A.outilId).champs.url, '');
  });

  it('tous les champs d\'un coup, versions successives', async () => {
    const { env } = await envInitialise();
    assert.equal((await modifier(env, A.outilId, nouvellesValeurs)).status, 200);
    assert.equal((await modifier(env, A.outilId, { nom: 'Encore' })).donnees.fiche.version, 3);
    const f = ficheDe(await lire(env), A.outilId);
    assert.deepEqual(f.champs, { ...nouvellesValeurs, nom: 'Encore' });
  });

  describe('champs personnalisés : conservés et types préservés', () => {
    const typesPerso = { gratuit: 'booleen', note: 'nombre', testeLe: 'date', langages: 'liste', remarque: 'texteLong', alias: 'texte', documentation: 'url' };
    const valeursPerso = { gratuit: false, note: 0, testeLe: '2026-11-01', langages: ['Python', 'JavaScript'], remarque: 'Ligne 1\nLigne 2', alias: 'aider-chat', documentation: 'https://aider.chat/docs/' };

    async function envAvecPerso() {
      const ctx = await envInitialise();
      const base = ficheInitialeDe(A);
      ctx.r2.ecrireJson(cle(A.outilId), {
        outilId: A.outilId, version: 1,
        champs: { ...base.champs, ...valeursPerso }, types: { ...base.types, ...typesPerso },
        creeLe: '2026-11-01T00:00:00.000Z', modifieLe: '2026-11-01T00:00:00.000Z'
      });
      return ctx;
    }

    it('modifier chaque champ personnalisé, recharger, vérifier valeur et type', async () => {
      const { env } = await envAvecPerso();
      const modifs = { gratuit: true, note: 4.5, testeLe: '2026-12-24', langages: ['Go'], remarque: 'Remarque', alias: 'autre', documentation: 'http://exemple.org/doc' };
      for (const [champ, valeur] of Object.entries(modifs)) {
        assert.equal((await modifier(env, A.outilId, { [champ]: valeur })).status, 200, champ);
      }
      const f = ficheDe(await lire(env), A.outilId);
      assert.deepEqual(f.champs, { ...ficheInitialeDe(A).champs, ...modifs });
      assert.deepEqual(f.types, { ...ficheInitialeDe(A).types, ...typesPerso });
      assert.equal(typeof f.champs.gratuit, 'boolean');
      assert.equal(typeof f.champs.note, 'number');
      assert.ok(Array.isArray(f.champs.langages));
    });

    it('false, 0 et liste vide restent false, 0 et []', async () => {
      const { env } = await envAvecPerso();
      assert.equal((await modifier(env, A.outilId, { nom: 'X', langages: [] })).status, 200);
      const f = ficheDe(await lire(env), A.outilId);
      assert.strictEqual(f.champs.gratuit, false);
      assert.strictEqual(f.champs.note, 0);
      assert.deepEqual(f.champs.langages, []);
    });

    it('supprimer un champ personnalisé est refusé', async () => {
      const { r2, env } = await envAvecPerso();
      const f = ficheDe(await lire(env), A.outilId);
      const { gratuit, ...champs } = f.champs;
      const { gratuit: t, ...types } = f.types;
      const r = await appel(env, 'PUT', `/api/admin/fiches/${A.outilId}`, { jeton: await acces.jeton(), corps: { version: f.version, champs, types } });
      assert.equal(r.status, 400);
      assert.ok(r.donnees.erreurs.some(e => e.champ === 'gratuit'));
      assert.strictEqual(r2.lireJson(cle(A.outilId)).champs.gratuit, false);
    });

    it('changer le type d\'un champ existant est refusé', async () => {
      const { env } = await envAvecPerso();
      const f = ficheDe(await lire(env), A.outilId);
      const r = await appel(env, 'PUT', `/api/admin/fiches/${A.outilId}`, {
        jeton: await acces.jeton(),
        corps: { version: f.version, champs: { ...f.champs, gratuit: 'oui' }, types: { ...f.types, gratuit: 'texte' } }
      });
      assert.equal(r.status, 400);
    });
  });
});

describe('commentaires', () => {
  it('commenter A sans toucher B', async () => {
    const { r2, env } = await envInitialise();
    const etagA = r2.etag(cle(A.outilId)), etagB = r2.etag(cle(B.outilId));
    const r = await appel(env, 'POST', `/api/admin/fiches/${A.outilId}/commentaires`, { jeton: await acces.jeton(), corps: { texte: 'Très utile en terminal.' } });
    assert.equal(r.status, 201);
    const l = await lire(env);
    assert.equal(l.donnees.commentaires[A.outilId].length, 1);
    assert.equal(l.donnees.commentaires[A.outilId][0].texte, 'Très utile en terminal.');
    assert.equal(l.donnees.commentaires[B.outilId], undefined);
    assert.equal(r2.etag(cle(A.outilId)), etagA, 'la fiche A n\'est pas réécrite');
    assert.equal(r2.etag(cle(B.outilId)), etagB, 'la fiche B n\'est pas touchée');
    assert.equal(ficheDe(l, A.outilId).version, 1);
    const objets = [...r2.objets.keys()].filter(k => k.startsWith('commentaires/'));
    assert.equal(objets.length, 1, 'un objet R2 séparé par commentaire');
    assert.ok(objets[0].startsWith(`commentaires/${A.outilId}/`));
  });

  it('changer l\'URL (et le nom) de A ne perd pas ses commentaires', async () => {
    const { env } = await envInitialise();
    const jeton = await acces.jeton();
    for (const texte of ['Premier', 'Second']) {
      assert.equal((await appel(env, 'POST', `/api/admin/fiches/${A.outilId}/commentaires`, { jeton, corps: { texte } })).status, 201);
    }
    const avant = (await lire(env)).donnees.commentaires[A.outilId];
    assert.equal((await modifier(env, A.outilId, { url: 'https://nouvelle-adresse.example/', nom: 'Nouveau nom' })).status, 200);
    const l = await lire(env);
    assert.equal(ficheDe(l, A.outilId).champs.url, 'https://nouvelle-adresse.example/');
    assert.deepEqual(l.donnees.commentaires[A.outilId], avant);
    assert.deepEqual(avant.map(c => c.texte), ['Premier', 'Second']);
  });

  it('le texte est conservé tel quel (y compris du HTML), sans adresse e-mail publique', async () => {
    const { r2, env } = await envInitialise();
    const texte = '<img src=x onerror="alert(1)"> <b>gras</b>';
    await appel(env, 'POST', `/api/admin/fiches/${A.outilId}/commentaires`, { jeton: await acces.jeton(), corps: { texte } });
    await modifier(env, A.outilId, { nom: 'Aider 2' });
    const l = await lire(env);
    const c = l.donnees.commentaires[A.outilId][0];
    assert.equal(c.texte, texte);
    assert.equal(c.auteur, undefined);
    assert.equal(ficheDe(l, A.outilId).modifiePar, undefined);
    const stocke = r2.lireJson([...r2.objets.keys()].find(k => k.startsWith('commentaires/')));
    assert.equal(stocke.auteur, EDITEUR, 'l\'auteur reste enregistré dans R2');
  });

  it('commentaire sur un outil sans fiche → 404', async () => {
    const { env } = await envInitialise();
    const r = await appel(env, 'POST', '/api/admin/fiches/o-00000000/commentaires', { jeton: await acces.jeton(), corps: { texte: 'x' } });
    assert.equal(r.status, 404);
  });
});

describe('envois invalides refusés sans rien écrire', () => {
  const invalides = {
    'URL javascript:': { url: 'javascript:alert(1)' },
    'URL ftp:': { url: 'ftp://exemple.org/' },
    'URL sans schéma': { url: 'exemple.org' },
    'URL avec identifiants': { url: 'https://moi:secret@exemple.org/' },
    'URL trop longue': { url: 'https://exemple.org/' + 'a'.repeat(500) },
    'nom vide': { nom: '   ' },
    'nom trop long': { nom: 'n'.repeat(81) },
    'description trop longue': { description: 'd'.repeat(301) },
    'type trop long': { type: 't'.repeat(31) },
    'catégorie inconnue': { categorie: 'inconnue' },
    'nom non textuel': { nom: 42 },
    'nom avec caractère de contrôle': { nom: 'Ai\u0000der' }
  };
  for (const [titre, changement] of Object.entries(invalides)) {
    it(titre, async () => {
      const { r2, env } = await envInitialise();
      const n = r2.ecritures;
      const r = await modifier(env, A.outilId, changement);
      assert.equal(r.status, 400);
      assert.equal(r.donnees.code, 'invalide');
      assert.ok(r.donnees.erreurs.length > 0);
      assert.equal(r2.ecritures, n);
    });
  }

  it('types personnalisés mal formés', async () => {
    const { r2, env } = await envInitialise();
    const base = ficheInitialeDe(A);
    r2.ecrireJson(cle(A.outilId), { outilId: A.outilId, version: 1, champs: { ...base.champs, gratuit: true, note: 1, testeLe: '2026-01-01', langages: ['a'] }, types: { ...base.types, gratuit: 'booleen', note: 'nombre', testeLe: 'date', langages: 'liste' } });
    const n = r2.ecritures;
    for (const changement of [{ gratuit: 'true' }, { note: '3' }, { note: Infinity }, { testeLe: '2026-02-30' }, { testeLe: '01/02/2026' }, { langages: [1] }, { langages: 'a' }, { langages: Array(51).fill('x') }]) {
      const r = await modifier(env, A.outilId, changement);
      assert.equal(r.status, 400, JSON.stringify(changement));
    }
    assert.equal(r2.ecritures, n);
  });

  it('corps mal formés', async () => {
    const { r2, env } = await envInitialise();
    const jeton = await acces.jeton();
    const n = r2.ecritures;
    const chemin = `/api/admin/fiches/${A.outilId}`;
    assert.equal((await appel(env, 'PUT', chemin, { jeton, corps: '{pas du json' })).status, 400);
    assert.equal((await appel(env, 'PUT', chemin, { jeton, corps: '[]' })).status, 400);
    assert.equal((await appel(env, 'PUT', chemin, { jeton, corps: { champs: {}, types: {} } })).status, 400, 'version manquante');
    assert.equal((await appel(env, 'PUT', chemin, { jeton, corps: 'x', entetes: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await appel(env, 'PUT', chemin, { jeton, corps: { version: 1, x: 'a'.repeat(40000) } })).status, 413);
    assert.equal((await appel(env, 'PUT', '/api/admin/fiches/..%2Fsecret', { jeton, corps: { version: 1 } })).status, 400);
    assert.equal((await appel(env, 'PUT', '/api/admin/fiches/o-00000000', { jeton, corps: { version: 1, ...ficheInitialeDe(A) } })).status, 404);
    for (const texte of ['', '   ', 'c'.repeat(1001), 12]) {
      const r = await appel(env, 'POST', `${chemin}/commentaires`, { jeton, corps: { texte } });
      assert.equal(r.status, 400, JSON.stringify(texte).slice(0, 20));
    }
    assert.equal(r2.ecritures, n);
  });
});

describe('éditions concurrentes', () => {
  it('deux personnes partent de la même version : la seconde reçoit un conflit', async () => {
    const { r2, env } = await envInitialise();
    const premier = await modifier(env, A.outilId, { nom: 'Version de Prof' }, { version: 1 });
    assert.equal(premier.status, 200);
    const second = await modifier(env, A.outilId, { nom: 'Version de l\'autre éditeur', description: 'Autre' }, {
      version: 1, jeton: await acces.jeton({ email: 'autre-editeur@ecole.example' })
    });
    assert.equal(second.status, 409);
    assert.equal(second.donnees.code, 'conflit');
    assert.equal(second.donnees.fiche.version, 2);
    assert.equal(second.donnees.fiche.champs.nom, 'Version de Prof');
    assert.equal(r2.lireJson(cle(A.outilId)).champs.nom, 'Version de Prof');
  });

  it('écriture concurrente entre la lecture et l\'écriture : conflit, pas d\'écrasement', async () => {
    const { r2, env } = await envInitialise();
    const f = ficheDe(await lire(env), A.outilId);
    r2.avantPut = async () => {
      r2.ecrireJson(cle(A.outilId), { ...r2.lireJson(cle(A.outilId)), version: 2, champs: { ...f.champs, nom: 'Écrit pendant ce temps' } });
    };
    const r = await appel(env, 'PUT', `/api/admin/fiches/${A.outilId}`, {
      jeton: await acces.jeton(), corps: { version: 1, champs: { ...f.champs, nom: 'Mon nom' }, types: f.types }
    });
    assert.equal(r.status, 409);
    assert.equal(r2.lireJson(cle(A.outilId)).champs.nom, 'Écrit pendant ce temps');
  });
});

describe('lecture publique et routes', () => {
  it('CORS en lecture seule pour les origines déclarées', async () => {
    const { env } = await envInitialise();
    const ok = await appel(env, 'GET', '/api/fiches', { entetes: { Origin: 'https://gregfour94.github.io' } });
    assert.equal(ok.entetes.get('access-control-allow-origin'), 'https://gregfour94.github.io');
    assert.equal(ok.entetes.get('access-control-allow-credentials'), null);
    const ko = await appel(env, 'GET', '/api/fiches', { entetes: { Origin: 'https://site-pirate.example' } });
    assert.equal(ko.entetes.get('access-control-allow-origin'), null);
    const admin = await appel(env, 'GET', '/api/admin/session', { jeton: await acces.jeton(), entetes: { Origin: 'https://gregfour94.github.io' } });
    assert.equal(admin.entetes.get('access-control-allow-origin'), null, 'aucun CORS sur les routes de modification');
  });

  it('routes inconnues et mauvaises méthodes', async () => {
    const { env } = await envInitialise();
    const jeton = await acces.jeton();
    assert.equal((await appel(env, 'GET', '/api/inconnu')).status, 404);
    assert.equal((await appel(env, 'POST', '/api/fiches', { corps: {} })).status, 405);
    assert.equal((await appel(env, 'GET', `/api/admin/fiches/${A.outilId}`, { jeton })).status, 405);
    assert.equal((await appel(env, 'GET', '/api/admin/inconnu', { jeton })).status, 404);
  });

  it('les clés publiques Access sont mises en cache', () => {
    assert.ok(acces.appelsCles() >= 1);
    assert.ok(acces.appelsCles() < 10, `appels: ${acces.appelsCles()}`);
  });
});
